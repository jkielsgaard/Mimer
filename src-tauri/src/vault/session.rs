//! Vault session lifecycle: closing the current vault, opening a folder, installing the new vault
//! and remembering it in the global settings. Tauri-free so it can be unit-tested; the command
//! layer adds the window-bound steps (asset scope, file watcher, index events).

use crate::error::{AppError, AppResult};
use crate::git::{CommitKind, CommitReason};
use crate::settings;
use crate::state::AppState;
use crate::vault::{fs_ops, CommitCallback, OpenVault};
use std::path::{Path, PathBuf};
use std::sync::Arc;

/// Closes the open vault, if any: cancels semantic indexing, stops the watcher and commits any
/// pending changes as `Autosave on close`. A failed commit is logged, not returned: the changes
/// are already on disk, so only the history entry is lost.
pub fn close_current(state: &AppState) {
    if let Ok(mut job) = state.embedding_job.lock() {
        if let Some(token) = job.take() {
            token.cancel();
        }
    }
    let old = state.vault.write().ok().and_then(|mut v| v.take());
    if let Some(v) = old {
        v.stop_watcher();
        if let Err(e) = v.commit(CommitReason::new(CommitKind::AutosaveOnClose, None), None) {
            tracing::warn!("autosave commit on vault close failed: {e}");
        }
    }
}

/// Closes the current vault, then opens (and initialises if needed) the folder at `path` with
/// the author from settings. `on_commit` is called for every commit made by the new vault.
/// The vault is not installed yet; call [`install`] once the window-bound setup has succeeded.
pub fn open_folder(
    state: &AppState,
    path: &str,
    on_commit: CommitCallback,
) -> AppResult<Arc<OpenVault>> {
    close_current(state);
    let s = state.settings_snapshot();
    let author = (s.git.author_name, s.git.author_email);
    Ok(Arc::new(OpenVault::open(
        Path::new(path),
        author,
        on_commit,
    )?))
}

/// Makes `vault` the current vault.
pub fn install(state: &AppState, vault: Arc<OpenVault>) -> AppResult<()> {
    *state
        .vault
        .write()
        .map_err(|_| AppError::Io("State lock poisoned".into()))? = Some(vault);
    Ok(())
}

/// Adds `path` to the recent vaults and makes it the last vault, then saves settings.
/// Does nothing when settings could not be loaded, so an unreadable file is never overwritten.
pub fn remember(state: &AppState, path: &str) -> AppResult<()> {
    if state.settings_error.is_some() {
        return Ok(());
    }
    let mut s = state
        .settings
        .write()
        .map_err(|_| AppError::Io("State lock poisoned".into()))?;
    s.remember_vault(path);
    settings::save(&state.settings_path, &s)
}

/// Removes `path` from the recent vaults (the folder itself is never touched), then saves.
/// Does nothing when settings could not be loaded, so an unreadable file is never overwritten.
pub fn forget(state: &AppState, path: &str) -> AppResult<()> {
    if state.settings_error.is_some() {
        return Ok(());
    }
    let mut s = state
        .settings
        .write()
        .map_err(|_| AppError::Io("State lock poisoned".into()))?;
    s.forget_vault(path);
    settings::save(&state.settings_path, &s)
}

/// The recent vaults whose folder no longer exists (deleted, renamed or moved).
pub fn missing_vaults(state: &AppState) -> Vec<String> {
    state
        .settings_snapshot()
        .recent_vaults
        .into_iter()
        .filter(|p| !Path::new(p).is_dir())
        .collect()
}

/// Creates the folder `name` inside `parent` for a new vault and returns its path.
/// Fails with `AlreadyExists` when the folder is already there.
pub fn create_folder(parent: &str, name: &str) -> AppResult<PathBuf> {
    let name = fs_ops::validate_name(name)?;
    let dir = Path::new(parent).join(&name);
    if dir.exists() {
        return Err(AppError::AlreadyExists(format!(
            "{} already exists",
            dir.display()
        )));
    }
    std::fs::create_dir_all(&dir)?;
    Ok(dir)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::settings::Settings;
    use crate::vault::open_for_test;

    fn state_with(settings_path: PathBuf, settings_error: Option<String>) -> AppState {
        AppState::new(Settings::default(), settings_path, settings_error)
    }

    #[test]
    fn create_folder_makes_the_folder_and_rejects_duplicates() {
        let tmp = tempfile::tempdir().unwrap();
        let parent = tmp.path().to_string_lossy().to_string();
        let dir = create_folder(&parent, "Notes").unwrap();
        assert!(dir.is_dir());
        assert!(matches!(
            create_folder(&parent, "Notes"),
            Err(AppError::AlreadyExists(_))
        ));
    }

    #[test]
    fn create_folder_rejects_invalid_names() {
        let tmp = tempfile::tempdir().unwrap();
        let parent = tmp.path().to_string_lossy().to_string();
        assert!(create_folder(&parent, "../escape").is_err());
        assert!(create_folder(&parent, ".hidden").is_err());
        assert!(create_folder(&parent, "").is_err());
    }

    #[test]
    fn remember_saves_recent_vault_and_last_vault() {
        let tmp = tempfile::tempdir().unwrap();
        let settings_path = tmp.path().join("settings.json");
        let state = state_with(settings_path.clone(), None);
        remember(&state, "/notes/one").unwrap();
        remember(&state, "/notes/two").unwrap();
        let saved = settings::load(&settings_path).unwrap();
        assert_eq!(saved.last_vault.as_deref(), Some("/notes/two"));
        assert_eq!(saved.recent_vaults, vec!["/notes/two", "/notes/one"]);
    }

    #[test]
    fn forget_removes_vault_and_clears_last_vault() {
        let tmp = tempfile::tempdir().unwrap();
        let settings_path = tmp.path().join("settings.json");
        let state = state_with(settings_path.clone(), None);
        remember(&state, "/notes/one").unwrap();
        remember(&state, "/notes/two").unwrap();
        forget(&state, "/notes/two").unwrap();
        let saved = settings::load(&settings_path).unwrap();
        assert_eq!(saved.recent_vaults, vec!["/notes/one"]);
        assert_eq!(saved.last_vault, None);
    }

    #[test]
    fn missing_vaults_lists_only_folders_that_are_gone() {
        let tmp = tempfile::tempdir().unwrap();
        let state = state_with(tmp.path().join("settings.json"), None);
        let here = tmp.path().to_string_lossy().to_string();
        remember(&state, &here).unwrap();
        remember(&state, "/definitely/not/here").unwrap();
        assert_eq!(missing_vaults(&state), vec!["/definitely/not/here"]);
    }

    #[test]
    fn remember_never_writes_when_settings_failed_to_load() {
        let tmp = tempfile::tempdir().unwrap();
        let settings_path = tmp.path().join("settings.json");
        let state = state_with(settings_path.clone(), Some("bad json".into()));
        remember(&state, "/notes/one").unwrap();
        assert!(!settings_path.exists());
    }

    #[test]
    fn install_makes_the_vault_current() {
        let tmp = tempfile::tempdir().unwrap();
        let state = state_with(tmp.path().join("settings.json"), None);
        assert!(state.current_vault().is_err());
        install(&state, Arc::new(open_for_test(tmp.path()))).unwrap();
        assert!(state.current_vault().is_ok());
    }

    #[test]
    fn close_commits_pending_changes_and_clears_the_vault() {
        let tmp = tempfile::tempdir().unwrap();
        let state = state_with(tmp.path().join("settings.json"), None);
        let vault_dir = tmp.path().join("vault");
        std::fs::create_dir_all(&vault_dir).unwrap();
        let vault = Arc::new(open_for_test(&vault_dir));
        install(&state, vault.clone()).unwrap();

        std::fs::write(vault.root.join("Pending.md"), "unsaved").unwrap();
        close_current(&state);

        assert!(state.current_vault().is_err());
        let message = vault
            .with_repo(|repo| {
                let head = repo.head()?.peel_to_commit()?;
                Ok(head.message().unwrap_or_default().to_string())
            })
            .unwrap();
        assert!(message.starts_with("Autosave on close"), "got {message:?}");
    }

    #[test]
    fn close_without_a_vault_does_nothing() {
        let tmp = tempfile::tempdir().unwrap();
        let state = state_with(tmp.path().join("settings.json"), None);
        close_current(&state);
        assert!(state.current_vault().is_err());
    }
}
