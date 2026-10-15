//! Semantic search: chunking, embeddings from a local provider, a vector store and ranking. The background job is started when a vault opens, when settings change, and after
//! file changes.

pub mod chunker;
pub mod client;
pub mod indexer;
pub mod search;
pub mod store;
pub mod vector;

use crate::ai::router;
use crate::error::{AppError, AppResult};
use crate::settings::{keychain, ProviderKind, Settings};
use crate::state::AppState;
use crate::vault::OpenVault;
use client::EmbedFn;
use serde::Serialize;
use std::path::PathBuf;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::{Arc, Mutex};
use tauri::{AppHandle, Emitter, Manager};
use tokio_util::sync::CancellationToken;
use ts_rs::TS;

/// Event name for status updates.
pub const STATUS_EVENT: &str = "embeddings://status";

/// Status shown in Settings and the search panel.
#[derive(Debug, Clone, Serialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct EmbeddingStatus {
    pub enabled: bool,
    /// `disabled`, `idle`, `indexing` or `error`.
    pub state: String,
    pub notes_done: u32,
    pub notes_total: u32,
    pub notes: u32,
    pub chunks: u32,
    pub model: String,
    pub last_error: Option<String>,
}

impl Default for EmbeddingStatus {
    fn default() -> Self {
        Self {
            enabled: false,
            state: "disabled".into(),
            notes_done: 0,
            notes_total: 0,
            notes: 0,
            chunks: 0,
            model: String::new(),
            last_error: None,
        }
    }
}

/// Bumped after every indexing run; the vector cache is valid only for the generation it was loaded in.
static GENERATION: AtomicU64 = AtomicU64::new(0);

struct CachedVectors {
    key: String,
    generation: u64,
    chunks: Arc<Vec<store::StoredChunk>>,
}

static CACHE: Mutex<Option<CachedVectors>> = Mutex::new(None);

/// Path of the vector store in a vault.
pub fn store_path(root: &std::path::Path) -> PathBuf {
    root.join(".vault/embeddings.db")
}

/// All chunks for the model, cached in memory until the next indexing run.
pub fn load_vectors(v: &OpenVault, model: &str) -> AppResult<Arc<Vec<store::StoredChunk>>> {
    let key = format!("{}|{model}", v.root.display());
    let generation = GENERATION.load(Ordering::SeqCst);
    if let Ok(cache) = CACHE.lock() {
        if let Some(c) = cache
            .as_ref()
            .filter(|c| c.key == key && c.generation == generation)
        {
            return Ok(c.chunks.clone());
        }
    }
    let conn = store::open(&store_path(&v.root))?;
    let chunks = Arc::new(store::load_all(&conn, model)?);
    if let Ok(mut cache) = CACHE.lock() {
        *cache = Some(CachedVectors {
            key,
            generation,
            chunks: chunks.clone(),
        });
    }
    Ok(chunks)
}

/// The embedding function and model for the current settings. Refuses when semantic search is off.
pub fn embedder_for(settings: &Settings) -> AppResult<(EmbedFn, String)> {
    let emb = &settings.ai.embeddings;
    if !emb.enabled {
        return Err(AppError::Settings("Semantic search is turned off".into()));
    }
    if emb.model.trim().is_empty() {
        return Err(AppError::Settings(
            "Choose an embedding model in Settings → AI".into(),
        ));
    }
    let provider = router::select_local(settings, Some(&emb.provider_id))?;
    let cfg = provider.config();
    if cfg.kind == ProviderKind::Anthropic {
        return Err(AppError::Provider(
            "This provider cannot create embeddings".into(),
        ));
    }
    let key = keychain::get_key(&cfg.id);
    Ok((
        client::http_embedder(cfg.base_url.clone(), emb.model.clone(), key),
        emb.model.clone(),
    ))
}

fn set_status(app: &AppHandle, f: impl FnOnce(&mut EmbeddingStatus)) {
    let state = app.state::<AppState>();
    let snapshot = match state.embedding_status.lock() {
        Ok(mut s) => {
            f(&mut s);
            s.clone()
        }
        Err(_) => return,
    };
    let _ = app.emit(STATUS_EVENT, snapshot);
}

/// Stops the running indexing job (if any).
pub fn cancel_job(app: &AppHandle) {
    let state = app.state::<AppState>();
    let token = state
        .embedding_job
        .lock()
        .ok()
        .and_then(|mut job| job.take());
    if let Some(token) = token {
        token.cancel();
    }
}

/// Which notes an indexing run covers and how many count toward its progress total.
#[derive(Debug, PartialEq)]
pub struct IndexPlan {
    /// Every Markdown note in the vault.
    pub files: Vec<String>,
    /// Notes that will be embedded.
    pub total: u32,
}

/// Plans an indexing run over the vault's file list. Non-Markdown files are ignored.
pub fn plan_index(all_files: &[String]) -> IndexPlan {
    let files: Vec<String> = all_files
        .iter()
        .filter(|f| crate::vault::tree::is_markdown(f))
        .cloned()
        .collect();
    let total = u32::try_from(files.len()).unwrap_or(u32::MAX);
    IndexPlan { files, total }
}

/// Starts the background indexing job. A running job is cancelled first (its progress is kept).
pub fn spawn_index_job(app: &AppHandle, rebuild: bool) -> AppResult<()> {
    let state = app.state::<AppState>();
    let settings = state.settings_snapshot();
    let v = state.current_vault()?;
    let (embed, model) = embedder_for(&settings)?;
    let IndexPlan { files, total } = plan_index(&v.file_list());
    let token = CancellationToken::new();
    {
        let mut job = state
            .embedding_job
            .lock()
            .map_err(|_| AppError::Io("State lock poisoned".into()))?;
        if let Some(old) = job.replace(token.clone()) {
            old.cancel();
        }
    }
    let model_for_status = model.clone();
    set_status(app, |s| {
        s.enabled = true;
        s.state = "indexing".into();
        s.notes_done = 0;
        s.notes_total = total;
        s.model = model_for_status;
        s.last_error = None;
    });
    let app_task = app.clone();
    let root = v.root.clone();
    tauri::async_runtime::spawn(async move {
        let progress_app = app_task.clone();
        let progress = move |done: u32, total: u32| {
            set_status(&progress_app, |s| {
                s.notes_done = done;
                s.notes_total = total;
            });
        };
        let result = async {
            let mut conn = store::open(&store_path(&root))?;
            indexer::run_index(
                &root, &mut conn, &files, &embed, &model, rebuild, &token, &progress,
            )
            .await
        }
        .await;
        GENERATION.fetch_add(1, Ordering::SeqCst);
        let counts = store::open(&store_path(&root))
            .and_then(|c| store::stats(&c, &model))
            .unwrap_or((0, 0));
        match result {
            Ok(_) => set_status(&app_task, |s| {
                s.state = "idle".into();
                s.notes = counts.0;
                s.chunks = counts.1;
                s.notes_done = s.notes_total;
            }),
            Err(e) => set_status(&app_task, |s| {
                s.state = "error".into();
                s.notes = counts.0;
                s.chunks = counts.1;
                s.last_error = Some(e.to_string());
            }),
        }
    });
    Ok(())
}

/// Opens the store for a vault and returns `(notes, chunks)` for a model (zeros when none).
pub fn counts(v: &OpenVault, model: &str) -> (u32, u32) {
    store::open(&store_path(&v.root))
        .and_then(|c| store::stats(&c, model))
        .unwrap_or((0, 0))
}

/// What a settings change means for indexing: `None` when nothing relevant changed,
/// `Some(rebuild)` when indexing must restart (rebuild when the model or provider changed).
pub fn index_change(
    before: &crate::settings::EmbeddingSettings,
    after: &crate::settings::EmbeddingSettings,
) -> Option<bool> {
    let changed = before.enabled != after.enabled
        || before.provider_id != after.provider_id
        || before.model != after.model;
    if !changed {
        return None;
    }
    Some(before.model != after.model || before.provider_id != after.provider_id)
}

/// Whether the semantic search tool may be offered to the assistant. False when semantic search
/// is off, nothing is indexed, or the embedding provider is not local (notes never go to a cloud
/// provider).
pub fn semantic_allowed(settings: &Settings, indexed_chunks: u32) -> bool {
    let emb = &settings.ai.embeddings;
    if !emb.enabled || emb.model.trim().is_empty() || indexed_chunks == 0 {
        return false;
    }
    settings
        .provider(&emb.provider_id)
        .is_some_and(|p| p.effective_location() == crate::settings::Location::Local)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::settings::{Location, ProviderConfig, ProviderKind};

    fn settings(enabled: bool, provider_kind: ProviderKind, base: &str) -> Settings {
        let mut s = Settings::default();
        s.ai.providers = vec![ProviderConfig {
            id: "p".into(),
            kind: provider_kind,
            name: "P".into(),
            base_url: base.into(),
            model: String::new(),
            location: Location::Local,
            supports_tools: true,
            context_tokens: 8000,
        }];
        s.ai.default_provider_id = "p".into();
        s.ai.embeddings.provider_id = "p".into();
        s.ai.embeddings.enabled = enabled;
        s.ai.embeddings.model = "embed-model".into();
        s.normalize();
        s
    }

    #[test]
    fn disabled_or_empty_index_never_offers_the_tool() {
        let local = "http://localhost:1234/v1";
        assert!(!semantic_allowed(
            &settings(false, ProviderKind::LmStudio, local),
            10
        ));
        assert!(!semantic_allowed(
            &settings(true, ProviderKind::LmStudio, local),
            0
        ));
        assert!(semantic_allowed(
            &settings(true, ProviderKind::LmStudio, local),
            10
        ));
    }

    #[test]
    fn a_cloud_embedder_is_never_used() {
        // normalize() turns semantic search off for a provider that is not local.
        let cloud = settings(
            true,
            ProviderKind::OpenAiCompatible,
            "https://api.example.com/v1",
        );
        assert!(!cloud.ai.embeddings.enabled);
        assert!(!semantic_allowed(&cloud, 10));
        assert!(embedder_for(&cloud).is_err());
        let far_lm_studio = settings(
            true,
            ProviderKind::LmStudio,
            "https://models.example.com/v1",
        );
        assert!(!semantic_allowed(&far_lm_studio, 10));
        assert!(embedder_for(&far_lm_studio).is_err());
    }

    #[test]
    fn settings_changes_restart_indexing_only_when_relevant() {
        let base = crate::settings::EmbeddingSettings {
            enabled: true,
            provider_id: "p".into(),
            model: "m".into(),
        };
        assert_eq!(index_change(&base, &base), None);
        let renamed = crate::settings::EmbeddingSettings {
            model: "m2".into(),
            ..base.clone()
        };
        assert_eq!(index_change(&base, &renamed), Some(true));
        let off = crate::settings::EmbeddingSettings {
            enabled: false,
            ..base.clone()
        };
        assert_eq!(index_change(&base, &off), Some(false));
    }

    #[test]
    fn embedder_refuses_when_off_or_without_model() {
        assert!(embedder_for(&settings(
            false,
            ProviderKind::LmStudio,
            "http://localhost:1234/v1"
        ))
        .is_err());
        let mut s = settings(true, ProviderKind::LmStudio, "http://localhost:1234/v1");
        s.ai.embeddings.model = String::new();
        assert!(embedder_for(&s).is_err());
    }

    fn vault_files() -> Vec<String> {
        [
            "Home.md",
            "Work/Plan.md",
            "Secret/Keys.md",
            "attachments/photo.png",
        ]
        .map(String::from)
        .to_vec()
    }

    #[test]
    fn plan_counts_only_markdown_notes() {
        let plan = plan_index(&vault_files());
        assert_eq!(
            plan.files,
            vec!["Home.md", "Work/Plan.md", "Secret/Keys.md"]
        );
        assert_eq!(plan.total, 3);
    }

    #[test]
    fn plan_total_is_zero_for_an_empty_vault() {
        let plan = plan_index(&[]);
        assert_eq!(plan.total, 0);
        assert!(plan.files.is_empty());
    }
}
