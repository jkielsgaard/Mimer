use crate::error::AppError;
use crate::meta;
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
    let v = state.current_vault()?;
    let mut tags = v.with_index(search::all_tags)?;
    // The pinned notes are in `.vault/meta.json`, not in the notes' tags, so the index does not
    // know them; the old tag, where a note still has it, is already counted.
    let pinned = meta::load(&v.root).pinned.len();
    if pinned > 0 {
        let extra = i64::try_from(pinned).unwrap_or(i64::MAX);
        match tags.iter_mut().find(|t| t.tag == "pinned") {
            Some(t) => t.count = t.count.max(extra),
            None => tags.push(TagCount {
                tag: "pinned".into(),
                count: extra,
            }),
        }
    }
    Ok(tags)
}
