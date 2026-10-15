use crate::error::AppError;
use crate::export::{self, ExportRequest, ExportResult};
use crate::state::AppState;
use std::path::PathBuf;
use tauri::State;

/// Writes an HTML or Word export to the path the user chose in the save dialog.
#[tauri::command]
pub async fn export_document(
    state: State<'_, AppState>,
    request: ExportRequest,
    target_path: String,
) -> Result<ExportResult, AppError> {
    let v = state.current_vault()?;
    tauri::async_runtime::spawn_blocking(move || {
        export::run(&v, &request, &PathBuf::from(target_path))
    })
    .await
    .map_err(|e| AppError::Io(e.to_string()))?
}

/// The HTML for the print view (PDF export).
#[tauri::command]
pub async fn export_preview_html(
    state: State<'_, AppState>,
    request: ExportRequest,
) -> Result<String, AppError> {
    let v = state.current_vault()?;
    tauri::async_runtime::spawn_blocking(move || export::preview_html(&v, &request))
        .await
        .map_err(|e| AppError::Io(e.to_string()))?
}

/// Opens the system print dialog for the main window (choose "Save as PDF" there).
#[tauri::command]
pub async fn print_window(window: tauri::WebviewWindow) -> Result<(), AppError> {
    window
        .print()
        .map_err(|e| AppError::Io(format!("Printing is not available: {e}")))
}
