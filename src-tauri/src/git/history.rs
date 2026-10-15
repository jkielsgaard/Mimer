//! File history, deleted-file discovery and reading old versions.

use super::{CommitEntry, DeletedFile};
use crate::error::{AppError, AppResult};
use git2::{Delta, DiffFindOptions, Oid, Repository, Sort};
use std::collections::HashSet;
use std::path::Path;

fn diff_for<'a>(repo: &'a Repository, commit: &git2::Commit) -> AppResult<git2::Diff<'a>> {
    let tree = commit.tree()?;
    let parent_tree = commit.parent(0).ok().and_then(|p| p.tree().ok());
    let mut diff = repo.diff_tree_to_tree(parent_tree.as_ref(), Some(&tree), None)?;
    let mut find = DiffFindOptions::new();
    find.renames(true);
    diff.find_similar(Some(&mut find))?;
    Ok(diff)
}

fn entry(commit: &git2::Commit, path: &str) -> CommitEntry {
    let sha = commit.id().to_string();
    CommitEntry {
        short_sha: sha[..7.min(sha.len())].to_string(),
        sha,
        message: commit
            .message()
            .unwrap_or("")
            .lines()
            .next()
            .unwrap_or("")
            .to_string(),
        time: commit.time().seconds(),
        path: path.to_string(),
    }
}

/// Commits touching `path`, newest first, following renames.
pub fn file_history(repo: &Repository, path: &str) -> AppResult<Vec<CommitEntry>> {
    if repo.head().is_err() {
        return Ok(Vec::new());
    }
    let mut walk = repo.revwalk()?;
    walk.push_head()?;
    walk.set_sorting(Sort::TOPOLOGICAL | Sort::TIME)?;
    let mut current = path.to_string();
    let mut out = Vec::new();
    for oid in walk {
        let commit = repo.find_commit(oid?)?;
        let diff = diff_for(repo, &commit)?;
        let mut touched = false;
        let mut next = current.clone();
        for delta in diff.deltas() {
            let new_p = delta
                .new_file()
                .path()
                .map(|p| p.to_string_lossy().replace('\\', "/"));
            let old_p = delta
                .old_file()
                .path()
                .map(|p| p.to_string_lossy().replace('\\', "/"));
            match delta.status() {
                Delta::Renamed if new_p.as_deref() == Some(current.as_str()) => {
                    touched = true;
                    next = old_p.unwrap_or_else(|| current.clone());
                }
                Delta::Deleted if old_p.as_deref() == Some(current.as_str()) => touched = true,
                Delta::Renamed | Delta::Deleted => {}
                _ if new_p.as_deref() == Some(current.as_str()) => touched = true,
                _ => {}
            }
        }
        if touched {
            out.push(entry(&commit, &current));
        }
        current = next;
    }
    Ok(out)
}

fn blob_at(repo: &Repository, sha: &str, path: &str) -> AppResult<Option<Vec<u8>>> {
    let commit = repo.find_commit(Oid::from_str(sha)?)?;
    let tree = commit.tree()?;
    match tree.get_path(Path::new(path)) {
        Ok(e) => Ok(Some(repo.find_blob(e.id())?.content().to_vec())),
        Err(_) => Ok(None),
    }
}

/// Raw bytes of `path` at `sha`. If the file had a different name then, history is used to find it.
pub fn bytes_at_commit(repo: &Repository, path: &str, sha: &str) -> AppResult<Vec<u8>> {
    if let Some(b) = blob_at(repo, sha, path)? {
        return Ok(b);
    }
    for e in file_history(repo, path)? {
        if e.sha == sha {
            if let Some(b) = blob_at(repo, sha, &e.path)? {
                return Ok(b);
            }
        }
    }
    Err(AppError::NotFound(format!(
        "{path} does not exist in commit {sha}"
    )))
}

/// Text content of `path` at `sha`.
pub fn file_at_commit(repo: &Repository, path: &str, sha: &str) -> AppResult<String> {
    Ok(String::from_utf8_lossy(&bytes_at_commit(repo, path, sha)?).into_owned())
}

fn path_in_head(repo: &Repository, path: &str) -> bool {
    repo.head()
        .ok()
        .and_then(|h| h.peel_to_tree().ok())
        .is_some_and(|t| t.get_path(Path::new(path)).is_ok())
}

/// Files that existed in a past commit but are not in `HEAD` (renames excluded).
pub fn deleted_files(repo: &Repository) -> AppResult<Vec<DeletedFile>> {
    if repo.head().is_err() {
        return Ok(Vec::new());
    }
    let mut walk = repo.revwalk()?;
    walk.push_head()?;
    walk.set_sorting(Sort::TOPOLOGICAL | Sort::TIME)?;
    let mut seen: HashSet<String> = HashSet::new();
    let mut out = Vec::new();
    for oid in walk {
        let commit = repo.find_commit(oid?)?;
        let Ok(parent) = commit.parent(0) else {
            continue;
        };
        let diff = diff_for(repo, &commit)?;
        for delta in diff.deltas() {
            if delta.status() != Delta::Deleted {
                continue;
            }
            let Some(p) = delta.old_file().path() else {
                continue;
            };
            let p = p.to_string_lossy().replace('\\', "/");
            if p.split('/').any(|s| s.starts_with('.'))
                || seen.contains(&p)
                || path_in_head(repo, &p)
            {
                continue;
            }
            seen.insert(p.clone());
            let e = entry(&parent, &p);
            out.push(DeletedFile {
                path: p,
                sha: e.sha,
                short_sha: e.short_sha,
                message: e.message,
                time: e.time,
            });
        }
    }
    Ok(out)
}

#[cfg(test)]
mod tests {
    use super::super::repo::test_util::*;
    use super::*;

    #[test]
    fn history_follows_renames() {
        let (d, r) = new_repo();
        write(&d, "old.md", "line one\nline two\nline three\nline four\n");
        commit_all(&r, "create");
        write(
            &d,
            "old.md",
            "line one\nline two\nline three\nline four\nfive\n",
        );
        commit_all(&r, "edit");
        std::fs::rename(d.path().join("old.md"), d.path().join("new.md")).unwrap();
        commit_all(&r, "rename");
        write(
            &d,
            "new.md",
            "line one\nline two\nline three\nline four\nfive\nsix\n",
        );
        commit_all(&r, "edit again");
        let h = file_history(&r, "new.md").unwrap();
        let msgs: Vec<_> = h.iter().map(|e| e.message.as_str()).collect();
        assert_eq!(msgs, vec!["edit again", "rename", "edit", "create"]);
        assert_eq!(h[3].path, "old.md");
        let old = file_at_commit(&r, "new.md", &h[3].sha).unwrap();
        assert!(old.starts_with("line one") && !old.contains("five"));
    }

    #[test]
    fn lists_deleted_files_but_not_renames() {
        let (d, r) = new_repo();
        write(
            &d,
            "gone.md",
            "to be deleted, with enough content\nsecond line\nthird\n",
        );
        write(
            &d,
            "moved.md",
            "this one moves, with enough content\nsecond\nthird\n",
        );
        write(&d, "stays.md", "stays");
        commit_all(&r, "add");
        std::fs::remove_file(d.path().join("gone.md")).unwrap();
        std::fs::rename(d.path().join("moved.md"), d.path().join("moved2.md")).unwrap();
        commit_all(&r, "delete and move");
        let del = deleted_files(&r).unwrap();
        assert_eq!(del.len(), 1);
        assert_eq!(del[0].path, "gone.md");
        let content = file_at_commit(&r, "gone.md", &del[0].sha).unwrap();
        assert!(content.starts_with("to be deleted"));
    }
}
