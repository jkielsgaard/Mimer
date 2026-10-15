//! Export notes to HTML, Word (.docx) and print-ready HTML (PDF is produced by the system print
//! dialog from the HTML preview). Export is read-only: it never changes the vault or Git.

pub mod docx;
pub mod html;

use crate::error::{AppError, AppResult};
use crate::links::resolve::{note_stem, LinkResolver};
use crate::markdown::frontmatter;
use crate::markdown::links::parse_wikilinks;
use crate::vault::attachments::relative_link;
use crate::vault::paths::{is_inside, resolve, resolve_dir, resolve_relative};
use crate::vault::{fs_ops, tree, OpenVault};
use base64::Engine;
use serde::{Deserialize, Serialize};
use std::collections::HashSet;
use std::path::{Component, Path};
use ts_rs::TS;

/// Largest image that is embedded in an export.
pub const MAX_IMAGE_BYTES: u64 = 10 * 1024 * 1024;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "lowercase")]
#[ts(export)]
pub enum ExportFormat {
    Html,
    Pdf,
    Docx,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "lowercase")]
#[ts(export)]
pub enum ExportScope {
    Note,
    Folder,
}

/// What to export and how.
#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct ExportRequest {
    pub scope: ExportScope,
    pub path: String,
    pub format: ExportFormat,
    pub include_toc: bool,
    pub include_properties: bool,
}

/// Result of a written export.
#[derive(Debug, Clone, Serialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct ExportResult {
    pub notes_included: u32,
    #[ts(type = "number")]
    pub bytes_written: u64,
}

/// One note to export.
#[derive(Debug, Clone)]
pub struct Doc {
    pub path: String,
    pub title: String,
    pub markdown: String,
}

/// Options shared by the renderers.
#[derive(Debug, Clone, Copy)]
pub struct RenderOptions {
    pub include_toc: bool,
    pub include_properties: bool,
    /// True for a folder export: links between exported notes become in-document links.
    pub folder: bool,
}

/// Notes for a request: one note, or every Markdown note in a folder, sorted by path.
pub fn collect(v: &OpenVault, req: &ExportRequest) -> AppResult<Vec<Doc>> {
    let files = v.file_list();
    let picked: Vec<String> = match req.scope {
        ExportScope::Note => {
            let abs = resolve(&v.root, &req.path, None)?;
            if !abs.is_file() || !tree::is_markdown(&req.path) {
                return Err(AppError::InvalidPath(
                    "Only Markdown notes can be exported".into(),
                ));
            }
            vec![req.path.clone()]
        }
        ExportScope::Folder => {
            resolve_dir(&v.root, &req.path, None)?;
            let folder = req.path.trim_matches('/');
            let mut found: Vec<String> = files
                .into_iter()
                .filter(|f| tree::is_markdown(f) && is_inside(f, folder))
                .collect();
            found.sort_by_key(|p| p.to_lowercase());
            if found.is_empty() {
                return Err(AppError::NotFound("No notes in this folder".into()));
            }
            found
        }
    };
    picked
        .into_iter()
        .map(|path| {
            let note = fs_ops::read_note(&v.root, &path)?;
            let title = crate::markdown::first_heading(&note.content)
                .unwrap_or_else(|| note_stem(&path).to_string());
            Ok(Doc {
                path,
                title,
                markdown: note.content,
            })
        })
        .collect()
}

/// Markdown ready for rendering: frontmatter removed (or shown as a table) and wiki-links rewritten.
pub fn prepare_markdown(
    doc: &Doc,
    resolver: &LinkResolver,
    exported: &HashSet<String>,
    opts: RenderOptions,
) -> String {
    let (properties, body) = match frontmatter::split(&doc.markdown) {
        Some(fm) => (
            frontmatter_table(fm.yaml),
            doc.markdown[fm.end..].to_string(),
        ),
        None => (String::new(), doc.markdown.clone()),
    };
    let body = rewrite_wikilinks(&body, &doc.path, resolver, exported, opts.folder);
    if opts.include_properties && !properties.is_empty() {
        format!("{properties}\n{body}")
    } else {
        body
    }
}

/// Renders top-level `key: value` lines as a Markdown table (the table is escaped by the renderer).
fn frontmatter_table(yaml: &str) -> String {
    let rows: Vec<String> = yaml
        .lines()
        .filter_map(|l| {
            let (k, v) = l.split_once(':')?;
            let k = k.trim();
            if k.is_empty() || k.starts_with('-') || k.starts_with('#') {
                return None;
            }
            Some(format!(
                "| {} | {} |",
                k.replace('|', "\\|"),
                v.trim().replace('|', "\\|")
            ))
        })
        .collect();
    if rows.is_empty() {
        String::new()
    } else {
        format!("| Property | Value |\n| --- | --- |\n{}\n", rows.join("\n"))
    }
}

/// Rewrites wiki-links: embeds of images become images, other links become their text
/// (or an in-document link inside a folder export). Works from the end so offsets stay valid.
pub fn rewrite_wikilinks(
    body: &str,
    note_path: &str,
    resolver: &LinkResolver,
    exported: &HashSet<String>,
    folder: bool,
) -> String {
    let mut out = body.to_string();
    let links = parse_wikilinks(body);
    for link in links.iter().rev() {
        let resolved = resolver.resolve(&link.target);
        let replacement = match &resolved {
            Some(target) if link.embed && is_image_path(target) => {
                let alt = link.target.clone();
                format!("![{alt}]({})", relative_link(note_path, target))
            }
            Some(target) => {
                let text = link
                    .alias
                    .as_deref()
                    .map(|a| a[1..].to_string())
                    .unwrap_or_else(|| link.target.clone());
                if folder && exported.contains(target) {
                    format!("[{text}](#{})", slug(target))
                } else {
                    text
                }
            }
            None => link
                .alias
                .as_deref()
                .map(|a| a[1..].to_string())
                .unwrap_or_else(|| link.target.clone()),
        };
        out.replace_range(link.start..link.end, &replacement);
    }
    out
}

/// True for image file names.
pub fn is_image_path(path: &str) -> bool {
    let lower = path.to_lowercase();
    [
        ".png", ".jpg", ".jpeg", ".gif", ".webp", ".svg", ".bmp", ".avif",
    ]
    .iter()
    .any(|e| lower.ends_with(e))
}

/// Anchor-safe id for a note path.
pub fn slug(path: &str) -> String {
    let mut out = String::new();
    for ch in path.to_lowercase().chars() {
        if ch.is_ascii_alphanumeric() {
            out.push(ch);
        } else if !out.ends_with('-') {
            out.push('-');
        }
    }
    format!("note-{}", out.trim_matches('-'))
}

/// MIME type for an image file, or `None` when it is not a known image.
pub fn image_mime(path: &str) -> Option<&'static str> {
    let lower = path.to_lowercase();
    Some(if lower.ends_with(".png") {
        "image/png"
    } else if lower.ends_with(".jpg") || lower.ends_with(".jpeg") {
        "image/jpeg"
    } else if lower.ends_with(".gif") {
        "image/gif"
    } else if lower.ends_with(".webp") {
        "image/webp"
    } else if lower.ends_with(".svg") {
        "image/svg+xml"
    } else if lower.ends_with(".bmp") {
        "image/bmp"
    } else if lower.ends_with(".avif") {
        "image/avif"
    } else {
        return None;
    })
}

/// Bytes and MIME type of a vault image linked from a note. `None` for remote images, files
/// outside the vault, unknown types and files over `MAX_IMAGE_BYTES`.
pub fn image_bytes(v: &OpenVault, note_path: &str, href: &str) -> Option<(&'static str, Vec<u8>)> {
    let rel = resolve_relative(note_path, href)?;
    let mime = image_mime(&rel)?;
    let abs = resolve(&v.root, &rel, None).ok()?;
    let meta = std::fs::metadata(&abs).ok()?;
    if !meta.is_file() || meta.len() > MAX_IMAGE_BYTES {
        return None;
    }
    Some((mime, std::fs::read(abs).ok()?))
}

/// `data:` URI for an image, used by the HTML export.
pub fn image_data_uri(v: &OpenVault, note_path: &str, href: &str) -> Option<String> {
    let (mime, bytes) = image_bytes(v, note_path, href)?;
    Some(format!(
        "data:{mime};base64,{}",
        base64::engine::general_purpose::STANDARD.encode(bytes)
    ))
}

/// Set of exported note paths (for in-document links in folder exports).
pub fn exported_set(docs: &[Doc]) -> HashSet<String> {
    docs.iter().map(|d| d.path.clone()).collect()
}

/// Validates the target file chosen by the user.
pub fn check_target(target: &Path, format: ExportFormat) -> AppResult<std::path::PathBuf> {
    if !target.is_absolute() {
        return Err(AppError::InvalidPath(
            "The export path must be absolute".into(),
        ));
    }
    if target
        .components()
        .any(|c| matches!(c, Component::Normal(n) if n == ".git" || n == ".vault"))
    {
        return Err(AppError::InvalidPath(
            "Exports cannot be written into .git or .vault".into(),
        ));
    }
    let parent = target
        .parent()
        .ok_or_else(|| AppError::InvalidPath("Invalid export path".into()))?;
    if !parent.is_dir() {
        return Err(AppError::NotFound(
            "The folder for the export does not exist".into(),
        ));
    }
    let ext = match format {
        ExportFormat::Html => "html",
        ExportFormat::Docx => "docx",
        ExportFormat::Pdf => {
            return Err(AppError::InvalidPath(
                "PDF is exported through the print view".into(),
            ))
        }
    };
    let mut out = target.to_path_buf();
    let has_ext = out.extension().is_some_and(|e| e.eq_ignore_ascii_case(ext));
    if !has_ext {
        out.set_extension(ext);
    }
    Ok(out)
}

/// Renders the request and writes the file (atomically: temp file, then rename).
pub fn run(v: &OpenVault, req: &ExportRequest, target: &Path) -> AppResult<ExportResult> {
    let target = check_target(target, req.format)?;
    let docs = collect(v, req)?;
    let opts = RenderOptions {
        include_toc: req.include_toc && req.scope == ExportScope::Folder,
        include_properties: req.include_properties,
        folder: req.scope == ExportScope::Folder,
    };
    let bytes = match req.format {
        ExportFormat::Html => html::render_html(v, &docs, opts).into_bytes(),
        ExportFormat::Docx => docx::render_docx(v, &docs, opts)?,
        ExportFormat::Pdf => {
            return Err(AppError::InvalidPath(
                "PDF is exported through the print view".into(),
            ))
        }
    };
    let tmp = target.with_extension("mimer-export.tmp");
    std::fs::write(&tmp, &bytes)?;
    std::fs::rename(&tmp, &target)?;
    Ok(ExportResult {
        notes_included: u32::try_from(docs.len()).unwrap_or(u32::MAX),
        bytes_written: bytes.len() as u64,
    })
}

/// Renders the request as HTML in memory (print preview).
pub fn preview_html(v: &OpenVault, req: &ExportRequest) -> AppResult<String> {
    let docs = collect(v, req)?;
    let opts = RenderOptions {
        include_toc: req.include_toc && req.scope == ExportScope::Folder,
        include_properties: req.include_properties,
        folder: req.scope == ExportScope::Folder,
    };
    Ok(html::render_html(v, &docs, opts))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::vault::{open_for_test, ops};

    #[test]
    fn slugs_are_anchor_safe() {
        assert_eq!(slug("Work/My Plan (v2).md"), "note-work-my-plan-v2-md");
    }

    #[test]
    fn wikilinks_become_text_or_anchors() {
        let files: Vec<String> = ["Plan.md", "Other.md"]
            .iter()
            .map(|s| s.to_string())
            .collect();
        let r = LinkResolver::new(&files);
        let exported: HashSet<String> = files.iter().cloned().collect();
        let out = rewrite_wikilinks(
            "See [[Plan]], [[Other|the other]] and [[Missing]].",
            "x.md",
            &r,
            &exported,
            false,
        );
        assert_eq!(out, "See Plan, the other and Missing.");
        let folder = rewrite_wikilinks("See [[Plan]].", "x.md", &r, &exported, true);
        assert_eq!(folder, "See [Plan](#note-plan-md).");
    }

    #[test]
    fn images_are_embedded_by_relative_path() {
        let files: Vec<String> = ["attachments/pic.png"]
            .iter()
            .map(|s| s.to_string())
            .collect();
        let r = LinkResolver::new(&files);
        let out = rewrite_wikilinks("![[pic.png]]", "Work/n.md", &r, &HashSet::new(), false);
        assert_eq!(out, "![pic.png](../attachments/pic.png)");
    }

    #[test]
    fn target_paths_are_checked() {
        assert!(check_target(Path::new("relative.html"), ExportFormat::Html).is_err());
        assert!(check_target(Path::new("/tmp/x/.git/out.html"), ExportFormat::Html).is_err());
        assert!(check_target(
            Path::new("/definitely/not/here/out.html"),
            ExportFormat::Html
        )
        .is_err());
        assert!(check_target(Path::new("/tmp/out.pdf"), ExportFormat::Pdf).is_err());
    }

    #[test]
    fn folder_export_collects_sorted_notes_and_rejects_empty_folders() {
        let d = tempfile::tempdir().unwrap();
        let v = open_for_test(d.path());
        ops::write_note(&v, "Work/b.md", "# B").unwrap();
        ops::write_note(&v, "Work/A.md", "# A").unwrap();
        ops::write_note(&v, "Home.md", "# Home").unwrap();
        v.refresh_files();
        let req = ExportRequest {
            scope: ExportScope::Folder,
            path: "Work".into(),
            format: ExportFormat::Html,
            include_toc: true,
            include_properties: false,
        };
        let docs = collect(&v, &req).unwrap();
        assert_eq!(
            docs.iter().map(|d| d.path.as_str()).collect::<Vec<_>>(),
            vec!["Work/A.md", "Work/b.md"]
        );
        let empty = ExportRequest {
            path: "Empty".into(),
            ..req
        };
        std::fs::create_dir_all(v.root.join("Empty")).unwrap();
        assert!(collect(&v, &empty).is_err());
    }

    #[test]
    fn non_markdown_notes_are_refused() {
        let d = tempfile::tempdir().unwrap();
        let v = open_for_test(d.path());
        std::fs::write(v.root.join("data.csv"), "a,b").unwrap();
        let req = ExportRequest {
            scope: ExportScope::Note,
            path: "data.csv".into(),
            format: ExportFormat::Html,
            include_toc: false,
            include_properties: false,
        };
        assert!(collect(&v, &req).is_err());
    }

    #[test]
    fn run_writes_a_file_and_never_commits() {
        let d = tempfile::tempdir().unwrap();
        let v = open_for_test(d.path());
        ops::write_note(&v, "Note.md", "# Hello\n\nworld").unwrap();
        v.refresh_files();
        let out_dir = tempfile::tempdir().unwrap();
        let target = out_dir.path().join("note");
        let req = ExportRequest {
            scope: ExportScope::Note,
            path: "Note.md".into(),
            format: ExportFormat::Html,
            include_toc: false,
            include_properties: false,
        };
        let res = run(&v, &req, &target).unwrap();
        assert_eq!(res.notes_included, 1);
        let html = std::fs::read_to_string(out_dir.path().join("note.html")).unwrap();
        assert!(html.contains("<h1>Hello</h1>"));
    }
}
