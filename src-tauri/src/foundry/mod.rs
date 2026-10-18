//! Foundry Local as a second built-in AI, next to the one that runs llama.cpp (`engine`).
//!
//! Foundry Local is Microsoft's runtime for AI models on the user's own computer. It chooses the
//! best hardware by itself (a neural processor, a graphics card or the processor). It runs in a
//! helper process (`helper`), which is Mimer itself started again, never inside Mimer's own
//! process. Everything stays on this computer: the helper answers on `127.0.0.1` only.

pub mod helper;
pub mod service;

use crate::engine::{EngineState, InstallProgress, Problem};
use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};
use std::sync::Mutex;
use std::time::Instant;
use tokio_util::sync::CancellationToken;
use ts_rs::TS;

/// The id of the provider that stands for Foundry Local.
pub const FOUNDRY_ID: &str = "foundry";
/// The event the screen listens to for status changes.
pub const STATUS_EVENT: &str = "foundry://status";

/// The name of the native library file that must be in the library folder.
#[cfg(windows)]
pub const LIB_FILE: &str = "foundry_local.dll";
#[cfg(target_os = "macos")]
pub const LIB_FILE: &str = "libfoundry_local.dylib";
#[cfg(all(unix, not(target_os = "macos")))]
pub const LIB_FILE: &str = "libfoundry_local.so";

/// The folder that holds Foundry Local's native library, next to Mimer. `None` when this build of
/// Mimer does not include it.
pub fn native_dir(resource_dir: Option<&Path>, exe_dir: Option<&Path>) -> Option<PathBuf> {
    let mut candidates: Vec<PathBuf> = Vec::new();
    if let Ok(p) = std::env::var("MIMER_FOUNDRY_DIR") {
        candidates.push(PathBuf::from(p));
    }
    for base in [resource_dir, exe_dir].into_iter().flatten() {
        candidates.push(base.join("foundry-native"));
    }
    // A development build finds the folder in the source tree.
    candidates.push(Path::new(env!("CARGO_MANIFEST_DIR")).join("foundry-native"));
    candidates.into_iter().find(|d| d.join(LIB_FILE).is_file())
}

/// A model Foundry Local offers, as the helper reports it.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct FoundryModel {
    /// The short name used everywhere (for example `qwen3-4b`).
    pub alias: String,
    /// The variant chosen for this computer.
    pub id: String,
    pub name: String,
    #[ts(type = "number")]
    pub size_mb: u64,
    /// True when the model can call tools. Mimer shows only these: searching and changing notes
    /// needs them.
    pub tools: bool,
    /// `CPU`, `GPU` or `NPU`: where Foundry Local runs it on this computer.
    pub device: String,
    pub license: Option<String>,
    pub cached: bool,
}

/// A model that has been downloaded.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct FoundryInstalled {
    pub alias: String,
    pub name: String,
    #[ts(type = "number")]
    pub size_mb: u64,
}

/// Everything the screens need to know about Foundry Local.
#[derive(Debug, Clone, Serialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct FoundryStatus {
    pub state: EngineState,
    pub message: String,
    pub problem: Option<Problem>,
    pub install: Option<InstallProgress>,
    pub installed: Vec<FoundryInstalled>,
    /// The alias of the model that is loaded now.
    pub active_model: Option<String>,
    /// The device Foundry Local reports for the loaded model (CPU, GPU or NPU), when known.
    pub active_device: Option<String>,
    /// False when this build or computer cannot use Foundry Local; `unavailable_reason` says why.
    pub available: bool,
    pub unavailable_reason: Option<String>,
    /// Something to know before using it that is not a reason to refuse (shown as a note).
    pub note: Option<String>,
    pub folder: String,
    #[ts(type = "number")]
    pub disk_bytes: u64,
    /// True when another model was chosen after Mimer was woken.
    pub restart_needed: bool,
    /// The last lines the helper printed.
    pub log: Vec<String>,
}

pub(crate) struct Inner {
    pub phase: crate::engine::Phase,
    pub message: String,
    pub problem: Option<Problem>,
    pub install: Option<InstallProgress>,
    pub running: Option<std::sync::Arc<crate::engine::process::Running>>,
    pub active_model: Option<String>,
    pub active_device: Option<String>,
    pub install_cancel: Option<CancellationToken>,
    pub wake_cancel: Option<CancellationToken>,
    pub last_used: Instant,
    pub last_log: Vec<String>,
    /// The model list of this session.
    pub catalog: Option<Vec<FoundryModel>>,
}

/// The state of Foundry Local, shared by the commands.
pub struct FoundryRuntime {
    pub(crate) inner: Mutex<Inner>,
}

impl FoundryRuntime {
    /// A runtime with nothing started.
    pub fn new() -> Self {
        Self {
            inner: Mutex::new(Inner {
                phase: crate::engine::Phase::Idle,
                message: String::new(),
                problem: None,
                install: None,
                running: None,
                active_model: None,
                active_device: None,
                install_cancel: None,
                wake_cancel: None,
                last_used: Instant::now(),
                last_log: Vec::new(),
                catalog: None,
            }),
        }
    }
}

impl Default for FoundryRuntime {
    fn default() -> Self {
        Self::new()
    }
}

/// The file that lists the downloaded models, so the status needs no helper.
pub fn installed_file(root: &Path) -> PathBuf {
    root.join("installed.json")
}

/// Reads the list of downloaded models (empty when there is none or it cannot be read).
pub fn read_installed(root: &Path) -> Vec<FoundryInstalled> {
    std::fs::read_to_string(installed_file(root))
        .ok()
        .and_then(|t| serde_json::from_str(&t).ok())
        .unwrap_or_default()
}

/// Saves the list of downloaded models.
pub fn write_installed(root: &Path, list: &[FoundryInstalled]) -> std::io::Result<()> {
    std::fs::create_dir_all(root)?;
    let text = serde_json::to_string_pretty(list).map_err(std::io::Error::other)?;
    std::fs::write(installed_file(root), text)
}

/// Keeps only the models that can call tools, sorted by size (smallest first).
pub fn tool_models(mut all: Vec<FoundryModel>) -> Vec<FoundryModel> {
    all.retain(|m| m.tools && m.size_mb > 0);
    all.sort_by(|a, b| a.size_mb.cmp(&b.size_mb).then(a.alias.cmp(&b.alias)));
    all
}

#[cfg(test)]
mod tests {
    use super::*;

    fn model(alias: &str, tools: bool, size_mb: u64) -> FoundryModel {
        FoundryModel {
            alias: alias.into(),
            id: format!("{alias}-generic-gpu:1"),
            name: alias.into(),
            size_mb,
            tools,
            device: "GPU".into(),
            license: None,
            cached: false,
        }
    }

    #[test]
    fn only_models_with_tools_are_listed_smallest_first() {
        let list = tool_models(vec![
            model("big", true, 9000),
            model("no-tools", false, 100),
            model("speech", false, 0),
            model("small", true, 500),
            model("unknown-size", true, 0),
        ]);
        let names: Vec<_> = list.iter().map(|m| m.alias.as_str()).collect();
        assert_eq!(names, vec!["small", "big"]);
    }

    #[test]
    fn the_downloaded_list_round_trips_and_a_missing_file_is_empty() {
        let d = tempfile::tempdir().unwrap();
        assert!(read_installed(d.path()).is_empty());
        let list = vec![FoundryInstalled {
            alias: "qwen3-4b".into(),
            name: "Qwen 3 4B".into(),
            size_mb: 2763,
        }];
        write_installed(d.path(), &list).unwrap();
        assert_eq!(read_installed(d.path()), list);
        std::fs::write(installed_file(d.path()), "not json").unwrap();
        assert!(read_installed(d.path()).is_empty());
    }

    #[test]
    fn the_native_folder_needs_the_library_file() {
        let d = tempfile::tempdir().unwrap();
        let bare = d.path().join("foundry-native");
        std::fs::create_dir_all(&bare).unwrap();
        // An empty folder does not count (the source tree may have a real one: only check the
        // folder given here is not chosen).
        let found = native_dir(Some(d.path()), None);
        assert_ne!(found, Some(bare.clone()));
        std::fs::write(bare.join(LIB_FILE), b"x").unwrap();
        assert_eq!(native_dir(Some(d.path()), None), Some(bare));
    }
}
