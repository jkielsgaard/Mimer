use crate::error::AppError;
use crate::skills::{self, Skill};
use crate::state::AppState;
use std::path::PathBuf;
use tauri::{AppHandle, Runtime, State};

fn file(state: &AppState) -> PathBuf {
    state
        .settings_path
        .parent()
        .map(|d| d.join("skills.json"))
        .unwrap_or_else(|| PathBuf::from("skills.json"))
}

/// The built-in skills and the user's own.
#[tauri::command]
pub async fn list_skills(state: State<'_, AppState>) -> Result<Vec<Skill>, AppError> {
    Ok(skills::list(&file(&state)))
}

/// Adds a skill (empty id) or changes one of the user's own.
#[tauri::command]
pub async fn save_skill(state: State<'_, AppState>, skill: Skill) -> Result<Skill, AppError> {
    skills::save(&file(&state), skill)
}

#[tauri::command]
pub async fn remove_skill(state: State<'_, AppState>, id: String) -> Result<(), AppError> {
    skills::remove(&file(&state), &id)?;
    Ok(())
}

/// Tries a skill (saved or not) on one note and returns the model's answer. Nothing is proposed.
#[tauri::command]
pub async fn preview_skill<R: Runtime>(
    app: AppHandle<R>,
    skill: Skill,
    path: String,
) -> Result<crate::ai::skill_run::PreviewResult, AppError> {
    crate::ai::skill_run::preview_skill(&app, &skill, &path).await
}
