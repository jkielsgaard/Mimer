use crate::error::AppError;
use crate::git::{history, CommitEntry, CommitReason, DeletedFile};
use crate::state::AppState;
use crate::vault::ops;
use tauri::State;

#[tauri::command]
pub async fn commit_now(
    state: State<'_, AppState>,
    reason: CommitReason,
    paths: Option<Vec<String>>,
) -> Result<Option<String>, AppError> {
    state.current_vault()?.commit(reason, paths.as_deref())
}

#[tauri::command]
pub async fn file_history(
    state: State<'_, AppState>,
    path: String,
) -> Result<Vec<CommitEntry>, AppError> {
    state
        .current_vault()?
        .with_repo(|r| history::file_history(r, &path))
}

#[tauri::command]
pub async fn file_at_commit(
    state: State<'_, AppState>,
    path: String,
    sha: String,
) -> Result<String, AppError> {
    state
        .current_vault()?
        .with_repo(|r| history::file_at_commit(r, &path, &sha))
}

#[tauri::command]
pub async fn restore_file(
    state: State<'_, AppState>,
    path: String,
    sha: String,
) -> Result<(), AppError> {
    let v = state.current_vault()?;
    ops::restore_file(&v, &path, &sha)
}

#[tauri::command]
pub async fn deleted_files(state: State<'_, AppState>) -> Result<Vec<DeletedFile>, AppError> {
    state.current_vault()?.with_repo(history::deleted_files)
}

#[tauri::command]
pub async fn restore_deleted(
    state: State<'_, AppState>,
    path: String,
    sha: String,
) -> Result<(), AppError> {
    let v = state.current_vault()?;
    ops::restore_deleted(&v, &path, &sha)
}

/// Undoes the changes of an earlier AI commit (see `ops::undo_commit`). Returns the notes touched.
#[tauri::command]
pub async fn undo_commit(state: State<'_, AppState>, sha: String) -> Result<Vec<String>, AppError> {
    let v = state.current_vault()?;
    ops::undo_commit(&v, &sha)
}
