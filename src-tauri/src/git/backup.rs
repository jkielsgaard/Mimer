//! Backup of a vault: a second copy of its Git repository, with the whole history, in a folder the
//! person chooses (an external disk, or a folder another program synchronises). The copy is a bare
//! repository `<folder>/<vault name>.git`. Nothing is sent anywhere by Mimer, nothing is forced and
//! nothing is deleted: a push that is not a plain addition to the backup is refused.

use super::{CommitKind, CommitReason};
use crate::error::{AppError, AppResult};
use crate::settings::{self, VaultBackup};
use crate::state::AppState;
use crate::vault::OpenVault;
use git2::{BranchType, PushOptions, RemoteCallbacks, Repository};
use serde::Serialize;
use std::cell::RefCell;
use std::path::Path;
use ts_rs::TS;

/// What a backup did.
#[derive(Debug, Clone, Serialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct BackupReport {
    /// The backup repository.
    pub path: String,
    /// How many commits the vault's history has (all of them are in the backup).
    pub commits: u32,
}

const FOREIGN: &str = "The backup folder holds another history. Choose an empty folder.";

/// The repository's name in the backup folder: the vault's name with anything a file name cannot
/// hold made into `_`.
fn repo_name(vault_name: &str) -> String {
    let clean: String = vault_name
        .chars()
        .map(|c| {
            if c.is_alphanumeric() || matches!(c, ' ' | '-' | '_' | '.') {
                c
            } else {
                '_'
            }
        })
        .collect();
    let clean = clean.trim().trim_matches('.').to_string();
    format!("{}.git", if clean.is_empty() { "vault" } else { &clean })
}

/// Copies every branch of `repo` to the backup repository in `folder` (made the first time).
/// A history that the backup does not already have a start of is refused and nothing changes.
pub fn backup(repo: &Repository, vault_name: &str, folder: &Path) -> AppResult<BackupReport> {
    if !folder.is_dir() {
        return Err(AppError::Git(
            "The backup folder is not there (is the disk connected?). Choose it again.".into(),
        ));
    }
    let target = folder.join(repo_name(vault_name));
    if target.exists() {
        Repository::open_bare(&target).map_err(|_| AppError::Git(FOREIGN.into()))?;
    } else {
        Repository::init_bare(&target)?;
    }
    let mut specs = Vec::new();
    for branch in repo.branches(Some(BranchType::Local))? {
        let (branch, _) = branch?;
        if let Some(name) = branch.name()? {
            // No leading `+`: the backup never takes a history that rewrites its own.
            specs.push(format!("refs/heads/{name}:refs/heads/{name}"));
        }
    }
    if specs.is_empty() {
        return Err(AppError::Git("There is nothing to back up yet.".into()));
    }
    let url = target
        .to_str()
        .ok_or_else(|| AppError::Git("The backup folder has a name Mimer cannot use.".into()))?;
    let refused = RefCell::new(false);
    {
        let mut callbacks = RemoteCallbacks::new();
        callbacks.push_update_reference(|_, status| {
            if status.is_some() {
                *refused.borrow_mut() = true;
            }
            Ok(())
        });
        let mut options = PushOptions::new();
        options.remote_callbacks(callbacks);
        let mut remote = repo.remote_anonymous(url)?;
        if let Err(e) = remote.push(&specs, Some(&mut options)) {
            let m = e.message().to_lowercase();
            return Err(AppError::Git(
                if m.contains("fast") || m.contains("reject") || m.contains("not present locally") {
                    FOREIGN.into()
                } else {
                    format!("The backup failed: {}", e.message())
                },
            ));
        }
    }
    if *refused.borrow() {
        return Err(AppError::Git(FOREIGN.into()));
    }
    // The copy opens on the branch the vault is on, so a clone of it has the notes straight away.
    if let Ok(head) = repo.head() {
        if let Ok(name) = head.name() {
            if let Ok(copy) = Repository::open_bare(&target) {
                copy.set_head(name)?;
            }
        }
    }
    let mut walk = repo.revwalk()?;
    walk.push_head()?;
    Ok(BackupReport {
        path: target.to_string_lossy().into_owned(),
        commits: u32::try_from(walk.count()).unwrap_or(u32::MAX),
    })
}

/// What was written about the last backup of the vault at `key` in the settings.
fn record(state: &AppState, key: &str, result: &AppResult<BackupReport>) {
    let Ok(mut s) = state.settings.write() else {
        return;
    };
    let entry = s.backups.entry(key.to_string()).or_default();
    match result {
        Ok(_) => {
            entry.last_ok = Some(chrono::Local::now().to_rfc3339());
            entry.last_error = None;
        }
        Err(e) => entry.last_error = Some(e.to_string()),
    }
    if let Err(e) = settings::save(&state.settings_path, &s) {
        tracing::warn!("could not save the backup result: {e}");
    }
}

/// Saves what is unsaved, backs the vault up to the folder chosen for it, and writes the result
/// (the time, or the error) in the settings.
pub fn run_and_record(state: &AppState, v: &OpenVault) -> AppResult<BackupReport> {
    let key = v.root.to_string_lossy().into_owned();
    let chosen: Option<VaultBackup> = state.settings_snapshot().backups.get(&key).cloned();
    let result = match chosen.filter(|b| !b.folder.trim().is_empty()) {
        None => Err(AppError::Git("Choose a backup folder first.".into())),
        Some(b) => {
            if let Err(e) = v.commit(CommitReason::new(CommitKind::Autosave, None), None) {
                tracing::warn!("commit before the backup failed: {e}");
            }
            let repo = v
                .repo
                .lock()
                .map_err(|_| AppError::Git("The vault is busy.".into()))?;
            backup(&repo, &v.name(), Path::new(&b.folder))
        }
    };
    record(state, &key, &result);
    result
}

#[cfg(test)]
mod tests {
    use super::super::repo::test_util::*;
    use super::*;

    fn head_of(bare: &Path) -> String {
        let r = Repository::open_bare(bare).unwrap();
        let id = r
            .refname_to_id("refs/heads/main")
            .or_else(|_| r.refname_to_id("refs/heads/master"));
        id.unwrap().to_string()
    }

    #[test]
    fn the_first_backup_makes_the_copy_with_every_commit_and_a_clone_has_the_notes() {
        let (d, r) = new_repo();
        write(&d, "a.md", "one");
        commit_all(&r, "first");
        write(&d, "b.md", "two");
        commit_all(&r, "second");
        let out = tempfile::tempdir().unwrap();
        let report = backup(&r, "My notes", out.path()).unwrap();
        assert_eq!(report.commits, 2);
        assert!(out.path().join("My notes.git").is_dir());
        // Getting the notes back: a clone of the backup is a vault.
        let back = tempfile::tempdir().unwrap();
        let clone = Repository::clone(&report.path, back.path()).unwrap();
        assert_eq!(
            std::fs::read_to_string(back.path().join("b.md")).unwrap(),
            "two"
        );
        let head = clone.head().unwrap().peel_to_commit().unwrap();
        assert_eq!(
            String::from_utf8_lossy(head.message_bytes()).trim(),
            "second"
        );
    }

    #[test]
    fn a_second_backup_adds_what_changed() {
        let (d, r) = new_repo();
        write(&d, "a.md", "one");
        commit_all(&r, "first");
        let out = tempfile::tempdir().unwrap();
        let first = backup(&r, "V", out.path()).unwrap();
        let before = head_of(Path::new(&first.path));
        write(&d, "a.md", "changed");
        commit_all(&r, "second");
        let second = backup(&r, "V", out.path()).unwrap();
        assert_eq!(second.commits, 2);
        assert_ne!(head_of(Path::new(&second.path)), before);
        // Nothing new: the same again is fine.
        assert!(backup(&r, "V", out.path()).is_ok());
    }

    #[test]
    fn another_history_in_the_folder_is_refused_and_left_as_it_was() {
        let (d1, r1) = new_repo();
        write(&d1, "a.md", "mine");
        commit_all(&r1, "mine");
        let (d2, r2) = new_repo();
        write(&d2, "x.md", "someone else's");
        commit_all(&r2, "theirs");
        let out = tempfile::tempdir().unwrap();
        let first = backup(&r1, "V", out.path()).unwrap();
        let before = head_of(Path::new(&first.path));
        let err = backup(&r2, "V", out.path()).unwrap_err().to_string();
        assert!(err.contains("another history"), "{err}");
        assert_eq!(head_of(Path::new(&first.path)), before);
    }

    #[test]
    fn a_missing_folder_and_an_empty_repository_give_clear_errors() {
        let (d, r) = new_repo();
        let out = tempfile::tempdir().unwrap();
        let gone = out.path().join("not-there");
        let e = backup(&r, "V", &gone).unwrap_err().to_string();
        assert!(e.contains("not there"), "{e}");
        let e = backup(&r, "V", out.path()).unwrap_err().to_string();
        assert!(e.contains("nothing to back up"), "{e}");
        drop(d);
    }

    #[test]
    fn the_result_of_a_backup_is_written_in_the_settings() {
        let vault_dir = tempfile::tempdir().unwrap();
        std::fs::write(vault_dir.path().join("a.md"), "one").unwrap();
        let v = crate::vault::open_for_test(vault_dir.path());
        let out = tempfile::tempdir().unwrap();
        let settings_dir = tempfile::tempdir().unwrap();
        let key = v.root.to_string_lossy().into_owned();
        let mut s = crate::settings::Settings::default();
        s.backups.insert(
            key.clone(),
            VaultBackup {
                folder: out.path().to_string_lossy().into_owned(),
                ..VaultBackup::default()
            },
        );
        let state = AppState::new(s, settings_dir.path().join("settings.json"), None);
        // Unsaved notes are committed first, so they are in the backup.
        let report = run_and_record(&state, &v).unwrap();
        assert!(report.commits >= 1);
        let after = state.settings_snapshot().backups[&key].clone();
        assert!(after.last_ok.is_some() && after.last_error.is_none());
        // The folder goes away (a disk that is not connected): the error is kept, the last good time stays.
        drop(out);
        let e = run_and_record(&state, &v).unwrap_err().to_string();
        let again = state.settings_snapshot().backups[&key].clone();
        assert_eq!(again.last_error.as_deref(), Some(e.as_str()));
        assert_eq!(again.last_ok, after.last_ok);
        // No folder chosen: a clear message.
        state.settings.write().unwrap().backups.clear();
        assert!(run_and_record(&state, &v)
            .unwrap_err()
            .to_string()
            .contains("Choose a backup folder"));
    }

    #[test]
    fn a_vault_name_a_file_cannot_have_is_made_safe() {
        assert_eq!(repo_name("Work/Notes: 2026"), "Work_Notes_ 2026.git");
        assert_eq!(repo_name("..."), "vault.git");
    }
}
