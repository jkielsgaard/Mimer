//! Path validation. Every file operation in the backend goes through [`resolve`].

use crate::error::{AppError, AppResult};
use std::path::{Component, Path, PathBuf};

/// Splits and validates a vault-relative path. Returns its segments.
fn segments(relative: &str, allow_empty: bool) -> AppResult<Vec<&str>> {
    if relative.is_empty() {
        return if allow_empty {
            Ok(Vec::new())
        } else {
            Err(AppError::InvalidPath("Path is empty".into()))
        };
    }
    if relative.contains('\\') || relative.contains('\0') {
        return Err(AppError::InvalidPath(format!(
            "Invalid characters in path: {relative}"
        )));
    }
    if relative.starts_with('/') || Path::new(relative).is_absolute() {
        return Err(AppError::InvalidPath(format!(
            "Absolute paths are not allowed: {relative}"
        )));
    }
    let bytes = relative.as_bytes();
    if bytes.len() >= 2 && bytes[0].is_ascii_alphabetic() && bytes[1] == b':' {
        return Err(AppError::InvalidPath(format!(
            "Absolute paths are not allowed: {relative}"
        )));
    }
    let mut out = Vec::new();
    for seg in relative.split('/') {
        match seg {
            "" | "." => {}
            ".." => {
                return Err(AppError::InvalidPath(format!(
                    "'..' is not allowed in paths: {relative}"
                )))
            }
            s => out.push(s),
        }
    }
    if out.is_empty() && !allow_empty {
        return Err(AppError::InvalidPath("Path is empty".into()));
    }
    Ok(out)
}

fn resolve_inner(
    root: &Path,
    relative: &str,
    scope: Option<&str>,
    internal: bool,
    allow_empty: bool,
) -> AppResult<PathBuf> {
    let parts = segments(relative, allow_empty)?;
    if parts.iter().any(|s| s.eq_ignore_ascii_case(".git")) {
        return Err(AppError::InvalidPath(
            "Access to .git is not allowed".into(),
        ));
    }
    if !internal
        && parts
            .first()
            .is_some_and(|s| s.eq_ignore_ascii_case(".vault"))
    {
        return Err(AppError::InvalidPath(
            "Access to .vault is not allowed".into(),
        ));
    }
    let root_canon = std::fs::canonicalize(root)?;
    let mut candidate = root_canon.clone();
    for p in &parts {
        candidate.push(p);
    }

    // Canonicalize the deepest existing ancestor, then re-append the missing tail.
    let mut existing = candidate.clone();
    let mut tail: Vec<std::ffi::OsString> = Vec::new();
    while std::fs::symlink_metadata(&existing).is_err() {
        match existing.file_name() {
            Some(name) => tail.push(name.to_os_string()),
            None => return Err(AppError::InvalidPath(relative.to_string())),
        }
        existing.pop();
    }
    let mut resolved = std::fs::canonicalize(&existing)
        .map_err(|_| AppError::OutsideScope(format!("Path cannot be resolved: {relative}")))?;
    for name in tail.iter().rev() {
        resolved.push(name);
    }

    if !resolved.starts_with(&root_canon) {
        return Err(AppError::OutsideScope(format!(
            "Path is outside the vault: {relative}"
        )));
    }
    if let Some(scope) = scope {
        let scope_parts = segments(scope, true)?;
        let mut scope_path = root_canon.clone();
        for p in scope_parts {
            scope_path.push(p);
        }
        if !resolved.starts_with(&scope_path) {
            return Err(AppError::OutsideScope(format!(
                "Path is outside the allowed folder ({scope}): {relative}"
            )));
        }
    }
    Ok(resolved)
}

/// Validates a vault-relative path and returns the absolute path.
///
/// Rejects absolute paths, empty paths, `..`, backslashes, `.git` and `.vault`,
/// symlink escapes and (when `scope` is given) anything outside the scope folder.
pub fn resolve(root: &Path, relative: &str, scope: Option<&str>) -> AppResult<PathBuf> {
    resolve_inner(root, relative, scope, false, false)
}

/// Like [`resolve`] but an empty path means the scope folder (or the vault root).
pub fn resolve_dir(root: &Path, relative: &str, scope: Option<&str>) -> AppResult<PathBuf> {
    if relative.is_empty() {
        return resolve_inner(root, scope.unwrap_or(""), None, false, true);
    }
    resolve_inner(root, relative, scope, false, true)
}

/// For trusted internal callers only: also allows `.vault/`.
pub fn resolve_internal(root: &Path, relative: &str) -> AppResult<PathBuf> {
    resolve_inner(root, relative, None, true, false)
}

/// Converts an absolute path inside the vault to a vault-relative, forward-slash path.
pub fn to_relative(root: &Path, abs: &Path) -> Option<String> {
    let rel: PathBuf = match abs.strip_prefix(root) {
        Ok(r) => r.to_path_buf(),
        Err(_) => {
            let canon = std::fs::canonicalize(root).ok()?;
            abs.strip_prefix(&canon).ok()?.to_path_buf()
        }
    };
    let parts: Vec<String> = rel
        .components()
        .filter_map(|c| match c {
            Component::Normal(s) => Some(s.to_string_lossy().into_owned()),
            _ => None,
        })
        .collect();
    Some(parts.join("/"))
}

/// Resolves a link relative to a note (`../attachments/a%20b.png`) to a vault-relative path.
/// Returns `None` for URLs, `#anchors`, and paths that escape the vault.
pub fn resolve_relative(note_path: &str, href: &str) -> Option<String> {
    let href = href.trim();
    if href.starts_with('#') || href.starts_with("//") || has_scheme(href) {
        return None;
    }
    let decoded = percent_decode(href.split(['#', '?']).next().unwrap_or(""));
    let mut parts: Vec<String> = if decoded.starts_with('/') {
        Vec::new()
    } else {
        note_path
            .rsplit_once('/')
            .map(|(dir, _)| dir.split('/').map(str::to_string).collect())
            .unwrap_or_default()
    };
    for seg in decoded.split('/') {
        match seg {
            "" | "." => {}
            ".." => {
                parts.pop()?;
            }
            s => parts.push(s.to_string()),
        }
    }
    if parts.is_empty() {
        None
    } else {
        Some(parts.join("/"))
    }
}

fn has_scheme(href: &str) -> bool {
    match href.find(':') {
        Some(i) if i > 0 => {
            let scheme = &href[..i];
            scheme
                .chars()
                .next()
                .is_some_and(|c| c.is_ascii_alphabetic())
                && scheme
                    .chars()
                    .all(|c| c.is_ascii_alphanumeric() || matches!(c, '+' | '-' | '.'))
        }
        _ => false,
    }
}

/// Decodes `%XX` escapes. Invalid escapes are kept as typed.
pub fn percent_decode(s: &str) -> String {
    let bytes = s.as_bytes();
    let mut out: Vec<u8> = Vec::with_capacity(bytes.len());
    let mut i = 0;
    while i < bytes.len() {
        if bytes[i] == b'%' && i + 2 < bytes.len() {
            let hex = std::str::from_utf8(&bytes[i + 1..i + 3]).ok();
            if let Some(v) = hex.and_then(|h| u8::from_str_radix(h, 16).ok()) {
                out.push(v);
                i += 3;
                continue;
            }
        }
        out.push(bytes[i]);
        i += 1;
    }
    String::from_utf8_lossy(&out).into_owned()
}

/// True when any path segment starts with `.` or is `node_modules`.
pub fn is_hidden(relative: &str) -> bool {
    relative
        .split('/')
        .any(|s| s.starts_with('.') || s == "node_modules")
}

/// True when `path` is `folder` or lies inside it.
pub fn is_inside(path: &str, folder: &str) -> bool {
    folder.is_empty() || path == folder || path.starts_with(&format!("{folder}/"))
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::tempdir;

    #[test]
    fn relative_links_resolve_from_the_note_folder() {
        assert_eq!(
            resolve_relative("Work/n.md", "../attachments/my%20pic.png").as_deref(),
            Some("attachments/my pic.png")
        );
        assert_eq!(
            resolve_relative("n.md", "attachments/a.png").as_deref(),
            Some("attachments/a.png")
        );
        assert_eq!(resolve_relative("n.md", "https://x.test/a.png"), None);
        assert_eq!(resolve_relative("n.md", "mailto:a@b.c"), None);
        assert_eq!(resolve_relative("n.md", "#heading"), None);
        assert_eq!(resolve_relative("n.md", "../../etc/passwd"), None);
        assert_eq!(resolve_relative("n.md", ""), None);
    }

    #[test]
    fn percent_decoding_keeps_bad_escapes() {
        assert_eq!(percent_decode("a%20b"), "a b");
        assert_eq!(percent_decode("100%"), "100%");
        assert_eq!(percent_decode("%zz"), "%zz");
    }

    fn vault() -> tempfile::TempDir {
        let d = tempdir().unwrap();
        std::fs::create_dir_all(d.path().join("a/b")).unwrap();
        std::fs::create_dir_all(d.path().join("other")).unwrap();
        std::fs::write(d.path().join("a/note.md"), "x").unwrap();
        d
    }

    #[test]
    fn resolves_existing_and_new_paths() {
        let d = vault();
        assert!(resolve(d.path(), "a/note.md", None)
            .unwrap()
            .ends_with("a/note.md"));
        assert!(resolve(d.path(), "a/new/deeper/file.md", None).is_ok());
    }

    #[test]
    fn rejects_traversal() {
        let d = vault();
        for p in ["../x", "a/../../x", "a/..", ".."] {
            assert!(
                matches!(resolve(d.path(), p, None), Err(AppError::InvalidPath(_))),
                "{p}"
            );
        }
    }

    #[test]
    fn rejects_absolute_empty_and_backslash() {
        let d = vault();
        for p in ["/etc/passwd", "", "a\\b", "C:/x", "c:x"] {
            assert!(resolve(d.path(), p, None).is_err(), "{p}");
        }
    }

    #[test]
    fn rejects_git_and_vault_dirs() {
        let d = vault();
        assert!(resolve(d.path(), ".git/config", None).is_err());
        assert!(resolve(d.path(), "a/.git/config", None).is_err());
        assert!(resolve(d.path(), ".vault/config.json", None).is_err());
        assert!(resolve_internal(d.path(), ".vault/config.json").is_ok());
        assert!(resolve_internal(d.path(), ".git/config").is_err());
    }

    #[cfg(unix)]
    #[test]
    fn rejects_symlink_escape() {
        let d = vault();
        let outside = tempdir().unwrap();
        std::fs::write(outside.path().join("secret.md"), "s").unwrap();
        std::os::unix::fs::symlink(outside.path(), d.path().join("link")).unwrap();
        assert!(matches!(
            resolve(d.path(), "link/secret.md", None),
            Err(AppError::OutsideScope(_))
        ));
        assert!(matches!(
            resolve(d.path(), "link/new.md", None),
            Err(AppError::OutsideScope(_))
        ));
    }

    #[test]
    fn enforces_scope() {
        let d = vault();
        assert!(resolve(d.path(), "a/note.md", Some("a")).is_ok());
        assert!(resolve(d.path(), "a/b/x.md", Some("a")).is_ok());
        assert!(matches!(
            resolve(d.path(), "other/x.md", Some("a")),
            Err(AppError::OutsideScope(_))
        ));
        // A sibling whose name merely starts with the scope name is outside.
        std::fs::create_dir_all(d.path().join("ab")).unwrap();
        assert!(resolve(d.path(), "ab/x.md", Some("a")).is_err());
    }

    #[test]
    fn resolve_dir_empty_is_scope_root() {
        let d = vault();
        let root = std::fs::canonicalize(d.path()).unwrap();
        assert_eq!(resolve_dir(d.path(), "", None).unwrap(), root);
        assert_eq!(
            resolve_dir(d.path(), "", Some("a")).unwrap(),
            root.join("a")
        );
    }

    #[test]
    fn relative_roundtrip() {
        let d = vault();
        let abs = resolve(d.path(), "a/note.md", None).unwrap();
        assert_eq!(to_relative(d.path(), &abs).as_deref(), Some("a/note.md"));
    }
}
