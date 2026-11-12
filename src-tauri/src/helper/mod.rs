//! The taskbar helper (Windows only): an icon in the taskbar, and keys that work in every program.
//! One key opens a small window to write something down, another to say where you left off in a
//! task. The helper is part of Mimer, not a program of its own: it uses the vault that is open,
//! and it does nothing unless it is turned on in Settings → General.
//!
//! The code is compiled everywhere, but it only acts on Windows (`supported`). On other systems a
//! global key does not work in every window manager, so the settings show it greyed out.

use crate::settings::HelperSettings;
use crate::state::AppState;
use serde::Serialize;
use std::sync::Mutex;
use tauri::menu::{Menu, MenuItem, PredefinedMenuItem};
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use tauri::{AppHandle, Manager, WebviewUrl, WebviewWindowBuilder};
use tauri_plugin_global_shortcut::{GlobalShortcutExt, Shortcut, ShortcutState};
use ts_rs::TS;

const TRAY_ID: &str = "mimer-helper";
const QUICK_LABEL: &str = "quick";

/// Whether the helper works on this system.
pub fn supported() -> bool {
    cfg!(windows)
}

/// What a key combination came to when it was registered.
#[derive(Debug, Clone, Default, Serialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct KeyStatus {
    pub ok: bool,
    /// Why it does not work, in plain words (empty when it does).
    pub problem: String,
}

/// What the helper is doing now: whether it can run here and how its keys went.
#[derive(Debug, Clone, Default, Serialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct HelperStatus {
    pub supported: bool,
    pub running: bool,
    pub quick_note: KeyStatus,
    pub park: KeyStatus,
}

static LAST: Mutex<Option<HelperStatus>> = Mutex::new(None);

/// The latest result of `apply`.
pub fn status() -> HelperStatus {
    let known = LAST.lock().ok().and_then(|s| s.clone());
    known.unwrap_or(HelperStatus {
        supported: supported(),
        ..HelperStatus::default()
    })
}

/// Reads a key combination written as `Ctrl+Alt+N`. A combination needs a modifier key (Ctrl,
/// Alt or Shift) and a key, so it cannot swallow ordinary typing.
pub fn parse_key(text: &str) -> Result<Shortcut, String> {
    let lower = text.to_lowercase();
    let has_modifier = ["ctrl", "control", "alt", "shift", "win", "super", "cmd"]
        .iter()
        .any(|m| lower.split('+').any(|p| p.trim() == *m));
    if !has_modifier || !text.contains('+') {
        return Err("Use Ctrl, Alt or Shift together with a key, for example Ctrl+Alt+N.".into());
    }
    text.parse::<Shortcut>()
        .map_err(|_| "That is not a key combination Mimer can use.".to_string())
}

fn key_status(result: Result<(), String>) -> KeyStatus {
    match result {
        Ok(()) => KeyStatus {
            ok: true,
            problem: String::new(),
        },
        Err(problem) => KeyStatus { ok: false, problem },
    }
}

/// Puts the helper in the state `h` asks for: the icon and the keys on or off. Returns how it went.
/// It never fails as a whole: a key that cannot be taken (another program has it) is reported next
/// to that key and the other one still works.
pub fn apply(app: &AppHandle, h: &HelperSettings) -> HelperStatus {
    let mut out = HelperStatus {
        supported: supported(),
        ..HelperStatus::default()
    };
    let shortcuts = app.global_shortcut();
    if let Err(e) = shortcuts.unregister_all() {
        tracing::warn!("helper: could not release the keys: {e}");
    }
    if !supported() || !h.enabled {
        app.remove_tray_by_id(TRAY_ID);
        remember(&out);
        return out;
    }
    if h.quick_note_key.eq_ignore_ascii_case(&h.park_key) {
        let same = KeyStatus {
            ok: false,
            problem: "The two functions need different keys.".into(),
        };
        out.quick_note = same.clone();
        out.park = same;
    } else {
        out.quick_note = key_status(register(app, &h.quick_note_key, Mode::Note));
        out.park = key_status(register(app, &h.park_key, Mode::Park));
    }
    out.running = ensure_tray(app).is_ok();
    remember(&out);
    out
}

fn remember(s: &HelperStatus) {
    if let Ok(mut last) = LAST.lock() {
        *last = Some(s.clone());
    }
}

#[derive(Clone, Copy)]
enum Mode {
    Note,
    Park,
}

impl Mode {
    fn word(self) -> &'static str {
        match self {
            Mode::Note => "note",
            Mode::Park => "park",
        }
    }
}

fn register(app: &AppHandle, text: &str, mode: Mode) -> Result<(), String> {
    let shortcut = parse_key(text)?;
    app.global_shortcut()
        .on_shortcut(shortcut, move |app, _s, event| {
            if event.state == ShortcutState::Pressed {
                open_quick(app, mode);
            }
        })
        .map_err(|_| "Another program already uses these keys. Choose others.".to_string())
}

/// Opens the small window, in front of whatever is open, for the mode.
fn open_quick(app: &AppHandle, mode: Mode) {
    if let Some(old) = app.get_webview_window(QUICK_LABEL) {
        let _ = old.destroy();
    }
    let url = format!("index.html?quick={}", mode.word());
    let built = WebviewWindowBuilder::new(app, QUICK_LABEL, WebviewUrl::App(url.into()))
        .title("Mimer")
        .inner_size(560.0, 270.0)
        .resizable(false)
        .decorations(false)
        .always_on_top(true)
        .skip_taskbar(true)
        .center()
        .focused(true)
        .build();
    if let Err(e) = built {
        tracing::warn!("helper: the small window did not open: {e}");
    }
}

/// Shows the main window (from the icon, or when Mimer is started a second time).
pub fn show_main(app: &AppHandle) {
    if let Some(w) = app.get_webview_window("main") {
        let _ = w.unminimize();
        let _ = w.show();
        let _ = w.set_focus();
    }
}

fn ensure_tray(app: &AppHandle) -> tauri::Result<()> {
    if app.tray_by_id(TRAY_ID).is_some() {
        return Ok(());
    }
    let open = MenuItem::with_id(app, "open", "Open Mimer", true, None::<&str>)?;
    let note = MenuItem::with_id(app, "note", "Write something down", true, None::<&str>)?;
    let park = MenuItem::with_id(app, "park", "Where I left off", true, None::<&str>)?;
    let quit = MenuItem::with_id(app, "quit", "Quit Mimer", true, None::<&str>)?;
    let line = PredefinedMenuItem::separator(app)?;
    let menu = Menu::with_items(app, &[&open, &note, &park, &line, &quit])?;
    let mut builder = TrayIconBuilder::with_id(TRAY_ID)
        .tooltip("Mimer")
        .menu(&menu)
        .show_menu_on_left_click(false)
        .on_menu_event(|app, event| match event.id.as_ref() {
            "open" => show_main(app),
            "note" => open_quick(app, Mode::Note),
            "park" => open_quick(app, Mode::Park),
            "quit" => quit_app(app),
            _ => {}
        })
        .on_tray_icon_event(|tray, event| {
            if let TrayIconEvent::Click {
                button: MouseButton::Left,
                button_state: MouseButtonState::Up,
                ..
            } = event
            {
                show_main(tray.app_handle());
            }
        });
    if let Some(icon) = app.default_window_icon() {
        builder = builder.icon(icon.clone());
    }
    builder.build(app)?;
    Ok(())
}

/// Whether closing the main window hides it, and leaves Mimer in the taskbar, instead of ending.
pub fn keeps_running(app: &AppHandle) -> bool {
    let h = app.state::<AppState>().settings_snapshot().helper;
    supported() && h.enabled && h.keep_running && app.tray_by_id(TRAY_ID).is_some()
}

/// Ends Mimer from the icon's menu the way closing the window does: the frontend saves what is
/// being written first, and after five seconds Mimer commits and ends anyway.
pub fn quit_app(app: &AppHandle) {
    use std::sync::atomic::Ordering;
    let state = app.state::<AppState>();
    if state.closing.swap(true, Ordering::SeqCst) {
        return;
    }
    if let Some(w) = app.get_webview_window("main") {
        let _ = tauri::Emitter::emit(&w, "app://close-requested", ());
    }
    let handle = app.clone();
    tauri::async_runtime::spawn(async move {
        tokio::time::sleep(std::time::Duration::from_secs(5)).await;
        crate::commands::app::commit_on_close(&handle);
        handle.exit(0);
    });
}

/// Closes the small window.
pub fn close_quick(app: &AppHandle) {
    if let Some(w) = app.get_webview_window(QUICK_LABEL) {
        let _ = w.destroy();
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_key_combination_needs_a_modifier_and_a_key() {
        assert!(parse_key("Ctrl+Alt+N").is_ok());
        assert!(parse_key("ctrl+shift+p").is_ok());
        assert!(parse_key("N").is_err());
        assert!(parse_key("Ctrl").is_err());
        assert!(parse_key("").is_err());
        assert!(parse_key("Ctrl+Alt+Nonsense").is_err());
    }

    #[test]
    fn it_is_only_supported_where_global_keys_can_be_trusted() {
        assert_eq!(supported(), cfg!(windows));
        assert_eq!(status().supported, supported());
    }
}
