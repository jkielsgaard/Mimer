//! The open vault: repository, search index, projects and file list.

pub mod attachments;
pub mod fs_ops;
pub mod images;
pub mod ops;
pub mod paths;
pub mod session;
pub mod tree;
pub mod watcher;

use crate::error::{AppError, AppResult};
use crate::git::autosave::AutosaveState;
use crate::git::{self, CommitKind, CommitReason};
use crate::links::resolve::LinkResolver;
use crate::projects::{self, Project};
use crate::search;
use git2::Repository;
use rusqlite::Connection;
use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex, RwLock};
use ts_rs::TS;

/// `.vault/config.json`.
#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase", default)]
#[ts(export)]
pub struct VaultConfig {
    pub schema_version: u32,
    pub attachments_folder: String,
    pub new_note_folder: String,
    /// Folder for daily notes (`""` = vault root).
    pub daily_notes_folder: String,
    /// strftime pattern for the daily note file name (without `.md`).
    pub daily_note_format: String,
    /// Template name used for new daily notes (`""` = none).
    pub daily_template: String,
    /// Folder for meeting notes made with the "Meeting note" button.
    pub meetings_folder: String,
    /// Folder for notes made with the "Quick note" button.
    pub quick_notes_folder: String,
    /// How inserted images are written: `markdown` (`![](path)`) or `wiki` (`![[name]]`).
    pub image_link_style: String,
}

impl Default for VaultConfig {
    fn default() -> Self {
        Self {
            schema_version: 1,
            attachments_folder: "attachments".into(),
            new_note_folder: String::new(),
            daily_notes_folder: "Daily".into(),
            daily_note_format: "%Y-%m-%d".into(),
            daily_template: String::new(),
            meetings_folder: "Meetings".into(),
            quick_notes_folder: "Quick notes".into(),
            image_link_style: "markdown".into(),
        }
    }
}

/// Returned to the frontend when a vault opens.
#[derive(Debug, Clone, Serialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct VaultInfo {
    pub name: String,
    pub path: String,
    pub config: VaultConfig,
}

pub type CommitCallback = Box<dyn Fn(&str, &str) + Send + Sync>;

/// A vault that is currently open.
pub struct OpenVault {
    /// Canonical root.
    pub root: PathBuf,
    pub repo: Mutex<Repository>,
    pub index: Mutex<Connection>,
    pub watcher: Mutex<Option<Box<dyn std::any::Any + Send>>>,
    pub projects: RwLock<Vec<Project>>,
    pub files: RwLock<Vec<String>>,
    pub resolver: RwLock<Arc<LinkResolver>>,
    pub author: RwLock<(String, String)>,
    pub autosave: Mutex<AutosaveState>,
    on_commit: CommitCallback,
}

fn lock_err<T>(_: T) -> AppError {
    AppError::Io("Internal lock poisoned".into())
}

impl OpenVault {
    /// Opens (and if necessary initialises) a vault folder. Commits any dirty tree.
    pub fn open(
        root: &Path,
        author: (String, String),
        on_commit: CommitCallback,
    ) -> AppResult<Self> {
        let root = std::fs::canonicalize(root)
            .map_err(|_| AppError::NotFound(format!("Folder not found: {}", root.display())))?;
        if !root.is_dir() {
            return Err(AppError::InvalidPath(format!(
                "{} is not a folder",
                root.display()
            )));
        }
        let (repo, created) = git::repo::init_or_open(&root)?;
        std::fs::create_dir_all(root.join(".vault/projects"))?;
        let config_path = root.join(".vault/config.json");
        if !config_path.exists() {
            std::fs::write(
                &config_path,
                serde_json::to_string_pretty(&VaultConfig::default())?,
            )?;
        }
        git::repo::ensure_gitignore(&root)?;
        let index = search::open_index(&root.join(".vault/index.db"))?;
        let files = tree::list_files(&root);
        let vault = OpenVault {
            resolver: RwLock::new(Arc::new(LinkResolver::new(&files))),
            files: RwLock::new(files),
            projects: RwLock::new(projects::load_all(&root)),
            root,
            repo: Mutex::new(repo),
            index: Mutex::new(index),
            watcher: Mutex::new(None),
            author: RwLock::new(author),
            autosave: Mutex::new(AutosaveState::default()),
            on_commit,
        };
        let dirty = {
            let repo = vault.repo.lock().map_err(lock_err)?;
            git::repo::is_dirty(&repo)?
        };
        if dirty {
            let kind = if created {
                CommitKind::Initial
            } else {
                CommitKind::Recovered
            };
            vault.commit(CommitReason::new(kind, None), None)?;
        }
        Ok(vault)
    }

    /// Display name of the vault (folder name).
    pub fn name(&self) -> String {
        self.root
            .file_name()
            .map(|n| n.to_string_lossy().into_owned())
            .unwrap_or_else(|| "Vault".into())
    }

    /// Reads `.vault/config.json` (defaults if unreadable).
    pub fn config(&self) -> VaultConfig {
        let path = self.root.join(".vault/config.json");
        match std::fs::read_to_string(&path) {
            Ok(text) => serde_json::from_str(&text).unwrap_or_else(|e| {
                // Wrong values would send attachments or daily notes to the wrong folder.
                tracing::warn!("{} is not valid, using defaults: {e}", path.display());
                VaultConfig::default()
            }),
            Err(_) => VaultConfig::default(),
        }
    }

    /// Validates and saves `.vault/config.json`, then commits it.
    pub fn set_config(&self, cfg: VaultConfig) -> AppResult<VaultConfig> {
        if cfg.attachments_folder.trim().is_empty() {
            return Err(AppError::InvalidPath(
                "The attachments folder cannot be empty".into(),
            ));
        }
        paths::resolve_dir(&self.root, cfg.attachments_folder.trim_matches('/'), None)?;
        paths::resolve_dir(&self.root, cfg.new_note_folder.trim_matches('/'), None)?;
        paths::resolve_dir(&self.root, cfg.daily_notes_folder.trim_matches('/'), None)?;
        paths::resolve_dir(&self.root, cfg.meetings_folder.trim_matches('/'), None)?;
        paths::resolve_dir(&self.root, cfg.quick_notes_folder.trim_matches('/'), None)?;
        let sample =
            crate::templates::render::format_time(&chrono::Local::now(), &cfg.daily_note_format)
                .ok_or_else(|| {
                    AppError::Settings("The daily note date format is not valid".into())
                })?;
        if sample.is_empty() || sample.contains('/') || sample.contains('\\') {
            return Err(AppError::Settings(
                "The daily note format must produce a plain file name".into(),
            ));
        }
        if !matches!(cfg.image_link_style.as_str(), "markdown" | "wiki") {
            return Err(AppError::Settings(
                "Image links must be \"markdown\" or \"wiki\"".into(),
            ));
        }
        let mut cfg = cfg;
        cfg.schema_version = 1;
        cfg.attachments_folder = cfg.attachments_folder.trim_matches('/').to_string();
        cfg.new_note_folder = cfg.new_note_folder.trim_matches('/').to_string();
        cfg.daily_notes_folder = cfg.daily_notes_folder.trim_matches('/').to_string();
        cfg.meetings_folder = cfg.meetings_folder.trim_matches('/').to_string();
        cfg.quick_notes_folder = cfg.quick_notes_folder.trim_matches('/').to_string();
        let rel = ".vault/config.json";
        let abs = paths::resolve_internal(&self.root, rel)?;
        fs_ops::write_atomic(&abs, serde_json::to_string_pretty(&cfg)?.as_bytes())?;
        self.commit(
            CommitReason::new(CommitKind::VaultSettings, None),
            Some(&[rel.to_string()]),
        )?;
        Ok(cfg)
    }

    /// Info for the frontend.
    pub fn info(&self) -> VaultInfo {
        VaultInfo {
            name: self.name(),
            path: self.root.to_string_lossy().into_owned(),
            config: self.config(),
        }
    }

    /// Commits `paths` (or everything). Returns the SHA, or `None` when nothing changed.
    pub fn commit(
        &self,
        reason: CommitReason,
        paths: Option<&[String]>,
    ) -> AppResult<Option<String>> {
        let message = reason.message();
        let (name, email) = self.author.read().map_err(lock_err)?.clone();
        let sha = {
            let repo = self.repo.lock().map_err(lock_err)?;
            git::repo::commit(&repo, paths, &message, &name, &email)?
        };
        if let Some(sha) = &sha {
            (self.on_commit)(sha, &message);
        }
        Ok(sha)
    }

    /// Marks the vault as changed (for the idle-commit timer).
    pub fn touch(&self) {
        if let Ok(mut a) = self.autosave.lock() {
            a.touch();
        }
    }

    /// Re-reads the visible file list and rebuilds the link resolver.
    pub fn refresh_files(&self) {
        let files = tree::list_files(&self.root);
        if let Ok(mut r) = self.resolver.write() {
            *r = Arc::new(LinkResolver::new(&files));
        }
        if let Ok(mut f) = self.files.write() {
            *f = files;
        }
    }

    /// The current link resolver.
    pub fn resolver(&self) -> Arc<LinkResolver> {
        self.resolver.read().map(|r| r.clone()).unwrap_or_default()
    }

    /// Copy of the visible file list.
    pub fn file_list(&self) -> Vec<String> {
        self.files.read().map(|f| f.clone()).unwrap_or_default()
    }

    /// Re-indexes one note from disk (or removes it from the index if it is gone).
    pub fn reindex(&self, rel: &str) -> AppResult<()> {
        if !tree::is_markdown(rel) {
            return Ok(());
        }
        let abs = paths::resolve(&self.root, rel, None)?;
        let resolver = self.resolver();
        let conn = self.index.lock().map_err(lock_err)?;
        match std::fs::read(&abs) {
            Ok(bytes) => {
                let content = String::from_utf8_lossy(&bytes).into_owned();
                search::index_note(&conn, &resolver, rel, &content, fs_ops::mtime_ms(&abs))
            }
            Err(_) => search::remove_note(&conn, rel),
        }
    }

    /// Incremental index sync against the disk.
    pub fn sync_index(&self) -> AppResult<()> {
        let conn = self.index.lock().map_err(lock_err)?;
        search::sync_vault(&conn, &self.root)
    }

    /// Snapshot of the loaded projects.
    pub fn project_list(&self) -> Vec<Project> {
        self.projects.read().map(|p| p.clone()).unwrap_or_default()
    }

    /// Reloads projects from disk.
    pub fn reload_projects(&self) {
        if let Ok(mut p) = self.projects.write() {
            *p = projects::load_all(&self.root);
        }
    }

    /// Stops the file watcher.
    pub fn stop_watcher(&self) {
        if let Ok(mut w) = self.watcher.lock() {
            *w = None;
        }
    }

    /// Runs `f` with the repository locked.
    pub fn with_repo<T>(&self, f: impl FnOnce(&Repository) -> AppResult<T>) -> AppResult<T> {
        let repo = self.repo.lock().map_err(lock_err)?;
        f(&repo)
    }

    /// Runs `f` with the search connection locked.
    pub fn with_index<T>(&self, f: impl FnOnce(&Connection) -> AppResult<T>) -> AppResult<T> {
        let conn = self.index.lock().map_err(lock_err)?;
        f(&conn)
    }
}

/// Builds a vault without callbacks (tests).
#[cfg(test)]
pub fn open_for_test(root: &Path) -> OpenVault {
    OpenVault::open(
        root,
        ("Test".into(), "test@localhost".into()),
        Box::new(|_, _| {}),
    )
    .unwrap()
}
