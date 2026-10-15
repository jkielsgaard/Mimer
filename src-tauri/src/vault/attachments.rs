//! Saving pasted and dropped files into the attachments folder.

use super::paths::resolve;
use crate::error::{AppError, AppResult};
use std::path::Path;

/// Strips path separators and control characters from a file name.
pub fn sanitize_file_name(name: &str) -> String {
    let base = name.rsplit(['/', '\\']).next().unwrap_or(name);
    let cleaned: String = base
        .chars()
        .filter(|c| !c.is_control() && !matches!(c, ':' | '*' | '?' | '"' | '<' | '>' | '|'))
        .collect();
    let cleaned = cleaned.trim().trim_start_matches('.').to_string();
    if cleaned.is_empty() {
        "attachment".to_string()
    } else {
        cleaned
    }
}

/// Picks a name that does not exist yet by appending `-1`, `-2`, …
pub fn dedupe_name(dir: &Path, name: &str) -> String {
    if !dir.join(name).exists() {
        return name.to_string();
    }
    let (stem, ext) = match name.rsplit_once('.') {
        Some((s, e)) if !s.is_empty() => (s.to_string(), format!(".{e}")),
        _ => (name.to_string(), String::new()),
    };
    let mut i = 1;
    loop {
        let candidate = format!("{stem}-{i}{ext}");
        if !dir.join(&candidate).exists() {
            return candidate;
        }
        i += 1;
    }
}

/// Builds the link path from the note's folder to the attachment, with spaces as `%20`.
pub fn relative_link(note_path: &str, attachment_path: &str) -> String {
    let note_dir: Vec<&str> = note_path.split('/').collect();
    let depth = note_dir.len().saturating_sub(1);
    let mut out = "../".repeat(depth);
    out.push_str(attachment_path);
    out.replace(' ', "%20")
}

/// Stores bytes in the attachments folder and returns the link path relative to the note.
pub fn save_attachment(
    root: &Path,
    attachments_folder: &str,
    note_path: &str,
    file_name: &str,
    bytes: &[u8],
) -> AppResult<String> {
    resolve(root, note_path, None)?;
    let folder = attachments_folder.trim_matches('/');
    if folder.is_empty() {
        return Err(AppError::InvalidPath(
            "Attachments folder is not configured".into(),
        ));
    }
    let dir = resolve(root, folder, None)?;
    std::fs::create_dir_all(&dir)?;
    let name = dedupe_name(&dir, &sanitize_file_name(file_name));
    let rel = format!("{folder}/{name}");
    let abs = resolve(root, &rel, None)?;
    std::fs::write(abs, bytes)?;
    Ok(relative_link(note_path, &rel))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn saves_and_dedupes() {
        let d = tempfile::tempdir().unwrap();
        let a = save_attachment(d.path(), "attachments", "Work/n.md", "my pic.png", b"1").unwrap();
        assert_eq!(a, "../attachments/my%20pic.png");
        let b = save_attachment(d.path(), "attachments", "n.md", "my pic.png", b"2").unwrap();
        assert_eq!(b, "attachments/my%20pic-1.png");
        let c = save_attachment(d.path(), "attachments", "n.md", "my pic.png", b"3").unwrap();
        assert_eq!(c, "attachments/my%20pic-2.png");
    }

    #[test]
    fn sanitizes_names() {
        assert_eq!(sanitize_file_name("../../etc/passwd"), "passwd");
        assert_eq!(sanitize_file_name("a:b*c.png"), "abc.png");
        assert_eq!(sanitize_file_name("..."), "attachment");
    }
}
