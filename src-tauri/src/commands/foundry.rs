use crate::error::AppError;
use crate::foundry::{self, FoundryStatus};

/// Looks for Foundry Local on this computer and returns the address of its service.
#[tauri::command]
pub async fn detect_foundry_local() -> Result<FoundryStatus, AppError> {
    tokio::task::spawn_blocking(foundry::detect)
        .await
        .map_err(|e| AppError::Io(e.to_string()))
}
