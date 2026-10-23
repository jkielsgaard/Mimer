//! A hand-made order for the files and folders in the file tree, and for the epic tasks in the
//! task list, in `.vault/order.json`.
//!
//! The file lists, per folder, the names (not paths) in the order the user chose. Names that are
//! not in the list (new files) come after the listed ones; listed names that no longer exist are
//! ignored. The file is plain JSON and committed to Git with the rest of the vault.

use crate::error::{AppError, AppResult};
use crate::vault::{fs_ops, paths};
use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;
use std::path::Path;
use ts_rs::TS;

const FILE: &str = ".vault/order.json";
/// Most names kept per folder (a safety limit against a runaway file).
const MAX_NAMES: usize = 5_000;

/// The chosen order: folder path (`""` for the vault root) → names in order.
#[derive(Debug, Clone, Default, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase", default)]
#[ts(export)]
pub struct TreeOrder {
    pub folders: BTreeMap<String, Vec<String>>,
}

#[derive(Debug, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase", default)]
struct OrderFile {
    schema_version: u32,
    folders: BTreeMap<String, Vec<String>>,
    /// The epic tasks (note paths) in the order the user chose.
    epics: Vec<String>,
}

fn read_file(root: &Path) -> OrderFile {
    paths::resolve_internal(root, FILE)
        .ok()
        .and_then(|p| std::fs::read_to_string(p).ok())
        .and_then(|s| serde_json::from_str(&s).ok())
        .unwrap_or_default()
}

fn write_file(root: &Path, mut file: OrderFile) -> AppResult<()> {
    file.schema_version = 1;
    let abs = paths::resolve_internal(root, FILE)?;
    fs_ops::write_atomic(&abs, serde_json::to_string_pretty(&file)?.as_bytes())
}

/// Reads the saved order. A missing or unreadable file means "no order chosen yet".
pub fn load(root: &Path) -> TreeOrder {
    TreeOrder {
        folders: read_file(root).folders,
    }
}

/// The epic tasks in the order the user chose (note paths). Epics not in it come after them.
pub fn load_epics(root: &Path) -> Vec<String> {
    read_file(root).epics
}

/// Saves the order of the epic tasks: vault-relative note paths.
pub fn set_epics(root: &Path, epics: &[String]) -> AppResult<()> {
    if epics.len() > MAX_NAMES {
        return Err(AppError::InvalidPath("Too many epic tasks".into()));
    }
    for p in epics {
        let bad = p.is_empty()
            || p.starts_with('/')
            || p.contains('\\')
            || p.split('/')
                .any(|seg| seg.is_empty() || seg == ".." || seg == ".")
            || p.chars().any(char::is_control)
            || !p.to_lowercase().ends_with(".md");
        if bad {
            return Err(AppError::InvalidPath(format!("Not a note path: {p}")));
        }
    }
    let mut file = read_file(root);
    file.epics = epics.to_vec();
    write_file(root, file)
}

/// Saves the order of one folder. An empty list removes the folder's entry.
/// Names must be plain file or folder names (no `/`, `\`, `..`, empty or control characters).
pub fn set_folder(root: &Path, folder: &str, names: &[String]) -> AppResult<()> {
    paths::resolve_dir(root, folder, None)?;
    if names.len() > MAX_NAMES {
        return Err(AppError::InvalidPath("Too many names in one folder".into()));
    }
    for n in names {
        if n.is_empty()
            || n == ".."
            || n == "."
            || n.contains(['/', '\\'])
            || n.chars().any(char::is_control)
        {
            return Err(AppError::InvalidPath(format!("Not a file name: {n}")));
        }
    }
    let mut file = read_file(root);
    if names.is_empty() {
        file.folders.remove(folder);
    } else {
        file.folders.insert(folder.to_string(), names.to_vec());
    }
    write_file(root, file)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn vault() -> tempfile::TempDir {
        let d = tempfile::tempdir().unwrap();
        std::fs::create_dir_all(d.path().join(".vault")).unwrap();
        std::fs::create_dir_all(d.path().join("Work")).unwrap();
        d
    }

    fn names(v: &[&str]) -> Vec<String> {
        v.iter().map(|s| (*s).to_string()).collect()
    }

    #[test]
    fn a_missing_file_means_no_order() {
        let d = vault();
        assert!(load(d.path()).folders.is_empty());
    }

    #[test]
    fn the_order_of_several_folders_is_saved_and_read_back() {
        let d = vault();
        set_folder(d.path(), "", &names(&["Work", "Home.md"])).unwrap();
        set_folder(d.path(), "Work", &names(&["b.md", "a.md"])).unwrap();
        let got = load(d.path());
        assert_eq!(got.folders[""], names(&["Work", "Home.md"]));
        assert_eq!(got.folders["Work"], names(&["b.md", "a.md"]));
    }

    #[test]
    fn an_empty_list_removes_the_folder_entry() {
        let d = vault();
        set_folder(d.path(), "Work", &names(&["a.md"])).unwrap();
        set_folder(d.path(), "Work", &[]).unwrap();
        assert!(load(d.path()).folders.is_empty());
    }

    #[test]
    fn bad_folders_and_bad_names_are_refused() {
        let d = vault();
        assert!(set_folder(d.path(), "../x", &names(&["a.md"])).is_err());
        assert!(set_folder(d.path(), ".git", &names(&["a.md"])).is_err());
        assert!(set_folder(d.path(), "", &names(&["../a.md"])).is_err());
        assert!(set_folder(d.path(), "", &names(&["x/y.md"])).is_err());
        assert!(set_folder(d.path(), "", &names(&[""])).is_err());
        assert!(load(d.path()).folders.is_empty());
    }

    #[test]
    fn a_damaged_file_is_treated_as_no_order() {
        let d = vault();
        std::fs::write(d.path().join(FILE), "{ not json").unwrap();
        assert!(load(d.path()).folders.is_empty());
    }

    #[test]
    fn the_epic_order_is_kept_next_to_the_folder_order() {
        let d = vault();
        let order = vec!["Tasks/B.md".to_string(), "Work/Plan.md".to_string()];
        set_epics(d.path(), &order).unwrap();
        set_folder(d.path(), "", &["a.md".into()]).unwrap();
        assert_eq!(
            load_epics(d.path()),
            order,
            "saving a folder keeps the epics"
        );
        assert_eq!(load(d.path()).folders.get("").map(Vec::len), Some(1));
        for bad in ["../x.md", "/x.md", "Tasks\\x.md", "Tasks/x.txt", ""] {
            assert!(set_epics(d.path(), &[bad.to_string()]).is_err(), "{bad}");
        }
    }
}
