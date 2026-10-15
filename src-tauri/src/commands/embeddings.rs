use crate::embeddings::{self, search, EmbeddingStatus};
use crate::error::AppError;
use crate::search::{search as keyword_search, SearchHit, SearchQuery};
use crate::state::AppState;
use tauri::{AppHandle, State};

#[tauri::command]
pub async fn get_embedding_status(state: State<'_, AppState>) -> Result<EmbeddingStatus, AppError> {
    let settings = state.settings_snapshot();
    let mut status = state
        .embedding_status
        .lock()
        .map_err(|_| AppError::Io("State lock poisoned".into()))?
        .clone();
    status.enabled = settings.ai.embeddings.enabled;
    status.model = settings.ai.embeddings.model.clone();
    if status.state == "disabled" && status.enabled {
        status.state = "idle".into();
    }
    if !status.enabled {
        status.state = "disabled".into();
    }
    if let Ok(v) = state.current_vault() {
        let (notes, chunks) = embeddings::counts(&v, &settings.ai.embeddings.model);
        status.notes = notes;
        status.chunks = chunks;
    }
    Ok(status)
}

#[tauri::command]
pub async fn start_embedding_index(app: AppHandle, rebuild: bool) -> Result<(), AppError> {
    embeddings::spawn_index_job(&app, rebuild)
}

#[tauri::command]
pub async fn cancel_embedding_index(app: AppHandle) -> Result<(), AppError> {
    embeddings::cancel_job(&app);
    Ok(())
}

#[tauri::command]
pub async fn semantic_search(
    state: State<'_, AppState>,
    query: String,
    limit: Option<u32>,
) -> Result<Vec<search::SemanticHit>, AppError> {
    let settings = state.settings_snapshot();
    let (embed, model, _) = embeddings::embedder_for(&settings)?;
    let v = state.current_vault()?;
    let chunks = embeddings::load_vectors(&v, &model)?;
    let q = search::embed_query(&embed, query.trim()).await?;
    Ok(search::rank(
        &chunks,
        &q,
        None,
        limit.unwrap_or(10).clamp(1, 50) as usize,
    ))
}

/// Keyword and meaning results merged with reciprocal rank fusion. Falls back to keywords alone
/// when semantic search is off.
#[tauri::command]
pub async fn hybrid_search(
    state: State<'_, AppState>,
    query: String,
) -> Result<Vec<SearchHit>, AppError> {
    let settings = state.settings_snapshot();
    let v = state.current_vault()?;
    let keyword = v.with_index(|c| {
        keyword_search(
            c,
            &SearchQuery {
                text: query.clone(),
                tag: None,
                folder: None,
            },
        )
    })?;
    let semantic: Vec<search::SemanticHit> =
        if settings.ai.embeddings.enabled && !query.contains("tag:") && !query.contains("path:") {
            let (embed, model, _) = embeddings::embedder_for(&settings)?;
            let chunks = embeddings::load_vectors(&v, &model)?;
            let q = search::embed_query(&embed, query.trim()).await?;
            search::rank(&chunks, &q, None, 20)
        } else {
            Vec::new()
        };
    Ok(search::merge_hybrid(&keyword, &semantic, 50))
}
