//! Vault operations that combine file-system changes, link updates, indexing and Git.

use super::{attachments, fs_ops, paths, tree, OpenVault};
use crate::error::{AppError, AppResult};
use crate::git::{history, CommitKind, CommitReason};
use crate::links::{resolve::LinkResolver, rewrite};
use crate::projects;
use serde::Serialize;
use std::collections::HashMap;
use ts_rs::TS;

#[derive(Debug, Clone, Serialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct RenameResult {
    pub changed_files: Vec<String>,
}

#[derive(Debug, Clone, Serialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct RenamePreview {
    pub link_count: u32,
    pub note_count: u32,
}

/// Writes a note to disk (no commit) and updates the index.
pub fn write_note(v: &OpenVault, rel: &str, content: &str) -> AppResult<()> {
    fs_ops::write_note(&v.root, rel, content)?;
    v.reindex(rel)?;
    v.touch();
    Ok(())
}

/// Creates a note and indexes it.
pub fn create_note(v: &OpenVault, folder: &str, name: Option<&str>) -> AppResult<String> {
    let rel = fs_ops::create_note(&v.root, folder, name)?;
    v.refresh_files();
    v.reindex(&rel)?;
    v.touch();
    Ok(rel)
}

/// Creates a folder.
pub fn create_folder(v: &OpenVault, parent: &str, name: &str) -> AppResult<String> {
    let rel = fs_ops::create_folder(&v.root, parent, name)?;
    v.refresh_files();
    Ok(rel)
}

fn compute_moves(files: &[String], from: &str, to: &str) -> HashMap<String, String> {
    let mut moves = HashMap::new();
    if files.iter().any(|f| f == from) {
        moves.insert(from.to_string(), to.to_string());
    } else {
        let prefix = format!("{from}/");
        for f in files.iter().filter(|f| f.starts_with(&prefix)) {
            moves.insert(f.clone(), format!("{to}/{}", &f[prefix.len()..]));
        }
    }
    moves
}

/// Counts links that a rename would rewrite.
pub fn preview_rename(v: &OpenVault, from: &str, to: &str) -> AppResult<RenamePreview> {
    paths::resolve(&v.root, from, None)?;
    paths::resolve(&v.root, to, None)?;
    let files = v.file_list();
    let moves = compute_moves(&files, from, to);
    let before = v.resolver();
    let (mut links, mut notes) = (0u32, 0u32);
    for f in files.iter().filter(|f| tree::is_markdown(f)) {
        let Ok(abs) = paths::resolve(&v.root, f, None) else {
            continue;
        };
        let Ok(content) = std::fs::read_to_string(abs) else {
            continue;
        };
        let n = rewrite::count_affected(&content, &before, &moves);
        if n > 0 {
            links += n as u32;
            notes += 1;
        }
    }
    Ok(RenamePreview {
        link_count: links,
        note_count: notes,
    })
}

/// Renames or moves a file/folder. Optionally rewrites links; one commit for everything.
/// Returns the changed files and the files to commit.
pub fn rename_no_commit(
    v: &OpenVault,
    from: &str,
    to: &str,
    update_links: bool,
) -> AppResult<(RenameResult, Vec<String>)> {
    let before_files = v.file_list();
    let before = v.resolver();
    let moves = compute_moves(&before_files, from, to);
    // A project always stays in the vault root: it can be renamed, but not moved into a folder.
    if to.contains('/') && v.project_list().iter().any(|p| p.folder == from) {
        return Err(AppError::Conflict(
            "A project always stays in the vault root, so it cannot be moved into a folder. Drop other folders and notes into the project instead.".into(),
        ));
    }
    fs_ops::rename(&v.root, from, to)?;

    let mut commit_paths = vec![from.to_string(), to.to_string()];

    // Keep project folders in sync.
    let mut projs = v.project_list();
    for p in projs
        .iter_mut()
        .filter(|p| paths::is_inside(&p.folder, from))
    {
        let renamed_itself = p.folder == from;
        p.folder = format!("{to}{}", &p.folder[from.len()..]);
        // A project that is renamed keeps its folder name as its name, as long as they matched.
        let last = |s: &str| s.rsplit('/').next().unwrap_or(s).to_string();
        if renamed_itself && p.name == last(from) {
            p.name = last(to);
        }
        p.updated_at = projects::now();
        projects::save(&v.root, p)?;
        commit_paths.push(projects::file_path(&p.id));
    }
    v.reload_projects();

    v.refresh_files();
    let after: std::sync::Arc<LinkResolver> = v.resolver();
    let mut changed = Vec::new();
    // A moved note keeps its own relative links and images working (`../attachments/a.png`
    // needs another number of `../` in another folder). This is not optional: without it the
    // note would lose its pictures.
    for (old, new) in moves.iter().filter(|(_, n)| tree::is_markdown(n)) {
        let Ok(abs) = paths::resolve(&v.root, new, None) else {
            continue;
        };
        let Ok(content) = std::fs::read_to_string(abs) else {
            continue;
        };
        if let Some(r) = rewrite::rewrite_relative(&content, old, new, &moves) {
            fs_ops::write_note(&v.root, new, &r.content)?;
            changed.push(new.clone());
        }
    }
    if update_links && !moves.is_empty() {
        for f in v.file_list().iter().filter(|f| tree::is_markdown(f)) {
            let Ok(abs) = paths::resolve(&v.root, f, None) else {
                continue;
            };
            let Ok(content) = std::fs::read_to_string(abs) else {
                continue;
            };
            if let Some(r) = rewrite::rewrite_content(&content, &before, &after, &moves) {
                fs_ops::write_note(&v.root, f, &r.content)?;
                changed.push(f.clone());
            }
        }
    }
    changed.sort();
    changed.dedup();
    commit_paths.extend(changed.iter().cloned());

    // Index: drop old paths, add new ones, refresh rewritten notes.
    v.with_index(|c| {
        crate::search::remove_note(c, from)?;
        crate::search::remove_dir(c, from)
    })?;
    for new in moves.values().chain(changed.iter()) {
        v.reindex(new)?;
    }
    v.touch();
    commit_paths.sort();
    commit_paths.dedup();
    Ok((
        RenameResult {
            changed_files: changed,
        },
        commit_paths,
    ))
}

/// Renames/moves with snapshot + a single `Rename <old> → <new>` commit.
pub fn rename_path(
    v: &OpenVault,
    from: &str,
    to: &str,
    update_links: bool,
) -> AppResult<RenameResult> {
    paths::resolve(&v.root, from, None)?;
    paths::resolve(&v.root, to, None)?;
    v.commit(
        CommitReason::new(CommitKind::SnapshotBeforeRename, Some(from.to_string())),
        None,
    )?;
    let (result, commit_paths) = rename_no_commit(v, from, to, update_links)?;
    v.commit(
        CommitReason::new(CommitKind::Rename, Some(format!("{from} → {to}"))),
        Some(&commit_paths),
    )?;
    Ok(result)
}

/// Renames a note within its folder without making a commit. Used when a new note is named
/// after the title the user types: the content does not change, the history follows the rename at
/// the next commit, and a commit per pause in typing would only clutter the history.
/// Only `.md` files, only inside the same folder, never over an existing file.
pub fn rename_note_quietly(v: &OpenVault, from: &str, to: &str) -> AppResult<()> {
    if !tree::is_markdown(from) || !tree::is_markdown(to) {
        return Err(AppError::InvalidPath(
            "Only notes can be renamed this way".into(),
        ));
    }
    let folder = |p: &str| p.rsplit_once('/').map_or("", |(d, _)| d).to_string();
    if folder(from) != folder(to) {
        return Err(AppError::InvalidPath(
            "The note must stay in its folder".into(),
        ));
    }
    paths::resolve(&v.root, from, None)?;
    paths::resolve(&v.root, to, None)?;
    rename_no_commit(v, from, to, false)?;
    Ok(())
}

/// Deletes a path: snapshot commit, delete, `Delete <path>` commit. Always recoverable.
pub fn delete_path(v: &OpenVault, rel: &str) -> AppResult<()> {
    paths::resolve(&v.root, rel, None)?;
    v.commit(
        CommitReason::new(CommitKind::SnapshotBeforeDelete, Some(rel.to_string())),
        None,
    )?;
    fs_ops::delete(&v.root, rel)?;
    v.with_index(|c| {
        crate::search::remove_note(c, rel)?;
        crate::search::remove_dir(c, rel)
    })?;
    v.refresh_files();
    v.touch();
    v.commit(
        CommitReason::new(CommitKind::Delete, Some(rel.to_string())),
        Some(&[rel.to_string()]),
    )?;
    Ok(())
}

/// Saves a pasted/dropped file and returns the link path relative to the note.
pub fn save_attachment(
    v: &OpenVault,
    note_path: &str,
    file_name: &str,
    bytes: &[u8],
) -> AppResult<String> {
    let cfg = v.config();
    let link = attachments::save_attachment(
        &v.root,
        &cfg.attachments_folder,
        note_path,
        file_name,
        bytes,
    )?;
    v.refresh_files();
    v.touch();
    Ok(link)
}

/// Restores an older version of a file: snapshot, write, commit.
pub fn restore_file(v: &OpenVault, rel: &str, sha: &str) -> AppResult<()> {
    let bytes = v.with_repo(|r| history::bytes_at_commit(r, rel, sha))?;
    let abs = paths::resolve(&v.root, rel, None)?;
    v.commit(
        CommitReason::new(CommitKind::SnapshotBeforeRestore, Some(rel.to_string())),
        Some(&[rel.to_string()]),
    )?;
    fs_ops::write_atomic(&abs, &bytes)?;
    v.reindex(rel)?;
    v.touch();
    let short = &sha[..7.min(sha.len())];
    v.commit(
        CommitReason::new(CommitKind::Restore, Some(format!("{rel} to {short}"))),
        Some(&[rel.to_string()]),
    )?;
    Ok(())
}

/// Brings a deleted file back from the last commit that contained it.
pub fn restore_deleted(v: &OpenVault, rel: &str, sha: &str) -> AppResult<()> {
    let abs = paths::resolve(&v.root, rel, None)?;
    if abs.exists() {
        return Err(AppError::AlreadyExists(format!("{rel} already exists")));
    }
    let bytes = v.with_repo(|r| history::bytes_at_commit(r, rel, sha))?;
    if let Some(dir) = abs.parent() {
        std::fs::create_dir_all(dir)?;
    }
    fs_ops::write_atomic(&abs, &bytes)?;
    v.refresh_files();
    v.reindex(rel)?;
    v.touch();
    let short = &sha[..7.min(sha.len())];
    v.commit(
        CommitReason::new(CommitKind::Restore, Some(format!("{rel} to {short}"))),
        Some(&[rel.to_string()]),
    )?;
    Ok(())
}

/// What one commit did to one file: the bytes before and after (`None` = the file did not exist).
struct FileChange {
    path: String,
    before: Option<Vec<u8>>,
    after: Option<Vec<u8>>,
}

fn changes_of_commit(r: &git2::Repository, sha: &str) -> AppResult<Vec<FileChange>> {
    let oid = git2::Oid::from_str(sha).map_err(|e| AppError::Git(e.to_string()))?;
    let commit = r.find_commit(oid)?;
    let parent = commit
        .parent(0)
        .map_err(|_| AppError::Git("The first commit cannot be undone".into()))?;
    let diff = r.diff_tree_to_tree(Some(&parent.tree()?), Some(&commit.tree()?), None)?;
    let blob = |id: git2::Oid| -> AppResult<Option<Vec<u8>>> {
        if id.is_zero() {
            return Ok(None);
        }
        Ok(Some(r.find_blob(id)?.content().to_vec()))
    };
    let mut out = Vec::new();
    for delta in diff.deltas() {
        let (old, new) = (delta.old_file(), delta.new_file());
        let Some(path) = new.path().or_else(|| old.path()) else {
            continue;
        };
        out.push(FileChange {
            path: path.to_string_lossy().replace('\\', "/"),
            before: blob(old.id())?,
            after: blob(new.id())?,
        });
    }
    Ok(out)
}

/// Undoes the changes an earlier commit made (an AI commit): files it created are removed, files it
/// changed or removed are brought back as they were before it. Nothing is lost: a snapshot is
/// committed first and the undo is a commit of its own, so it can be undone too. Refuses when one
/// of the files was changed after that commit.
pub fn undo_commit(v: &OpenVault, sha: &str) -> AppResult<Vec<String>> {
    let changes = v.with_repo(|r| changes_of_commit(r, sha))?;
    // `.vault/` and hidden files are not notes; the AI never touches them.
    let changes: Vec<FileChange> = changes
        .into_iter()
        .filter(|c| !c.path.split('/').any(|p| p.starts_with('.')))
        .collect();
    if changes.is_empty() {
        return Err(AppError::NotFound("That commit changed no notes".into()));
    }
    for c in &changes {
        let abs = paths::resolve(&v.root, &c.path, None)?;
        let now = std::fs::read(&abs).ok();
        if now != c.after {
            return Err(AppError::Conflict(format!(
                "{} was changed after the AI change, so the change was not undone. Use the version history to restore it.",
                c.path
            )));
        }
    }
    v.commit(
        CommitReason::new(CommitKind::SnapshotBeforeRestore, Some("AI changes".into())),
        None,
    )?;
    let mut touched = Vec::new();
    for c in &changes {
        let abs = paths::resolve(&v.root, &c.path, None)?;
        match &c.before {
            Some(bytes) => {
                if let Some(dir) = abs.parent() {
                    std::fs::create_dir_all(dir)?;
                }
                fs_ops::write_atomic(&abs, bytes)?;
            }
            None => {
                if abs.exists() {
                    std::fs::remove_file(&abs)?;
                }
            }
        }
        touched.push(c.path.clone());
    }
    v.refresh_files();
    for p in &touched {
        v.reindex(p)?;
    }
    v.touch();
    let short = &sha[..7.min(sha.len())];
    v.commit(
        CommitReason::new(CommitKind::Restore, Some(format!("AI changes of {short}"))),
        Some(&touched),
    )?;
    Ok(touched)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::search::{search, SearchQuery};
    use crate::vault::open_for_test;

    fn log_messages(v: &OpenVault) -> Vec<String> {
        v.with_repo(|r| {
            let mut w = r.revwalk()?;
            w.push_head()?;
            Ok(w.filter_map(|o| r.find_commit(o.ok()?).ok())
                .map(|c| c.message().unwrap_or("").to_string())
                .collect())
        })
        .unwrap()
    }

    #[test]
    fn rename_updates_links_in_one_commit_and_index() {
        let d = tempfile::tempdir().unwrap();
        let v = open_for_test(d.path());
        write_note(&v, "Old.md", "# Old topic\nbody").unwrap();
        write_note(&v, "Index.md", "Links: [[Old]] and [[old#Part|alias]]").unwrap();
        v.refresh_files();
        v.commit(CommitReason::new(CommitKind::Save, Some("x".into())), None)
            .unwrap();

        let p = preview_rename(&v, "Old.md", "New.md").unwrap();
        assert_eq!((p.link_count, p.note_count), (2, 1));

        let before = log_messages(&v).len();
        let r = rename_path(&v, "Old.md", "New.md", true).unwrap();
        assert_eq!(r.changed_files, vec!["Index.md"]);
        assert_eq!(
            std::fs::read_to_string(d.path().join("Index.md")).unwrap(),
            "Links: [[New]] and [[New#Part|alias]]"
        );
        let msgs = log_messages(&v);
        assert_eq!(
            msgs.len(),
            before + 1,
            "exactly one commit for a clean rename: {msgs:?}"
        );
        assert_eq!(msgs[0], "Rename Old.md → New.md");
        let hits = v
            .with_index(|c| {
                search(
                    c,
                    &SearchQuery {
                        text: "topic".into(),
                        ..Default::default()
                    },
                )
            })
            .unwrap();
        assert_eq!(hits[0].path, "New.md");
    }

    #[test]
    fn rename_folder_moves_projects_and_links() {
        let d = tempfile::tempdir().unwrap();
        let v = open_for_test(d.path());
        write_note(&v, "Work/Plan.md", "plan").unwrap();
        write_note(&v, "Home.md", "[[Plan]] and [[Work/Plan]]").unwrap();
        v.refresh_files();
        let r = rename_path(&v, "Work", "Job", true).unwrap();
        assert_eq!(r.changed_files, vec!["Home.md"]);
        assert_eq!(
            std::fs::read_to_string(d.path().join("Home.md")).unwrap(),
            "[[Plan]] and [[Plan]]"
        );
        assert!(d.path().join("Job/Plan.md").exists());
    }

    #[test]
    fn delete_is_snapshotted_and_restorable() {
        let d = tempfile::tempdir().unwrap();
        let v = open_for_test(d.path());
        write_note(&v, "Keep.md", "important unsaved text").unwrap();
        v.refresh_files();
        delete_path(&v, "Keep.md").unwrap();
        assert!(!d.path().join("Keep.md").exists());
        let msgs = log_messages(&v);
        assert_eq!(msgs[0], "Delete Keep.md");
        assert!(msgs[1].starts_with("Snapshot before delete"));
        let deleted = v.with_repo(history::deleted_files).unwrap();
        assert_eq!(deleted.len(), 1);
        restore_deleted(&v, "Keep.md", &deleted[0].sha).unwrap();
        assert_eq!(
            std::fs::read_to_string(d.path().join("Keep.md")).unwrap(),
            "important unsaved text"
        );
    }

    #[test]
    fn an_ai_commit_can_be_undone_but_not_over_later_edits() {
        let d = tempfile::tempdir().unwrap();
        let v = open_for_test(d.path());
        write_note(&v, "A.md", "old A").unwrap();
        write_note(&v, "Gone.md", "to be deleted").unwrap();
        v.commit(CommitReason::new(CommitKind::Save, Some("x".into())), None)
            .unwrap();
        // What an AI apply does: edit, create, delete, then one commit.
        write_note(&v, "A.md", "new A").unwrap();
        write_note(&v, "New.md", "created").unwrap();
        std::fs::remove_file(d.path().join("Gone.md")).unwrap();
        v.refresh_files();
        let sha = v
            .commit(CommitReason::new(CommitKind::Ai, Some("AI".into())), None)
            .unwrap()
            .unwrap();

        // An edit after the AI change blocks the undo, and nothing is touched.
        write_note(&v, "A.md", "edited by hand").unwrap();
        let err = undo_commit(&v, &sha).unwrap_err();
        assert!(matches!(err, AppError::Conflict(_)), "{err:?}");
        assert!(d.path().join("New.md").exists());
        write_note(&v, "A.md", "new A").unwrap();

        let touched = undo_commit(&v, &sha).unwrap();
        assert_eq!(touched.len(), 3);
        assert_eq!(
            std::fs::read_to_string(d.path().join("A.md")).unwrap(),
            "old A"
        );
        assert!(!d.path().join("New.md").exists());
        assert_eq!(
            std::fs::read_to_string(d.path().join("Gone.md")).unwrap(),
            "to be deleted"
        );
        // The undo is a commit of its own, and the AI version is still in history.
        assert!(log_messages(&v)[0].contains("AI changes of"));
        let hist = v.with_repo(|r| history::file_history(r, "A.md")).unwrap();
        let texts: Vec<String> = hist
            .iter()
            .map(|e| {
                v.with_repo(|r| history::file_at_commit(r, "A.md", &e.sha))
                    .unwrap()
            })
            .collect();
        assert!(texts.contains(&"new A".to_string()));
    }

    #[test]
    fn a_note_moved_into_a_folder_keeps_its_picture() {
        let d = tempfile::tempdir().unwrap();
        let v = open_for_test(d.path());
        std::fs::create_dir_all(d.path().join("attachments")).unwrap();
        std::fs::write(d.path().join("attachments/pic one.png"), b"png").unwrap();
        std::fs::create_dir_all(d.path().join("Work/Sec")).unwrap();
        write_note(&v, "Note.md", "# N\n\n![](attachments/pic%20one.png)\n").unwrap();
        v.refresh_files();
        v.commit(CommitReason::new(CommitKind::Save, Some("x".into())), None)
            .unwrap();
        // Move into a folder two levels down, with and without link updates.
        let r = rename_path(&v, "Note.md", "Work/Sec/Note.md", false).unwrap();
        assert!(r.changed_files.contains(&"Work/Sec/Note.md".to_string()));
        let text = std::fs::read_to_string(d.path().join("Work/Sec/Note.md")).unwrap();
        assert!(
            text.contains("![](../../attachments/pic%20one.png)"),
            "{text}"
        );
        // The picture the link names exists from the note's new place.
        assert!(d
            .path()
            .join("Work/Sec")
            .join("../../attachments/pic one.png")
            .exists());
        // Moving a folder with the note keeps the link working too.
        rename_path(&v, "Work", "Jobs", true).unwrap();
        let text = std::fs::read_to_string(d.path().join("Jobs/Sec/Note.md")).unwrap();
        assert!(
            text.contains("![](../../attachments/pic%20one.png)"),
            "{text}"
        );
    }

    #[test]
    fn restore_old_version_creates_snapshot_and_commit() {
        let d = tempfile::tempdir().unwrap();
        let v = open_for_test(d.path());
        write_note(&v, "A.md", "v1").unwrap();
        v.commit(
            CommitReason::new(CommitKind::Save, Some("A.md".into())),
            Some(&["A.md".into()]),
        )
        .unwrap();
        write_note(&v, "A.md", "v2").unwrap();
        v.commit(
            CommitReason::new(CommitKind::Save, Some("A.md".into())),
            Some(&["A.md".into()]),
        )
        .unwrap();
        write_note(&v, "A.md", "v3 unsaved").unwrap();
        let hist = v.with_repo(|r| history::file_history(r, "A.md")).unwrap();
        let first = hist.last().unwrap().sha.clone();
        restore_file(&v, "A.md", &first).unwrap();
        assert_eq!(
            std::fs::read_to_string(d.path().join("A.md")).unwrap(),
            "v1"
        );
        // The unsaved v3 is still in history via the snapshot commit.
        let hist = v.with_repo(|r| history::file_history(r, "A.md")).unwrap();
        let contents: Vec<String> = hist
            .iter()
            .map(|e| {
                v.with_repo(|r| history::file_at_commit(r, "A.md", &e.sha))
                    .unwrap()
            })
            .collect();
        assert!(contents.contains(&"v3 unsaved".to_string()));
    }

    #[test]
    fn open_commits_dirty_tree_and_gitignores_index() {
        let d = tempfile::tempdir().unwrap();
        std::fs::write(d.path().join("pre.md"), "hello").unwrap();
        let v = open_for_test(d.path());
        assert_eq!(log_messages(&v), vec!["Initialize vault"]);
        drop(v);
        std::fs::write(d.path().join("later.md"), "x").unwrap();
        let v = open_for_test(d.path());
        assert_eq!(log_messages(&v)[0], "Recovered uncommitted changes");
        let tree_has_index = v
            .with_repo(|r| {
                Ok(r.head()?
                    .peel_to_tree()?
                    .get_path(std::path::Path::new(".vault/index.db"))
                    .is_ok())
            })
            .unwrap();
        assert!(!tree_has_index);
    }

    #[test]
    fn a_new_note_is_renamed_quietly_with_no_commit_and_the_index_follows() {
        let dir = tempfile::tempdir().unwrap();
        let v = open_for_test(dir.path());
        std::fs::write(dir.path().join("Untitled.md"), "# Weekly sync\n\nbody").unwrap();
        v.refresh_files();
        v.reindex("Untitled.md").unwrap();
        let count = |v: &OpenVault| {
            v.with_repo(|r| {
                let mut w = r.revwalk()?;
                w.push_head()?;
                Ok(w.count())
            })
            .unwrap()
        };
        let before = count(&v);
        rename_note_quietly(&v, "Untitled.md", "Weekly sync.md").unwrap();
        assert!(!dir.path().join("Untitled.md").exists());
        assert_eq!(
            std::fs::read_to_string(dir.path().join("Weekly sync.md")).unwrap(),
            "# Weekly sync\n\nbody"
        );
        assert_eq!(count(&v), before, "no commit is made");
        let hits = v
            .with_index(|c| {
                crate::search::search(
                    c,
                    &crate::search::SearchQuery {
                        text: "body".into(),
                        tag: None,
                        folder: None,
                    },
                )
            })
            .unwrap();
        assert_eq!(hits.len(), 1);
        assert_eq!(hits[0].path, "Weekly sync.md");
    }

    #[test]
    fn quiet_rename_refuses_other_folders_other_file_types_and_existing_files() {
        let dir = tempfile::tempdir().unwrap();
        let v = open_for_test(dir.path());
        std::fs::create_dir_all(dir.path().join("Work")).unwrap();
        std::fs::write(dir.path().join("Work/a.md"), "a").unwrap();
        std::fs::write(dir.path().join("Work/b.md"), "b").unwrap();
        std::fs::write(dir.path().join("Work/pic.png"), "p").unwrap();
        v.refresh_files();
        assert!(rename_note_quietly(&v, "Work/a.md", "Other/a.md").is_err());
        assert!(rename_note_quietly(&v, "Work/a.md", "a.md").is_err());
        assert!(rename_note_quietly(&v, "Work/pic.png", "Work/pic2.png").is_err());
        assert!(rename_note_quietly(&v, "Work/a.md", "Work/a.txt").is_err());
        assert!(rename_note_quietly(&v, "Work/a.md", "Work/b.md").is_err());
        assert!(rename_note_quietly(&v, "Work/a.md", "../x.md").is_err());
        assert_eq!(
            std::fs::read_to_string(dir.path().join("Work/b.md")).unwrap(),
            "b"
        );
        assert!(dir.path().join("Work/a.md").exists());
    }

    #[test]
    fn a_project_can_be_renamed_in_the_root_but_not_moved_into_a_folder() {
        let d = tempfile::tempdir().unwrap();
        let v = open_for_test(d.path());
        let p = crate::projects::service::create(&v, "Docs", String::new(), None).unwrap();
        std::fs::create_dir_all(v.root.join("Other")).unwrap();
        v.refresh_files();
        // Moving into a folder is refused, and nothing changed.
        let err = rename_path(&v, "Docs", "Other/Docs", false).unwrap_err();
        assert!(matches!(err, AppError::Conflict(m) if m.contains("stays in the vault root")));
        assert!(v.root.join("Docs").is_dir());
        // Renaming in the root works, and the project follows its folder (also its name).
        rename_path(&v, "Docs", "Manuals", false).unwrap();
        let moved = v.project_list().into_iter().find(|x| x.id == p.id).unwrap();
        assert_eq!(moved.folder, "Manuals");
        assert_eq!(moved.name, "Manuals");
    }
}
