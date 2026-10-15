use crate::error::AppError;
use crate::links::index_page;
use crate::state::AppState;
use tauri::State;

/// Creates the index page of a folder, or refreshes its list of links. Returns the note's path.
#[tauri::command]
pub async fn create_index_page(
    state: State<'_, AppState>,
    folder: String,
) -> Result<String, AppError> {
    let v = state.current_vault()?;
    index_page::create_or_update(&v, &folder)
}
