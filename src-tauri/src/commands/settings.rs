use crate::ai::providers::{self, ProviderTestResult};
use crate::error::AppError;
use crate::settings::service::IndexAction;
use crate::settings::{self, keychain, Settings};
use crate::state::AppState;
use tauri::{AppHandle, State};

#[tauri::command]
pub async fn get_settings(state: State<'_, AppState>) -> Result<Settings, AppError> {
    if let Some(e) = &state.settings_error {
        return Err(AppError::Settings(e.clone()));
    }
    Ok(state.settings_snapshot())
}

#[tauri::command]
pub async fn update_settings(
    app: AppHandle,
    state: State<'_, AppState>,
    settings: Settings,
) -> Result<(), AppError> {
    match settings::service::apply_update(&state, settings)? {
        IndexAction::Keep => {}
        IndexAction::Stop => crate::embeddings::cancel_job(&app),
        IndexAction::Restart { rebuild } => {
            crate::embeddings::cancel_job(&app);
            if let Err(e) = crate::embeddings::spawn_index_job(&app, rebuild) {
                tracing::warn!("semantic index not started: {e}");
            }
        }
    }
    Ok(())
}

#[tauri::command]
pub async fn set_api_key(provider_id: String, key: String) -> Result<(), AppError> {
    keychain::set_key(&provider_id, &key)
}

#[tauri::command]
pub async fn has_api_key(provider_id: String) -> Result<bool, AppError> {
    Ok(keychain::has_key(&provider_id))
}

#[tauri::command]
pub async fn delete_api_key(provider_id: String) -> Result<(), AppError> {
    keychain::delete_key(&provider_id)
}

#[tauri::command]
pub async fn list_models(
    state: State<'_, AppState>,
    provider_id: String,
) -> Result<Vec<String>, AppError> {
    let p = state
        .settings_snapshot()
        .provider(&provider_id)
        .cloned()
        .ok_or_else(|| AppError::Provider(format!("Unknown provider {provider_id}")))?;
    providers::list_models(
        &providers::http_client()?,
        &p,
        keychain::get_key(&p.id).as_deref(),
    )
    .await
}

#[tauri::command]
pub async fn test_provider(
    state: State<'_, AppState>,
    provider_id: String,
) -> Result<ProviderTestResult, AppError> {
    let p = state
        .settings_snapshot()
        .provider(&provider_id)
        .cloned()
        .ok_or_else(|| AppError::Provider(format!("Unknown provider {provider_id}")))?;
    let result = providers::list_models(
        &providers::http_client()?,
        &p,
        keychain::get_key(&p.id).as_deref(),
    )
    .await;
    Ok(providers::connection_report(&p, result))
}
