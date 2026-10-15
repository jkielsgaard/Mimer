//! File tree and flat file list.

use super::paths::is_hidden;
use crate::error::AppResult;
use serde::Serialize;
use std::path::Path;
use ts_rs::TS;

const ATTACHMENT_EXTS: &[&str] = &[
    "png", "jpg", "jpeg", "gif", "webp", "svg", "bmp", "avif", "pdf", "txt", "csv", "zip", "docx",
    "xlsx", "pptx", "mp3", "wav", "mp4", "webm",
];

/// One entry in the file tree.
#[derive(Debug, Clone, Serialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct TreeNode {
    pub name: String,
    pub path: String,
    pub is_dir: bool,
    pub children: Vec<TreeNode>,
    /// When the file was last changed (milliseconds since 1970); 0 for folders.
    #[ts(type = "number")]
    pub modified: i64,
}

/// True for files the tree, index and link resolver care about.
pub fn is_visible_file(name: &str) -> bool {
    match name.rsplit_once('.') {
        Some((stem, ext)) if !stem.is_empty() => {
            let ext = ext.to_lowercase();
            ext == "md" || ATTACHMENT_EXTS.contains(&ext.as_str())
        }
        _ => false,
    }
}

/// True for Markdown notes.
pub fn is_markdown(path: &str) -> bool {
    path.to_lowercase().ends_with(".md")
}

fn walk(dir: &Path, prefix: &str) -> Vec<TreeNode> {
    let Ok(read) = std::fs::read_dir(dir) else {
        return Vec::new();
    };
    let mut nodes = Vec::new();
    for entry in read.flatten() {
        let name = entry.file_name().to_string_lossy().into_owned();
        if is_hidden(&name) {
            continue;
        }
        let Ok(ft) = entry.file_type() else { continue };
        let path = if prefix.is_empty() {
            name.clone()
        } else {
            format!("{prefix}/{name}")
        };
        if ft.is_dir() {
            let children = walk(&entry.path(), &path);
            nodes.push(TreeNode {
                name,
                path,
                is_dir: true,
                children,
                modified: 0,
            });
        } else if ft.is_file() && is_visible_file(&name) {
            let modified = super::fs_ops::mtime_ms(&entry.path());
            nodes.push(TreeNode {
                name,
                path,
                is_dir: false,
                children: Vec::new(),
                modified,
            });
        }
    }
    nodes.sort_by(|a, b| {
        b.is_dir
            .cmp(&a.is_dir)
            .then_with(|| a.name.to_lowercase().cmp(&b.name.to_lowercase()))
    });
    nodes
}

/// Builds the visible file tree: folders first, then files, case-insensitive.
pub fn build_tree(root: &Path) -> AppResult<Vec<TreeNode>> {
    let root = std::fs::canonicalize(root)?;
    Ok(walk(&root, ""))
}

fn flatten(nodes: &[TreeNode], out: &mut Vec<String>) {
    for n in nodes {
        if n.is_dir {
            flatten(&n.children, out);
        } else {
            out.push(n.path.clone());
        }
    }
}

/// All visible files, vault-relative, sorted.
pub fn list_files(root: &Path) -> Vec<String> {
    let mut out = Vec::new();
    if let Ok(tree) = build_tree(root) {
        flatten(&tree, &mut out);
    }
    out.sort();
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn tree_is_sorted_and_filtered() {
        let d = tempfile::tempdir().unwrap();
        let r = d.path();
        std::fs::create_dir_all(r.join("Zeta")).unwrap();
        std::fs::create_dir_all(r.join(".git")).unwrap();
        std::fs::create_dir_all(r.join("node_modules")).unwrap();
        std::fs::write(r.join("b.md"), "").unwrap();
        std::fs::write(r.join("A.md"), "").unwrap();
        std::fs::write(r.join("code.rs"), "").unwrap();
        std::fs::write(r.join("pic.PNG"), "").unwrap();
        std::fs::write(r.join(".hidden.md"), "").unwrap();
        std::fs::write(r.join("Zeta/inner.md"), "").unwrap();
        let tree = build_tree(r).unwrap();
        let names: Vec<_> = tree.iter().map(|n| n.name.as_str()).collect();
        assert_eq!(names, vec!["Zeta", "A.md", "b.md", "pic.PNG"]);
        assert_eq!(
            list_files(r),
            vec!["A.md", "Zeta/inner.md", "b.md", "pic.PNG"]
        );
    }

    #[test]
    fn files_carry_their_modified_time_and_folders_do_not() {
        let d = tempfile::tempdir().unwrap();
        std::fs::create_dir_all(d.path().join("Sub")).unwrap();
        std::fs::write(d.path().join("a.md"), "x").unwrap();
        let tree = build_tree(d.path()).unwrap();
        let folder = tree.iter().find(|n| n.is_dir).unwrap();
        let file = tree.iter().find(|n| !n.is_dir).unwrap();
        assert_eq!(folder.modified, 0);
        assert!(file.modified > 1_700_000_000_000, "{}", file.modified);
    }
}
