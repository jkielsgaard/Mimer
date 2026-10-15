//! Repository init and commit creation.

use crate::error::{AppError, AppResult};
use git2::{IndexAddOption, Repository, RepositoryInitOptions, Signature, Status, StatusOptions};
use std::path::Path;

/// Lines Mimer appends to `.gitignore`.
pub const GITIGNORE_LINES: [&str; 6] = [
    ".vault/index.db",
    ".vault/index.db-*",
    ".vault/cache/",
    ".vault/chats/",
    ".vault/embeddings.db",
    ".vault/embeddings.db-*",
];

/// Opens the repository at `root`, creating it (branch `main`) if missing.
/// Returns the repo and whether it was newly created.
pub fn init_or_open(root: &Path) -> AppResult<(Repository, bool)> {
    match Repository::open(root) {
        Ok(r) => Ok((r, false)),
        Err(_) => {
            let mut opts = RepositoryInitOptions::new();
            opts.initial_head("main");
            Ok((Repository::init_opts(root, &opts)?, true))
        }
    }
}

/// Appends the Mimer ignore lines to `.gitignore` (never overwrites existing content).
pub fn ensure_gitignore(root: &Path) -> AppResult<()> {
    let path = root.join(".gitignore");
    let existing = std::fs::read_to_string(&path).unwrap_or_default();
    let missing: Vec<&str> = GITIGNORE_LINES
        .iter()
        .copied()
        .filter(|l| !existing.lines().any(|e| e.trim() == *l))
        .collect();
    if missing.is_empty() {
        return Ok(());
    }
    let mut out = existing;
    if !out.is_empty() && !out.ends_with('\n') {
        out.push('\n');
    }
    for l in missing {
        out.push_str(l);
        out.push('\n');
    }
    std::fs::write(path, out)?;
    Ok(())
}

/// True when the working tree has uncommitted (non-ignored) changes.
pub fn is_dirty(repo: &Repository) -> AppResult<bool> {
    let mut opts = StatusOptions::new();
    opts.include_untracked(true)
        .recurse_untracked_dirs(true)
        .include_ignored(false);
    let statuses = repo.statuses(Some(&mut opts))?;
    Ok(statuses
        .iter()
        .any(|s| s.status() != Status::CURRENT && s.status() != Status::IGNORED))
}

fn stage_path(repo: &Repository, index: &mut git2::Index, rel: &str) -> AppResult<()> {
    let root = repo
        .workdir()
        .ok_or_else(|| AppError::Git("Bare repository".into()))?;
    let abs = root.join(rel);
    if abs.is_dir() {
        index.add_all([rel], IndexAddOption::DEFAULT, None)?;
        index.update_all([rel], None)?;
    } else if abs.exists() {
        index.add_path(Path::new(rel))?;
    } else if index.get_path(Path::new(rel), 0).is_some() {
        index.remove_path(Path::new(rel))?;
    } else {
        // Possibly a removed directory: drop everything beneath it.
        let _ = index.remove_dir(Path::new(rel), 0);
    }
    Ok(())
}

/// Stages `paths` (or everything) and commits. Returns the new SHA, or `None` if
/// nothing changed — empty commits are never created.
pub fn commit(
    repo: &Repository,
    paths: Option<&[String]>,
    message: &str,
    author_name: &str,
    author_email: &str,
) -> AppResult<Option<String>> {
    let mut index = repo.index()?;
    index.read(true)?;
    match paths {
        None => {
            index.add_all(["*"], IndexAddOption::DEFAULT, None)?;
            index.update_all(["*"], None)?;
        }
        Some(list) => {
            for p in list {
                stage_path(repo, &mut index, p)?;
            }
        }
    }
    index.write()?;
    let tree_id = index.write_tree()?;
    let parent = repo.head().ok().and_then(|h| h.peel_to_commit().ok());
    if let Some(p) = &parent {
        if p.tree_id() == tree_id {
            return Ok(None);
        }
    } else if repo.find_tree(tree_id)?.is_empty() {
        return Ok(None);
    }
    let tree = repo.find_tree(tree_id)?;
    let sig = Signature::now(author_name, author_email)?;
    let parents: Vec<&git2::Commit> = parent.iter().collect();
    let oid = repo.commit(Some("HEAD"), &sig, &sig, message, &tree, &parents)?;
    Ok(Some(oid.to_string()))
}

#[cfg(test)]
pub(crate) mod test_util {
    use super::*;

    pub fn new_repo() -> (tempfile::TempDir, Repository) {
        let d = tempfile::tempdir().unwrap();
        let (r, _) = init_or_open(d.path()).unwrap();
        (d, r)
    }

    pub fn write(d: &tempfile::TempDir, rel: &str, content: &str) {
        let p = d.path().join(rel);
        std::fs::create_dir_all(p.parent().unwrap()).unwrap();
        std::fs::write(p, content).unwrap();
    }

    pub fn commit_all(r: &Repository, msg: &str) -> Option<String> {
        commit(r, None, msg, "T", "t@t").unwrap()
    }
}

#[cfg(test)]
mod tests {
    use super::test_util::*;
    use super::*;

    #[test]
    fn no_empty_commits() {
        let (d, r) = new_repo();
        assert!(commit_all(&r, "empty").is_none());
        write(&d, "a.md", "1");
        assert!(commit_all(&r, "first").is_some());
        assert!(commit_all(&r, "again").is_none());
        write(&d, "a.md", "2");
        assert!(
            commit(&r, Some(&["a.md".to_string()]), "second", "T", "t@t")
                .unwrap()
                .is_some()
        );
        assert!(commit(&r, Some(&["a.md".to_string()]), "dup", "T", "t@t")
            .unwrap()
            .is_none());
        assert_eq!(r.head().unwrap().shorthand().unwrap(), "main");
    }

    #[test]
    fn partial_commit_leaves_other_changes_uncommitted() {
        let (d, r) = new_repo();
        write(&d, "a.md", "1");
        write(&d, "b.md", "1");
        commit(&r, Some(&["a.md".to_string()]), "only a", "T", "t@t").unwrap();
        assert!(is_dirty(&r).unwrap());
        let head = r.head().unwrap().peel_to_tree().unwrap();
        assert!(head.get_name("a.md").is_some());
        assert!(head.get_name("b.md").is_none());
    }

    #[test]
    fn gitignore_is_appended_not_overwritten() {
        let d = tempfile::tempdir().unwrap();
        std::fs::write(d.path().join(".gitignore"), "target").unwrap();
        ensure_gitignore(d.path()).unwrap();
        ensure_gitignore(d.path()).unwrap();
        let s = std::fs::read_to_string(d.path().join(".gitignore")).unwrap();
        assert!(s.starts_with("target\n.vault/index.db\n"));
        assert_eq!(s.matches(".vault/index.db\n").count(), 1);
    }

    #[test]
    fn deletions_are_committed() {
        let (d, r) = new_repo();
        write(&d, "dir/a.md", "1");
        commit_all(&r, "add");
        std::fs::remove_dir_all(d.path().join("dir")).unwrap();
        assert!(commit(&r, Some(&["dir".to_string()]), "del", "T", "t@t")
            .unwrap()
            .is_some());
        assert!(r
            .head()
            .unwrap()
            .peel_to_tree()
            .unwrap()
            .get_name("dir")
            .is_none());
    }
}
