use crate::error::AppError;
use crate::research::{self, ResearchSpec};
use chrono::Local;

/// The prompt for a cloud AI with internet access, built from the research dialog.
#[tauri::command]
pub async fn build_research_prompt(spec: ResearchSpec) -> Result<String, AppError> {
    research::build_prompt(&spec, &Local::now().format("%Y-%m-%d").to_string())
}
