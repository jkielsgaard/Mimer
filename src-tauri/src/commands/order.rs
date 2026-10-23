use crate::error::AppError;
use crate::order::{self, TreeOrder};
use crate::state::AppState;
use tauri::State;

/// The hand-made order of the file tree.
#[tauri::command]
pub async fn get_tree_order(state: State<'_, AppState>) -> Result<TreeOrder, AppError> {
    Ok(order::load(&state.current_vault()?.root))
}

/// Saves the order of one folder. The change is committed with the next autosave.
#[tauri::command]
pub async fn set_folder_order(
    state: State<'_, AppState>,
    folder: String,
    names: Vec<String>,
) -> Result<(), AppError> {
    order::set_folder(&state.current_vault()?.root, &folder, &names)
}

/// The epic tasks in the order the user chose (note paths).
#[tauri::command]
pub async fn get_epic_order(state: State<'_, AppState>) -> Result<Vec<String>, AppError> {
    Ok(order::load_epics(&state.current_vault()?.root))
}

/// Saves the order of the epic tasks. The change is committed with the next autosave.
#[tauri::command]
pub async fn set_epic_order(
    state: State<'_, AppState>,
    epics: Vec<String>,
) -> Result<(), AppError> {
    order::set_epics(&state.current_vault()?.root, &epics)
}
