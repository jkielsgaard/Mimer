//! File watcher: keeps the index and file list current and notifies the frontend.

use super::paths::{is_hidden, to_relative};
use super::OpenVault;
use crate::state::AppState;
use notify::{EventKind, RecursiveMode};
use notify_debouncer_full::{new_debouncer, DebounceEventResult};
use serde::Serialize;
use std::collections::BTreeSet;
use std::sync::Arc;
use std::time::Duration;
use tauri::{AppHandle, Emitter, Manager};
use ts_rs::TS;

#[derive(Debug, Clone, Serialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct FileChanged {
    pub paths: Vec<String>,
    /// `created`, `modified` or `removed`.
    pub kind: String,
}

/// Starts watching the vault. The returned handle must be kept alive.
pub fn start(
    app: AppHandle,
    vault: &Arc<OpenVault>,
) -> Result<Box<dyn std::any::Any + Send>, String> {
    let root = vault.root.clone();
    let handler_app = app.clone();
    let mut debouncer = new_debouncer(
        Duration::from_millis(400),
        None,
        move |res: DebounceEventResult| {
            let Ok(events) = res else { return };
            let state = handler_app.state::<AppState>();
            let Ok(vault) = state.current_vault() else {
                return;
            };
            let mut created = BTreeSet::new();
            let mut modified = BTreeSet::new();
            let mut removed = BTreeSet::new();
            let mut needs_sync = false;
            for ev in &events {
                let bucket = match ev.kind {
                    EventKind::Create(_) => &mut created,
                    EventKind::Remove(_) => &mut removed,
                    EventKind::Modify(_) => &mut modified,
                    _ => continue,
                };
                for p in &ev.paths {
                    let Some(rel) = to_relative(&vault.root, p) else {
                        continue;
                    };
                    if rel.is_empty() || is_hidden(&rel) {
                        continue;
                    }
                    if p.is_dir() || !rel.rsplit('/').next().unwrap_or("").contains('.') {
                        needs_sync = true;
                    }
                    bucket.insert(rel);
                }
            }
            if created.is_empty() && modified.is_empty() && removed.is_empty() {
                return;
            }
            vault.refresh_files();
            if needs_sync {
                if let Err(e) = vault.sync_index() {
                    tracing::warn!("index sync after file change failed: {e}");
                }
            } else {
                for rel in created.iter().chain(modified.iter()).chain(removed.iter()) {
                    if let Err(e) = vault.reindex(rel) {
                        tracing::warn!("re-index of {rel} failed: {e}");
                    }
                }
            }
            vault.touch();
            for (kind, set) in [
                ("created", created),
                ("modified", modified),
                ("removed", removed),
            ] {
                if !set.is_empty() {
                    let _ = handler_app.emit(
                        "vault://file-changed",
                        FileChanged {
                            paths: set.into_iter().collect(),
                            kind: kind.into(),
                        },
                    );
                }
            }
            let _ = handler_app.emit("vault://index-updated", serde_json::json!({}));
            // Changed notes need new embeddings; the job skips everything else quickly.
            if state.settings_snapshot().ai.embeddings.enabled {
                let _ = crate::embeddings::spawn_index_job(&handler_app, false);
            }
        },
    )
    .map_err(|e| e.to_string())?;
    debouncer
        .watch(&root, RecursiveMode::Recursive)
        .map_err(|e| e.to_string())?;
    Ok(Box::new(debouncer))
}
