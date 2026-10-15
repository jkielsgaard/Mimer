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

/// Called by the frontend after it flushed pending writes in response to a close request.
#[tauri::command]
pub async fn finish_close(app: AppHandle) {
    commit_on_close(&app);
    app.exit(0);
}
