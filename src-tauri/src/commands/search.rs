use crate::error::AppError;
use crate::search::{self, Backlink, SearchHit, SearchQuery, TagCount};
use crate::state::AppState;
use tauri::State;

#[tauri::command]
pub async fn search(
    state: State<'_, AppState>,
    query: SearchQuery,
) -> Result<Vec<SearchHit>, AppError> {
    state
        .current_vault()?
        .with_index(|c| search::search(c, &query))
}

#[tauri::command]
pub async fn backlinks(
    state: State<'_, AppState>,
    path: String,
) -> Result<Vec<Backlink>, AppError> {
    let v = state.current_vault()?;
    let resolver = v.resolver();
    v.with_index(|c| search::backlinks(c, &resolver, &v.root, &path))
}

#[tauri::command]
pub async fn all_tags(state: State<'_, AppState>) -> Result<Vec<TagCount>, AppError> {
    state.current_vault()?.with_index(search::all_tags)
}
