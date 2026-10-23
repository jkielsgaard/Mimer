use crate::error::AppError;
use crate::phisilica::{self, PhiStatus, PhiTest, PROGRESS_EVENT};
use tauri::{AppHandle, Emitter};

/// What Windows says about Phi Silica on this PC (only shown in the Store package).
#[tauri::command]
pub async fn phi_status() -> Result<PhiStatus, AppError> {
    tokio::task::spawn_blocking(phisilica::status)
        .await
        .map_err(|e| AppError::Provider(format!("Phi Silica stopped: {e}")))
}

/// Asks Windows to fetch the model. Progress arrives as `phi://progress` (0–100).
#[tauri::command]
pub async fn phi_ensure_ready(app: AppHandle) -> Result<PhiStatus, AppError> {
    phisilica::ensure_ready(move |pct| {
        let _ = app.emit(PROGRESS_EVENT, pct);
    })
    .await
}

/// Sends the test sentence and shows the answer.
#[tauri::command]
pub async fn phi_test() -> Result<PhiTest, AppError> {
    Ok(phisilica::test().await)
}
