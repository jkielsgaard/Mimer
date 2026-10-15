use crate::error::AppError;
use crate::state::AppState;
use crate::vault::images::{self, ImageUsage};
use tauri::State;

/// Copies picture files chosen in the file dialog into the vault; returns the links for the note.
#[tauri::command]
pub async fn add_images(
    state: State<'_, AppState>,
    note_path: String,
    files: Vec<String>,
) -> Result<Vec<String>, AppError> {
    let v = state.current_vault()?;
    tauri::async_runtime::spawn_blocking(move || images::add_images(&v, &note_path, &files))
        .await
        .map_err(|e| AppError::Io(e.to_string()))?
}

/// Every image in the vault with the notes that show it.
#[tauri::command]
pub async fn image_usage(state: State<'_, AppState>) -> Result<Vec<ImageUsage>, AppError> {
    let v = state.current_vault()?;
    tauri::async_runtime::spawn_blocking(move || images::usage(&v))
        .await
        .map_err(|e| AppError::Io(e.to_string()))?
}
