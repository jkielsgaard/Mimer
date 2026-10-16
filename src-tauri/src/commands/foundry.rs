use crate::error::AppError;
use crate::foundry::service::{self, FoundryRemove};
use crate::foundry::{FoundryModel, FoundryStatus};
use tauri::AppHandle;

/// The models Foundry Local offers on this computer that can call tools.
#[tauri::command]
pub async fn foundry_catalog(app: AppHandle, refresh: bool) -> Result<Vec<FoundryModel>, AppError> {
    service::catalog(&app, refresh).await
}

#[tauri::command]
pub async fn foundry_status(app: AppHandle) -> Result<FoundryStatus, AppError> {
    Ok(service::status(&app))
}

/// Downloads the hardware parts and the model. Progress and problems arrive in the status.
#[tauri::command]
pub async fn foundry_install(
    app: AppHandle,
    alias: String,
    use_for_mimer: bool,
) -> Result<(), AppError> {
    service::start_install(&app, alias, use_for_mimer)
}

/// Downloads only the hardware parts, so the model list shows what this computer can run.
#[tauri::command]
pub async fn foundry_setup_hardware(app: AppHandle) -> Result<(), AppError> {
    service::start_hardware(&app)
}

#[tauri::command]
pub async fn foundry_cancel_install(app: AppHandle) -> Result<(), AppError> {
    service::cancel_install(&app);
    Ok(())
}

/// Loads the chosen model. The result arrives in the status.
#[tauri::command]
pub async fn foundry_wake(app: AppHandle) -> Result<(), AppError> {
    service::wake(&app)
}

/// Unloads the model and frees the memory.
#[tauri::command]
pub async fn foundry_sleep(app: AppHandle) -> Result<(), AppError> {
    service::sleep(&app).await
}

#[tauri::command]
pub async fn foundry_remove(app: AppHandle, what: FoundryRemove) -> Result<(), AppError> {
    service::remove(&app, what).await
}
