use crate::error::AppError;
use crate::projects::{service, Project};
use crate::state::AppState;
use tauri::State;

#[tauri::command]
pub async fn list_projects(state: State<'_, AppState>) -> Result<Vec<Project>, AppError> {
    Ok(state.current_vault()?.project_list())
}

#[tauri::command]
pub async fn create_project(
    state: State<'_, AppState>,
    name: String,
    instructions: String,
    provider_id: Option<String>,
) -> Result<Project, AppError> {
    let v = state.current_vault()?;
    service::create(&v, &name, instructions, provider_id)
}

#[tauri::command]
pub async fn update_project(
    state: State<'_, AppState>,
    project: Project,
) -> Result<Project, AppError> {
    let v = state.current_vault()?;
    service::update(&v, project)
}

#[tauri::command]
pub async fn delete_project(state: State<'_, AppState>, id: String) -> Result<(), AppError> {
    let v = state.current_vault()?;
    service::delete(&v, &id)
}
