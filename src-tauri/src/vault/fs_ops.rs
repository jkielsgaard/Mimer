//! Plain file-system operations. All paths are vault-relative and validated.

use super::paths::{resolve, resolve_dir};
use crate::error::{AppError, AppResult};
use serde::Serialize;
use std::ffi::OsStr;
use std::path::Path;
use ts_rs::TS;

/// A note read from disk.
#[derive(Debug, Clone, Serialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct NoteContent {
    pub path: String,
    pub content: String,
    /// Milliseconds since the Unix epoch.
    #[ts(type = "number")]
    pub mtime: i64,
}

/// Modification time of a file in milliseconds since the epoch.
pub fn mtime_ms(path: &Path) -> i64 {
    std::fs::metadata(path)
        .and_then(|m| m.modified())
        .ok()
        .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
        .map(|d| d.as_millis() as i64)
        .unwrap_or(0)
}

/// Validates a single file or folder name.
pub fn validate_name(name: &str) -> AppResult<String> {
    let name = name.trim();
    if name.is_empty() {
        return Err(AppError::InvalidPath("Name is empty".into()));
    }
    if name.starts_with('.') {
        return Err(AppError::InvalidPath(
            "Names cannot start with a dot".into(),
        ));
    }
    if name.chars().any(|c| {
        matches!(c, '/' | '\\' | ':' | '*' | '?' | '"' | '<' | '>' | '|') || c.is_control()
    }) {
        return Err(AppError::InvalidPath(format!(
            "Name contains invalid characters: {name}"
        )));
    }
    Ok(name.to_string())
}

/// Reads a note.
pub fn read_note(root: &Path, rel: &str) -> AppResult<NoteContent> {
    let abs = resolve(root, rel, None)?;
    let bytes = std::fs::read(&abs)?;
    Ok(NoteContent {
        path: rel.to_string(),
        content: String::from_utf8_lossy(&bytes).into_owned(),
        mtime: mtime_ms(&abs),
    })
}

/// Writes a file atomically (temp file in the same folder, then rename).
pub fn write_note(root: &Path, rel: &str, content: &str) -> AppResult<()> {
    let abs = resolve(root, rel, None)?;
    write_atomic(&abs, content.as_bytes())
}

/// Writes bytes to a file atomically: a temp file in the same folder, then a rename.
/// A crash leaves either the old file or the new one, never a half-written file.
pub fn write_atomic(abs: &Path, bytes: &[u8]) -> AppResult<()> {
    if let Some(dir) = abs.parent() {
        std::fs::create_dir_all(dir)?;
    }
    let name = abs
        .file_name()
        .map(|n| n.to_string_lossy().into_owned())
        .unwrap_or_default();
    let tmp = abs.with_file_name(format!(".{name}.mimer-tmp"));
    std::fs::write(&tmp, bytes)?;
    if let Err(e) = std::fs::rename(&tmp, abs) {
        let _ = std::fs::remove_file(&tmp);
        return Err(e.into());
    }
    Ok(())
}

/// Creates a note. Without a name: `Untitled.md`, `Untitled 1.md`, …
pub fn create_note(root: &Path, folder: &str, name: Option<&str>) -> AppResult<String> {
    let dir = resolve_dir(root, folder, None)?;
    std::fs::create_dir_all(&dir)?;
    let prefix = if folder.is_empty() {
        String::new()
    } else {
        format!("{}/", folder.trim_end_matches('/'))
    };
    let file_name = match name {
        Some(n) => {
            let n = validate_name(n)?;
            let n = if n.to_lowercase().ends_with(".md") {
                n
            } else {
                format!("{n}.md")
            };
            ensure_name_free(&dir, &n, false, None)?;
            n
        }
        None => {
            let mut candidate = "Untitled.md".to_string();
            let mut i = 1;
            while ensure_name_free(&dir, &candidate, false, None).is_err() {
                candidate = format!("Untitled {i}.md");
                i += 1;
            }
            candidate
        }
    };
    let rel = format!("{prefix}{file_name}");
    write_note(root, &rel, "")?;
    Ok(rel)
}

/// The name an entry is shown with in the tree, lower-cased for comparing: a note without its
/// `.md`, everything else as it is. Two entries with the same key look the same to the user.
fn display_key(name: &str, is_dir: bool) -> String {
    let lower = name.to_lowercase();
    if !is_dir {
        if let Some(stem) = lower.strip_suffix(".md") {
            return stem.to_string();
        }
    }
    lower
}

/// Fails with `AlreadyExists` when `dir` already holds an entry that would look the same as a new
/// entry called `name` in the file tree: the same name ignoring upper/lower case, a note counting
/// without its `.md` (so a note `Work.md` and a folder `Work` collide). The entry called `except`
/// is not counted (a rename that only changes the case of its own name).
pub fn ensure_name_free(
    dir: &Path,
    name: &str,
    is_dir: bool,
    except: Option<&OsStr>,
) -> AppResult<()> {
    let wanted = display_key(name, is_dir);
    let Ok(read) = std::fs::read_dir(dir) else {
        return Ok(());
    };
    for entry in read.flatten() {
        let file_name = entry.file_name();
        if except == Some(file_name.as_os_str()) {
            continue;
        }
        let existing = file_name.to_string_lossy().to_string();
        if existing.starts_with('.') {
            continue;
        }
        let existing_is_dir = entry.file_type().map(|t| t.is_dir()).unwrap_or(false);
        if display_key(&existing, existing_is_dir) != wanted {
            continue;
        }
        let (kind, shown) = if existing_is_dir {
            ("folder", existing.clone())
        } else if existing.to_lowercase().ends_with(".md") {
            ("note", existing[..existing.len() - 3].to_string())
        } else {
            ("file", existing.clone())
        };
        let place = dir
            .file_name()
            .map(|n| format!("“{}”", n.to_string_lossy()))
            .unwrap_or_else(|| "this folder".into());
        return Err(AppError::AlreadyExists(format!(
            "A {kind} called “{shown}” already exists in {place}."
        )));
    }
    Ok(())
}

/// Creates a folder (and returns its vault-relative path).
pub fn create_folder(root: &Path, parent: &str, name: &str) -> AppResult<String> {
    let name = validate_name(name)?;
    let dir = resolve_dir(root, parent, None)?;
    let target = dir.join(&name);
    ensure_name_free(&dir, &name, true, None)?;
    let rel = if parent.is_empty() {
        name
    } else {
        format!("{}/{}", parent.trim_end_matches('/'), name)
    };
    resolve(root, &rel, None)?;
    std::fs::create_dir_all(&target)?;
    Ok(rel)
}

/// Renames or moves a file or folder on disk (no Git, no link updates).
pub fn rename(root: &Path, from: &str, to: &str) -> AppResult<()> {
    let a = resolve(root, from, None)?;
    let b = resolve(root, to, None)?;
    if !a.exists() {
        return Err(AppError::NotFound(format!("{from} does not exist")));
    }
    if b.starts_with(&a) {
        return Err(AppError::InvalidPath(
            "Cannot move a folder into itself".into(),
        ));
    }
    if let (Some(dir), Some(name)) = (b.parent(), b.file_name()) {
        // Only the entry being renamed may keep the same name apart from its case.
        let own = (a.parent() == Some(dir)).then(|| a.file_name()).flatten();
        if dir.exists() {
            ensure_name_free(dir, &name.to_string_lossy(), a.is_dir(), own)?;
        }
        std::fs::create_dir_all(dir)?;
    }
    if b.exists() && !same_entry(&a, &b) {
        return Err(AppError::AlreadyExists(format!("{to} already exists")));
    }
    std::fs::rename(&a, &b)?;
    Ok(())
}

/// True when both paths are the same file (a rename that changes only the case on a case-insensitive disk).
fn same_entry(a: &Path, b: &Path) -> bool {
    match (std::fs::canonicalize(a), std::fs::canonicalize(b)) {
        (Ok(x), Ok(y)) => x == y,
        _ => false,
    }
}

/// Deletes a file or folder from disk (callers must commit a snapshot first).
pub fn delete(root: &Path, rel: &str) -> AppResult<()> {
    let abs = resolve(root, rel, None)?;
    if abs.is_dir() {
        std::fs::remove_dir_all(&abs)?;
    } else if abs.exists() {
        std::fs::remove_file(&abs)?;
    } else {
        return Err(AppError::NotFound(format!("{rel} does not exist")));
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn create_note_numbers_untitled() {
        let d = tempfile::tempdir().unwrap();
        assert_eq!(create_note(d.path(), "", None).unwrap(), "Untitled.md");
        assert_eq!(create_note(d.path(), "", None).unwrap(), "Untitled 1.md");
        assert_eq!(
            create_note(d.path(), "sub", None).unwrap(),
            "sub/Untitled.md"
        );
    }

    #[test]
    fn write_and_read_roundtrip() {
        let d = tempfile::tempdir().unwrap();
        write_note(d.path(), "a/b.md", "hello").unwrap();
        assert_eq!(read_note(d.path(), "a/b.md").unwrap().content, "hello");
        assert!(!d.path().join("a/.b.md.mimer-tmp").exists());
    }

    #[test]
    fn rename_refuses_overwrite_and_self_move() {
        let d = tempfile::tempdir().unwrap();
        write_note(d.path(), "a.md", "1").unwrap();
        write_note(d.path(), "b.md", "2").unwrap();
        assert!(matches!(
            rename(d.path(), "a.md", "b.md"),
            Err(AppError::AlreadyExists(_))
        ));
        create_folder(d.path(), "", "dir").unwrap();
        assert!(rename(d.path(), "dir", "dir/inner").is_err());
    }

    #[test]
    fn atomic_write_replaces_content_and_leaves_no_temp_file() {
        let d = tempfile::tempdir().unwrap();
        let file = d.path().join("a.md");
        write_atomic(&file, b"first").unwrap();
        write_atomic(&file, b"second").unwrap();
        assert_eq!(std::fs::read(&file).unwrap(), b"second");
        assert!(!d.path().join(".a.md.mimer-tmp").exists());
    }

    #[test]
    fn rejects_bad_names() {
        assert!(validate_name("..").is_err());
        assert!(validate_name("a/b").is_err());
        assert!(validate_name(".hidden").is_err());
        assert!(validate_name("ok name").is_ok());
    }

    fn message(r: AppResult<impl std::fmt::Debug>) -> String {
        match r {
            Err(AppError::AlreadyExists(m)) => m,
            other => panic!("expected AlreadyExists, got {other:?}"),
        }
    }

    #[test]
    fn names_that_look_the_same_in_the_tree_cannot_be_created() {
        let d = tempfile::tempdir().unwrap();
        create_folder(d.path(), "", "Work").unwrap();
        write_note(d.path(), "Plan.md", "").unwrap();
        // The same name with other upper/lower case, as a folder or as a note.
        assert!(message(create_folder(d.path(), "", "work")).contains("folder called “Work”"));
        assert!(message(create_note(d.path(), "", Some("WORK"))).contains("folder called “Work”"));
        // A note and a folder with the same name show the same in the tree.
        assert!(message(create_folder(d.path(), "", "plan")).contains("note called “Plan”"));
        assert!(message(create_note(d.path(), "", Some("plan.md"))).contains("note called “Plan”"));
        // Other names are fine, and so is the same name in another folder.
        assert!(create_folder(d.path(), "", "Other").is_ok());
        assert!(create_folder(d.path(), "Work", "Plan").is_ok());
    }

    #[test]
    fn the_message_names_the_kind_and_the_folder() {
        let d = tempfile::tempdir().unwrap();
        create_folder(d.path(), "", "Docs").unwrap();
        create_folder(d.path(), "Docs", "Inner").unwrap();
        let m = message(create_folder(d.path(), "Docs", "inner"));
        assert!(m.contains("already exists in “Docs”"), "{m}");
    }

    #[test]
    fn untitled_numbering_skips_a_folder_with_that_name() {
        let d = tempfile::tempdir().unwrap();
        create_folder(d.path(), "", "Untitled").unwrap();
        assert_eq!(create_note(d.path(), "", None).unwrap(), "Untitled 1.md");
    }

    #[test]
    fn moving_or_renaming_onto_a_look_alike_is_refused() {
        let d = tempfile::tempdir().unwrap();
        create_folder(d.path(), "", "Target").unwrap();
        write_note(d.path(), "Target/Notes.md", "1").unwrap();
        write_note(d.path(), "notes.md", "2").unwrap();
        assert!(message(rename(d.path(), "notes.md", "Target/notes.md"))
            .contains("note called “Notes”"));
        create_folder(d.path(), "", "Loose").unwrap();
        create_folder(d.path(), "Target", "loose").unwrap();
        assert!(
            message(rename(d.path(), "Loose", "Target/Loose")).contains("folder called “loose”")
        );
        assert!(d.path().join("notes.md").exists(), "nothing was moved");
    }

    #[test]
    fn a_rename_that_only_changes_the_case_is_allowed() {
        let d = tempfile::tempdir().unwrap();
        write_note(d.path(), "plan.md", "x").unwrap();
        rename(d.path(), "plan.md", "Plan.md").unwrap();
        assert!(d.path().join("Plan.md").exists());
        create_folder(d.path(), "", "docs").unwrap();
        rename(d.path(), "docs", "Docs").unwrap();
        assert!(d.path().join("Docs").is_dir());
    }
}
