//! Plain file-system operations. All paths are vault-relative and validated.

use super::paths::{resolve, resolve_dir};
use crate::error::{AppError, AppResult};
use serde::Serialize;
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
            if dir.join(&n).exists() {
                return Err(AppError::AlreadyExists(format!(
                    "{prefix}{n} already exists"
                )));
            }
            n
        }
        None => {
            let mut candidate = "Untitled.md".to_string();
            let mut i = 1;
            while dir.join(&candidate).exists() {
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

/// Creates a folder (and returns its vault-relative path).
pub fn create_folder(root: &Path, parent: &str, name: &str) -> AppResult<String> {
    let name = validate_name(name)?;
    let dir = resolve_dir(root, parent, None)?;
    let target = dir.join(&name);
    if target.exists() {
        return Err(AppError::AlreadyExists(format!("{name} already exists")));
    }
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
    if b.exists() {
        return Err(AppError::AlreadyExists(format!("{to} already exists")));
    }
    if b.starts_with(&a) {
        return Err(AppError::InvalidPath(
            "Cannot move a folder into itself".into(),
        ));
    }
    if let Some(dir) = b.parent() {
        std::fs::create_dir_all(dir)?;
    }
    std::fs::rename(&a, &b)?;
    Ok(())
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
}
