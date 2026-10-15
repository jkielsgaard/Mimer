use crate::error::AppError;
use crate::import::{self, ImportEvent, ImportPlan, ImportReport};
use crate::state::AppState;
use std::path::PathBuf;
use tauri::ipc::Channel;
use tauri::State;
use tokio_util::sync::CancellationToken;

/// Looks through a folder and lists what an import would do. Nothing is copied.
#[tauri::command]
pub async fn scan_import(
    state: State<'_, AppState>,
    source: String,
) -> Result<ImportPlan, AppError> {
    let root = state.current_vault()?.root.clone();
    let source = PathBuf::from(source);
    tauri::async_runtime::spawn_blocking(move || {
        import::ensure_outside_vault(&root, &source)?;
        import::scan(&source)
    })
    .await
    .map_err(|e| AppError::Io(e.to_string()))?
}

/// Copies the folder into the vault, reporting progress through the channel.
#[tauri::command]
pub async fn run_import(
    state: State<'_, AppState>,
    source: String,
    dest_folder: String,
    channel: Channel<ImportEvent>,
) -> Result<ImportReport, AppError> {
    let vault = state.current_vault()?;
    let token = CancellationToken::new();
    {
        let mut job = state
            .import_job
            .lock()
            .map_err(|_| AppError::Io("State lock poisoned".into()))?;
        if job.is_some() {
            return Err(AppError::Conflict("An import is already running".into()));
        }
        *job = Some(token.clone());
    }
    let source = PathBuf::from(source);
    let result = tauri::async_runtime::spawn_blocking(move || {
        import::run(&vault, &source, &dest_folder, &token, &|done, total| {
            let _ = channel.send(ImportEvent::Progress { done, total });
        })
    })
    .await
    .map_err(|e| AppError::Io(e.to_string()));
    if let Ok(mut job) = state.import_job.lock() {
        *job = None;
    }
    result?
}

/// Stops the running import after the current file.
#[tauri::command]
pub async fn cancel_import(state: State<'_, AppState>) -> Result<(), AppError> {
    if let Some(token) = state
        .import_job
        .lock()
        .map_err(|_| AppError::Io("State lock poisoned".into()))?
        .as_ref()
    {
        token.cancel();
    }
    Ok(())
}
