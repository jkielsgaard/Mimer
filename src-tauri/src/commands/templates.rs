use crate::error::AppError;
use crate::state::AppState;
use crate::templates::standard::{self, SeedReport, StandardKind};
use crate::templates::{self, TemplateInfo};
use crate::vault::VaultConfig;
use chrono::{Local, NaiveDate};
use tauri::State;

#[tauri::command]
pub async fn list_templates(state: State<'_, AppState>) -> Result<Vec<TemplateInfo>, AppError> {
    Ok(templates::list(&state.current_vault()?.root))
}

#[tauri::command]
pub async fn create_note_from_template(
    state: State<'_, AppState>,
    folder: String,
    name: String,
    template: Option<String>,
) -> Result<String, AppError> {
    let v = state.current_vault()?;
    templates::create_note_from_template(&v, &folder, &name, template.as_deref(), &Local::now())
}

/// Creates a meeting note or a quick note in its folder from the standard template.
#[tauri::command]
pub async fn create_standard_note(
    state: State<'_, AppState>,
    kind: StandardKind,
    title: Option<String>,
) -> Result<String, AppError> {
    let v = state.current_vault()?;
    standard::create_standard_note(&v, kind, title.as_deref(), &Local::now())
}

/// Adds the standard folders and templates that are missing (never overwrites anything).
#[tauri::command]
pub async fn seed_standard_templates(state: State<'_, AppState>) -> Result<SeedReport, AppError> {
    let v = state.current_vault()?;
    standard::seed_defaults(&v)
}

#[tauri::command]
pub async fn open_daily_note(state: State<'_, AppState>) -> Result<String, AppError> {
    let v = state.current_vault()?;
    let now = Local::now();
    templates::open_daily_note(&v, None::<NaiveDate>, &now)
}

#[tauri::command]
pub async fn save_template_from_note(
    state: State<'_, AppState>,
    note_path: String,
    name: String,
) -> Result<TemplateInfo, AppError> {
    let v = state.current_vault()?;
    templates::save_from_note(&v, &note_path, &name)
}

#[tauri::command]
pub async fn update_vault_config(
    state: State<'_, AppState>,
    config: VaultConfig,
) -> Result<VaultConfig, AppError> {
    let v = state.current_vault()?;
    let saved = v.set_config(config)?;
    Ok(saved)
}
