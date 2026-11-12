use crate::helper::{self, HelperStatus, KeyStatus};
use tauri::AppHandle;

/// What the taskbar helper is doing: whether it works here and how its keys went.
#[tauri::command]
pub async fn helper_status() -> HelperStatus {
    helper::status()
}

/// Whether text typed as a key combination can be used (it is only read, not taken).
#[tauri::command]
pub async fn helper_check_key(text: String) -> KeyStatus {
    match helper::parse_key(&text) {
        Ok(_) => KeyStatus {
            ok: true,
            problem: String::new(),
        },
        Err(problem) => KeyStatus { ok: false, problem },
    }
}

/// Closes the small window of the helper.
#[tauri::command]
pub async fn quick_close(app: AppHandle) {
    helper::close_quick(&app);
}
