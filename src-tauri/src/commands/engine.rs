use crate::engine::catalog::{self, Catalog};
use crate::engine::hardware::{self, HardwareInfo};
use crate::engine::{service, EngineStatus, InstallRequest, RemoveWhat};
use crate::error::AppError;
use tauri::AppHandle;

/// What this computer has (processor, graphics cards, memory), to pre-select the choices.
#[tauri::command]
pub async fn engine_hardware() -> Result<HardwareInfo, AppError> {
    tokio::task::spawn_blocking(hardware::detect)
        .await
        .map_err(|e| AppError::Io(e.to_string()))
}

/// The engine builds and models that can be downloaded here.
#[tauri::command]
pub async fn engine_catalog() -> Result<Catalog, AppError> {
    Ok(catalog::catalog())
}

#[tauri::command]
pub async fn engine_status(app: AppHandle) -> Result<EngineStatus, AppError> {
    Ok(service::status(&app))
}

/// Downloads the engine and the model. Progress and problems arrive in the status.
#[tauri::command]
pub async fn engine_install(app: AppHandle, request: InstallRequest) -> Result<(), AppError> {
    service::start_install(&app, request)
}

#[tauri::command]
pub async fn engine_cancel_install(app: AppHandle) -> Result<(), AppError> {
    service::cancel_install(&app);
    Ok(())
}

/// Copies a model file of the user's own into Mimer's folder.
#[tauri::command]
pub async fn engine_add_model(app: AppHandle, path: String) -> Result<(), AppError> {
    service::add_model(&app, &path)
}

/// Loads the model. The result arrives in the status.
#[tauri::command]
pub async fn engine_wake(app: AppHandle) -> Result<(), AppError> {
    service::wake(&app)
}

/// Unloads the model and frees the memory.
#[tauri::command]
pub async fn engine_sleep(app: AppHandle) -> Result<(), AppError> {
    service::sleep(&app).await
}

#[tauri::command]
pub async fn engine_remove(app: AppHandle, what: RemoveWhat) -> Result<(), AppError> {
    service::remove(&app, what).await
}
