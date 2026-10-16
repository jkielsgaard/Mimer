//! Applying settings changes from the Settings dialog.

use super::{save, Settings, SCHEMA_VERSION};
use crate::error::{AppError, AppResult};
use crate::state::AppState;

/// What must happen to the semantic index after a settings change.
#[derive(Debug, PartialEq, Eq)]
pub enum IndexAction {
    /// Embedding settings did not change.
    Keep,
    /// Stop a running job (semantic search was turned off, or no vault is open).
    Stop,
    /// Stop a running job and start a new one; `rebuild` when the model or provider changed.
    Restart { rebuild: bool },
}

/// Saves settings from the UI. The recent-vault list is kept from the current settings (the UI
/// never edits it), the vault's commit author is updated, and the needed index action is returned.
/// Refuses to write when the settings file could not be loaded, so it is never overwritten.
pub fn apply_update(state: &AppState, settings: Settings) -> AppResult<IndexAction> {
    if let Some(e) = &state.settings_error {
        return Err(AppError::Settings(e.clone()));
    }
    let mut new = settings;
    new.schema_version = SCHEMA_VERSION;
    new.normalize();
    let before = state.settings_snapshot().ai.embeddings;
    {
        let mut cur = state
            .settings
            .write()
            .map_err(|_| AppError::Io("State lock poisoned".into()))?;
        new.recent_vaults = cur.recent_vaults.clone();
        new.last_vault = cur.last_vault.clone();
        // The address of the built-in AI changes each time Mimer is woken: keep the current one.
        let current_url = cur
            .provider(crate::engine::BUILTIN_ID)
            .map(|p| p.base_url.clone());
        if let (Some(url), Some(p)) = (
            current_url,
            new.ai
                .providers
                .iter_mut()
                .find(|p| p.id == crate::engine::BUILTIN_ID),
        ) {
            p.base_url = url;
        }
        // The same for Foundry Local: the address and the model name belong to the running helper.
        let current_foundry = cur
            .provider(crate::foundry::FOUNDRY_ID)
            .map(|p| (p.base_url.clone(), p.model.clone()));
        if let (Some((url, model)), Some(p)) = (
            current_foundry,
            new.ai
                .providers
                .iter_mut()
                .find(|p| p.id == crate::foundry::FOUNDRY_ID),
        ) {
            p.base_url = url;
            p.model = model;
        }
        save(&state.settings_path, &new)?;
        *cur = new.clone();
    }
    if let Ok(v) = state.current_vault() {
        if let Ok(mut a) = v.author.write() {
            *a = (new.git.author_name.clone(), new.git.author_email.clone());
        }
    }
    Ok(
        match crate::embeddings::index_change(&before, &new.ai.embeddings) {
            None => IndexAction::Keep,
            Some(rebuild) if new.ai.embeddings.enabled && state.current_vault().is_ok() => {
                IndexAction::Restart { rebuild }
            }
            Some(_) => IndexAction::Stop,
        },
    )
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::vault::open_for_test;
    use std::sync::Arc;

    fn state_at(dir: &std::path::Path) -> AppState {
        let s = Settings {
            recent_vaults: vec!["/notes".into()],
            last_vault: Some("/notes".into()),
            ..Default::default()
        };
        AppState::new(s, dir.join("settings.json"), None)
    }

    #[test]
    fn keeps_recent_vaults_and_saves_to_disk() {
        let tmp = tempfile::tempdir().unwrap();
        let state = state_at(tmp.path());
        let mut incoming = Settings::default();
        incoming.editor.font_size = 18;
        assert_eq!(apply_update(&state, incoming).unwrap(), IndexAction::Keep);
        let saved = crate::settings::load(&tmp.path().join("settings.json")).unwrap();
        assert_eq!(saved.editor.font_size, 18);
        assert_eq!(saved.recent_vaults, vec!["/notes"]);
        assert_eq!(saved.last_vault.as_deref(), Some("/notes"));
    }

    #[test]
    fn never_overwrites_an_unreadable_settings_file() {
        let tmp = tempfile::tempdir().unwrap();
        let state = AppState::new(
            Settings::default(),
            tmp.path().join("settings.json"),
            Some("bad json".into()),
        );
        assert!(apply_update(&state, Settings::default()).is_err());
        assert!(!tmp.path().join("settings.json").exists());
    }

    #[test]
    fn updates_the_commit_author_of_the_open_vault() {
        let tmp = tempfile::tempdir().unwrap();
        let vault_dir = tmp.path().join("vault");
        std::fs::create_dir_all(&vault_dir).unwrap();
        let state = state_at(tmp.path());
        crate::vault::session::install(&state, Arc::new(open_for_test(&vault_dir))).unwrap();
        let mut incoming = Settings::default();
        incoming.git.author_name = "Ada".into();
        apply_update(&state, incoming).unwrap();
        let author = state
            .current_vault()
            .unwrap()
            .author
            .read()
            .unwrap()
            .clone();
        assert_eq!(author.0, "Ada");
    }

    #[test]
    fn index_action_follows_embedding_changes() {
        let tmp = tempfile::tempdir().unwrap();
        let state = state_at(tmp.path());
        let mut on = Settings::default();
        on.ai.embeddings.enabled = true;
        on.ai.embeddings.model = "embed".into();
        // Turned on, but no vault open: nothing to index.
        assert_eq!(apply_update(&state, on.clone()).unwrap(), IndexAction::Stop);

        let vault_dir = tmp.path().join("vault");
        std::fs::create_dir_all(&vault_dir).unwrap();
        crate::vault::session::install(&state, Arc::new(open_for_test(&vault_dir))).unwrap();
        let mut other_model = on.clone();
        other_model.ai.embeddings.model = "embed-2".into();
        assert_eq!(
            apply_update(&state, other_model.clone()).unwrap(),
            IndexAction::Restart { rebuild: true }
        );
        assert_eq!(
            apply_update(&state, other_model.clone()).unwrap(),
            IndexAction::Keep
        );

        let mut off = other_model;
        off.ai.embeddings.enabled = false;
        assert_eq!(apply_update(&state, off).unwrap(), IndexAction::Stop);
    }
}
