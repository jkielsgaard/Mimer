use crate::git::{CommitKind, CommitReason};
use crate::state::AppState;
use tauri::{AppHandle, Manager};

/// Commits everything and stops the watcher (best effort).
pub fn commit_on_close(app: &AppHandle) {
    if let Ok(v) = app.state::<AppState>().current_vault() {
        v.stop_watcher();
        if let Err(e) = v.commit(CommitReason::new(CommitKind::AutosaveOnClose, None), None) {
            tracing::warn!("commit on close failed: {e}");
        }
    }
}

/// Shows the main window and closes the start screen (a small window of its own).
pub fn show_main(app: &AppHandle) {
    if let Some(w) = app.get_webview_window("main") {
        let _ = w.show();
        let _ = w.set_focus();
    }
    if let Some(s) = app.get_webview_window("splash") {
        let _ = s.destroy();
    }
}

/// Called by the frontend when the app has loaded and the start screen has been seen.
#[tauri::command]
pub async fn splash_done(app: AppHandle) {
    show_main(&app);
}

/// Called by the frontend after it flushed pending writes in response to a close request.
#[tauri::command]
pub async fn finish_close(app: AppHandle) {
    commit_on_close(&app);
    app.exit(0);
}

/// Where Mimer runs, so the AI choices can be put in the order that suits it.
#[derive(Debug, Clone, serde::Serialize, ts_rs::TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct AppPlatform {
    /// `windows`, `linux` or `macos`.
    pub os: String,
    /// True for the Microsoft Store (MSIX) package.
    pub store: bool,
}

#[tauri::command]
pub async fn app_platform() -> AppPlatform {
    AppPlatform {
        os: std::env::consts::OS.into(),
        store: crate::engine::paths::is_packaged(),
    }
}
