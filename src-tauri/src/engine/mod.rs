//! The built-in AI: Mimer downloads llama.cpp's `llama-server` and a model the user chose, runs it
//! on the user's own computer on request ("Wake Mimer"), and stops it again ("Sleep Mimer").
//!
//! Everything here is local: the server listens on `127.0.0.1` only, with a random key. The
//! built-in AI is one more provider (`ProviderKind::BuiltIn`), so the chat code does not change.

pub mod catalog;
pub mod diagnose;
pub mod download;
pub mod extract;
pub mod hardware;
pub mod paths;
pub mod process;
pub mod service;
#[cfg(windows)]
mod winjob;

use hardware::{Backend, CpuVendor, GpuVendor};
use serde::{Deserialize, Serialize};
use std::sync::Mutex;
use std::time::Instant;
use tokio_util::sync::CancellationToken;
use ts_rs::TS;

/// The id of the built-in provider.
pub const BUILTIN_ID: &str = "builtin";
/// The model name the engine answers to.
pub const BUILTIN_ALIAS: &str = "mimer";
/// The event the frontend listens to for status changes.
pub const STATUS_EVENT: &str = "engine://status";

/// Where the built-in AI is.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub enum EngineState {
    /// The engine or the chosen model has not been downloaded.
    NotInstalled,
    /// Downloading or unpacking.
    Installing,
    /// Installed, not loaded: uses no memory.
    Asleep,
    /// Loading the model into memory.
    Waking,
    /// Loaded and ready to answer.
    Awake,
    /// Unloading.
    Sleeping,
    /// Something went wrong; `problem` says what and how to fix it.
    Error,
}

/// What went wrong and what the user can do about it.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct Problem {
    pub title: String,
    /// What to try, in order.
    pub steps: Vec<String>,
    /// The engine's own last lines and the exit code, for support.
    pub details: String,
}

/// Progress of a download, unpacking or copy.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct InstallProgress {
    /// `engine`, `unpacking`, `model` or `copying`.
    pub phase: String,
    pub file: String,
    #[ts(type = "number")]
    pub done: u64,
    #[ts(type = "number")]
    pub total: u64,
}

/// The engine build that is installed.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct InstalledEngine {
    pub build: String,
    pub backend: Backend,
}

/// A model file in Mimer's folder.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct InstalledModel {
    /// A catalog id, or `custom:<file name>`.
    pub id: String,
    pub name: String,
    pub file: String,
    #[ts(type = "number")]
    pub size_bytes: u64,
    pub custom: bool,
}

/// Everything the screens need to know about the built-in AI.
#[derive(Debug, Clone, Serialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct EngineStatus {
    pub state: EngineState,
    /// One line for the user: "Mimer is asleep", "Loading the model… 12 s", …
    pub message: String,
    pub problem: Option<Problem>,
    pub install: Option<InstallProgress>,
    /// The engine installed for the chosen graphics backend, if any.
    pub engine: Option<InstalledEngine>,
    pub models: Vec<InstalledModel>,
    /// The id of the model chosen in the settings, when it is installed.
    pub selected_model_ready: bool,
    /// The model that is loaded now.
    pub active_model: Option<String>,
    /// The folder with the engine and the models.
    pub folder: String,
    /// Why the folder is not next to the program, when that was expected.
    pub folder_note: Option<String>,
    /// The last lines the engine printed.
    pub log: Vec<String>,
    /// True when the settings changed after Mimer was woken: sleep and wake to apply them.
    pub restart_needed: bool,
    /// Disk space used by the engine and the models.
    #[ts(type = "number")]
    pub disk_bytes: u64,
}

/// What the user chose when downloading.
#[derive(Debug, Clone, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct InstallRequest {
    pub cpu: CpuVendor,
    pub gpu: GpuVendor,
    pub backend: Backend,
    pub model_id: String,
    /// Make the built-in AI Mimer's provider when the download is done.
    pub use_for_mimer: bool,
}

/// What to remove.
#[derive(Debug, Clone, Deserialize, TS)]
#[serde(rename_all = "camelCase", tag = "kind", content = "id")]
#[ts(export)]
pub enum RemoveWhat {
    /// One model file (the id from the model list).
    Model(String),
    /// The engine program.
    Engine,
    /// Everything: engine, models and logs.
    All,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(crate) enum Phase {
    Idle,
    Installing,
    Waking,
    Awake,
    Sleeping,
}

pub(crate) struct Inner {
    pub phase: Phase,
    pub message: String,
    pub problem: Option<Problem>,
    pub install: Option<InstallProgress>,
    pub running: Option<std::sync::Arc<process::Running>>,
    pub port: Option<u16>,
    /// The command-line the running engine was started with, to notice settings changes.
    pub launched_with: Option<Vec<String>>,
    pub active_model: Option<String>,
    pub install_cancel: Option<CancellationToken>,
    pub wake_cancel: Option<CancellationToken>,
    pub last_used: Instant,
    /// The last lines of a failed run, kept for the problem screen after the process is gone.
    pub last_log: Vec<String>,
}

/// The state of the built-in AI, shared by the commands.
pub struct EngineRuntime {
    pub(crate) inner: Mutex<Inner>,
}

impl EngineRuntime {
    /// A runtime with nothing started.
    pub fn new() -> Self {
        Self {
            inner: Mutex::new(Inner {
                phase: Phase::Idle,
                message: String::new(),
                problem: None,
                install: None,
                running: None,
                port: None,
                launched_with: None,
                active_model: None,
                install_cancel: None,
                wake_cancel: None,
                last_used: Instant::now(),
                last_log: Vec::new(),
            }),
        }
    }
}

impl Default for EngineRuntime {
    fn default() -> Self {
        Self::new()
    }
}

/// The key of the running engine. Kept in memory only.
static TOKEN: Mutex<Option<String>> = Mutex::new(None);

/// The key the running engine requires, if one is running.
pub fn current_token() -> Option<String> {
    TOKEN.lock().ok().and_then(|t| t.clone())
}

pub(crate) fn set_token(token: Option<String>) {
    if let Ok(mut t) = TOKEN.lock() {
        *t = token;
    }
}
