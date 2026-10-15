//! Images in a vault: adding them from files on disk, and finding out which notes use which.

use super::{ops, paths, OpenVault};
use crate::error::{AppError, AppResult};
use regex::Regex;
use serde::Serialize;
use std::collections::{BTreeMap, BTreeSet};
use std::sync::LazyLock;
use ts_rs::TS;

/// Picture formats Mimer shows in notes.
pub const IMAGE_EXTS: &[&str] = &["png", "jpg", "jpeg", "gif", "webp", "svg", "bmp", "avif"];

/// Largest image that is added to a vault (bytes).
pub const MAX_IMAGE_BYTES: u64 = 25 * 1024 * 1024;

/// True when the file name has a picture extension.
pub fn is_image(name: &str) -> bool {
    name.rsplit_once('.')
        .is_some_and(|(_, ext)| IMAGE_EXTS.contains(&ext.to_lowercase().as_str()))
}

/// An image in the vault and the notes that show it.
#[derive(Debug, Clone, Serialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct ImageUsage {
    pub path: String,
    /// Size in kilobytes (rounded up).
    pub size_kb: u32,
    /// Notes that show the image, sorted.
    pub used_in: Vec<String>,
}

static MD_IMAGE: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(r#"!\[[^\]]*\]\(\s*<?([^)\s>]+)>?(?:\s+"[^"]*")?\s*\)"#).expect("valid image regex")
});
static WIKI_EMBED: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(r"!\[\[([^\[\]|#]+)(?:#[^\[\]|]*)?(?:\|[^\[\]]*)?\]\]").expect("valid embed regex")
});

/// Copies picture files from disk into the attachments folder (never overwriting; a taken name
/// gets `-1`, `-2` …) and returns each one's link path relative to the note.
/// A file that is not a picture, or is too large, fails the whole call before anything is copied.
pub fn add_images(v: &OpenVault, note_path: &str, sources: &[String]) -> AppResult<Vec<String>> {
    let mut loaded: Vec<(String, Vec<u8>)> = Vec::new();
    for source in sources {
        let path = std::path::Path::new(source);
        let name = path
            .file_name()
            .map(|n| n.to_string_lossy().into_owned())
            .unwrap_or_default();
        if !is_image(&name) {
            return Err(AppError::InvalidPath(format!(
                "{name} is not a picture file"
            )));
        }
        let meta = std::fs::metadata(path)?;
        if !meta.is_file() {
            return Err(AppError::InvalidPath(format!("{name} is not a file")));
        }
        if meta.len() > MAX_IMAGE_BYTES {
            return Err(AppError::InvalidPath(format!(
                "{name} is larger than {} MB",
                MAX_IMAGE_BYTES / 1024 / 1024
            )));
        }
        loaded.push((name, std::fs::read(path)?));
    }
    loaded
        .iter()
        .map(|(name, bytes)| ops::save_attachment(v, note_path, name, bytes))
        .collect()
}

/// Which notes show which images. Looks at `![alt](path)` and `![[name]]` in every note.
pub fn usage(v: &OpenVault) -> AppResult<Vec<ImageUsage>> {
    v.refresh_files();
    let files = v.file_list();
    let resolver = v.resolver();
    let mut used: BTreeMap<String, BTreeSet<String>> = BTreeMap::new();
    for note in files.iter().filter(|f| super::tree::is_markdown(f)) {
        let Ok(abs) = paths::resolve(&v.root, note, None) else {
            continue;
        };
        let Ok(text) = std::fs::read_to_string(abs) else {
            continue;
        };
        let mut targets: Vec<String> = Vec::new();
        for c in MD_IMAGE.captures_iter(&text) {
            if let Some(vault_path) = c
                .get(1)
                .and_then(|m| paths::resolve_relative(note, m.as_str()))
            {
                targets.push(vault_path);
            }
        }
        for c in WIKI_EMBED.captures_iter(&text) {
            if let Some(vault_path) = c.get(1).and_then(|m| resolver.resolve(m.as_str())) {
                targets.push(vault_path);
            }
        }
        for t in targets {
            used.entry(t.to_lowercase())
                .or_default()
                .insert(note.clone());
        }
    }
    let mut out: Vec<ImageUsage> = files
        .iter()
        .filter(|f| is_image(f))
        .map(|path| {
            let size = paths::resolve(&v.root, path, None)
                .ok()
                .and_then(|a| std::fs::metadata(a).ok())
                .map_or(0, |m| m.len());
            ImageUsage {
                path: path.clone(),
                size_kb: u32::try_from(size.div_ceil(1024)).unwrap_or(u32::MAX),
                used_in: used
                    .get(&path.to_lowercase())
                    .map(|s| s.iter().cloned().collect())
                    .unwrap_or_default(),
            }
        })
        .collect();
    out.sort_by_key(|i| i.path.to_lowercase());
    Ok(out)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::vault::open_for_test;

    fn write(root: &std::path::Path, rel: &str, content: &[u8]) {
        let p = root.join(rel);
        std::fs::create_dir_all(p.parent().unwrap()).unwrap();
        std::fs::write(p, content).unwrap();
    }

    #[test]
    fn recognises_picture_names() {
        assert!(is_image("a.PNG"));
        assert!(is_image("photo.final.jpeg"));
        assert!(!is_image("notes.md"));
        assert!(!is_image("png"));
    }

    #[test]
    fn pictures_are_copied_into_the_attachments_folder_with_links_relative_to_the_note() {
        let dir = tempfile::tempdir().unwrap();
        let v = open_for_test(dir.path());
        write(dir.path(), "Work/Plan.md", b"# Plan");
        let outside = tempfile::tempdir().unwrap();
        write(outside.path(), "shot one.png", b"png");
        write(outside.path(), "b.jpg", b"jpg");
        let sources = vec![
            outside
                .path()
                .join("shot one.png")
                .to_string_lossy()
                .into_owned(),
            outside.path().join("b.jpg").to_string_lossy().into_owned(),
        ];
        let links = add_images(&v, "Work/Plan.md", &sources).unwrap();
        assert_eq!(
            links,
            vec!["../attachments/shot%20one.png", "../attachments/b.jpg"]
        );
        assert!(dir.path().join("attachments/shot one.png").is_file());
        // The same file again gets a number and nothing is overwritten.
        let again = add_images(&v, "Work/Plan.md", &sources[..1]).unwrap();
        assert_eq!(again, vec!["../attachments/shot%20one-1.png"]);
        assert!(
            outside.path().join("shot one.png").is_file(),
            "the original is untouched"
        );
    }

    #[test]
    fn one_bad_file_stops_everything_before_anything_is_copied() {
        let dir = tempfile::tempdir().unwrap();
        let v = open_for_test(dir.path());
        write(dir.path(), "a.md", b"x");
        let outside = tempfile::tempdir().unwrap();
        write(outside.path(), "ok.png", b"png");
        write(outside.path(), "script.exe", b"bad");
        let sources = vec![
            outside.path().join("ok.png").to_string_lossy().into_owned(),
            outside
                .path()
                .join("script.exe")
                .to_string_lossy()
                .into_owned(),
        ];
        let err = add_images(&v, "a.md", &sources).unwrap_err();
        assert!(err.to_string().contains("script.exe"));
        assert!(!dir.path().join("attachments").exists());
        assert!(add_images(&v, "a.md", &["/nope/missing.png".into()]).is_err());
    }

    #[test]
    fn a_picture_that_is_too_large_is_refused() {
        let dir = tempfile::tempdir().unwrap();
        let v = open_for_test(dir.path());
        write(dir.path(), "a.md", b"x");
        let outside = tempfile::tempdir().unwrap();
        let big = std::fs::File::create(outside.path().join("big.png")).unwrap();
        big.set_len(MAX_IMAGE_BYTES + 1).unwrap();
        let err = add_images(
            &v,
            "a.md",
            &[outside
                .path()
                .join("big.png")
                .to_string_lossy()
                .into_owned()],
        )
        .unwrap_err();
        assert!(err.to_string().contains("25 MB"));
    }

    #[test]
    fn usage_lists_every_image_with_the_notes_that_show_it() {
        let dir = tempfile::tempdir().unwrap();
        write(dir.path(), "attachments/a.png", &[0; 2048]);
        write(dir.path(), "attachments/b.png", b"b");
        write(dir.path(), "attachments/unused.png", b"u");
        write(
            dir.path(),
            "Work/Plan.md",
            b"![](../attachments/a.png)\n\n![alt|300](../attachments/a.png)",
        );
        write(
            dir.path(),
            "Home.md",
            b"![[b.png]] and ![x](attachments/a.png \"title\")",
        );
        write(
            dir.path(),
            "Notes/Remote.md",
            b"![web](https://example.com/c.png) [link](../attachments/unused.png)",
        );
        let v = open_for_test(dir.path());
        let usage = usage(&v).unwrap();
        let by = |p: &str| usage.iter().find(|u| u.path == p).unwrap();
        assert_eq!(
            by("attachments/a.png").used_in,
            vec!["Home.md", "Work/Plan.md"]
        );
        assert_eq!(by("attachments/a.png").size_kb, 2);
        assert_eq!(by("attachments/b.png").used_in, vec!["Home.md"]);
        assert!(
            by("attachments/unused.png").used_in.is_empty(),
            "a plain link is not showing the image, and web images are not vault files"
        );
        assert_eq!(usage.len(), 3);
    }

    #[test]
    fn usage_understands_encoded_names_and_wiki_embeds_with_sizes() {
        let dir = tempfile::tempdir().unwrap();
        write(dir.path(), "attachments/my shot.png", b"x");
        write(dir.path(), "attachments/wide.png", b"x");
        write(
            dir.path(),
            "A.md",
            b"![](attachments/my%20shot.png)\n![[wide.png|400]]",
        );
        let v = open_for_test(dir.path());
        let usage = usage(&v).unwrap();
        assert!(usage.iter().all(|u| u.used_in == vec!["A.md"]), "{usage:?}");
    }
}
