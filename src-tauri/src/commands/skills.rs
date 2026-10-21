use crate::error::AppError;
use crate::skills::{self, Skill};
use crate::state::AppState;
use std::path::PathBuf;
use tauri::State;

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
