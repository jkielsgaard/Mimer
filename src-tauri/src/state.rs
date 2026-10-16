//! Application state managed by Tauri.

use crate::ai::proposals::ProposalSet;
use crate::error::{AppError, AppResult};
use crate::settings::Settings;
use crate::vault::OpenVault;
use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::atomic::AtomicBool;
use std::sync::{Arc, Mutex, RwLock};
use tokio_util::sync::CancellationToken;
use uuid::Uuid;

/// Everything shared between commands.
pub struct AppState {
    pub settings: RwLock<Settings>,
    pub settings_path: PathBuf,
    /// Set when settings.json could not be loaded; the file is then never overwritten.
    pub settings_error: Option<String>,
    pub vault: RwLock<Option<Arc<OpenVault>>>,
    pub proposals: Mutex<HashMap<Uuid, ProposalSet>>,
    pub ai_tasks: Mutex<HashMap<Uuid, CancellationToken>>,
    pub closing: AtomicBool,
    /// Cancel handle of the running semantic indexing job.
    pub embedding_job: Mutex<Option<CancellationToken>>,
    /// Held while a vault is being opened, so two opens never run at the same time.
    pub open_lock: Mutex<()>,
    /// Cancel handle of the running folder import.
    pub import_job: Mutex<Option<CancellationToken>>,
    pub embedding_status: Mutex<crate::embeddings::EmbeddingStatus>,
    /// The AI that Mimer runs itself (download, wake, sleep).
    pub engine: crate::engine::EngineRuntime,
    /// Foundry Local, the second built-in AI (download, wake, sleep).
    pub foundry: crate::foundry::FoundryRuntime,
}

impl AppState {
    /// Creates the state from loaded settings.
    pub fn new(settings: Settings, settings_path: PathBuf, settings_error: Option<String>) -> Self {
        Self {
            settings: RwLock::new(settings),
            settings_path,
            settings_error,
            vault: RwLock::new(None),
            proposals: Mutex::new(HashMap::new()),
            ai_tasks: Mutex::new(HashMap::new()),
            closing: AtomicBool::new(false),
            embedding_job: Mutex::new(None),
            import_job: Mutex::new(None),
            open_lock: Mutex::new(()),
            embedding_status: Mutex::new(crate::embeddings::EmbeddingStatus::default()),
            engine: crate::engine::EngineRuntime::new(),
            foundry: crate::foundry::FoundryRuntime::new(),
        }
    }

    /// The open vault, or an error if none is open.
    pub fn current_vault(&self) -> AppResult<Arc<OpenVault>> {
        self.vault
            .read()
            .map_err(|_| AppError::Io("State lock poisoned".into()))?
            .clone()
            .ok_or_else(|| AppError::NotFound("No vault is open".into()))
    }

    /// A snapshot of the settings.
    pub fn settings_snapshot(&self) -> Settings {
        match self.settings.read() {
            Ok(s) => s.clone(),
            Err(_) => {
                tracing::error!("settings lock poisoned; using defaults");
                Settings::default()
            }
        }
    }
}
