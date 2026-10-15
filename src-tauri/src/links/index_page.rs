//! Index pages: a note in a folder that links to every note in it.
//!
//! The list lives between two marker comments. Creating the index again only rewrites that block,
//! so text the user wrote above or below it is never touched.

use super::resolve::LinkResolver;
use crate::error::{AppError, AppResult};
use crate::git::{CommitKind, CommitReason};
use crate::vault::tree::is_markdown;
use crate::vault::{ops, paths, OpenVault};
use std::collections::BTreeMap;

/// Marks the start of the generated list.
pub const START: &str = "<!-- mimer:index:start -->";
/// Marks the end of the generated list.
pub const END: &str = "<!-- mimer:index:end -->";

/// Deepest folder level listed.
const MAX_DEPTH: usize = 6;

/// Most notes listed in one index.
const MAX_ENTRIES: usize = 2_000;

fn stem(path: &str) -> &str {
    let name = path.rsplit('/').next().unwrap_or(path);
    name.strip_suffix(".md")
        .or_else(|| name.strip_suffix(".MD"))
        .unwrap_or(name)
}

/// Name of the index note for a folder: `<folder name> index.md`, or `Index.md` for the vault root.
pub fn index_file_name(folder: &str) -> String {
    match folder.trim_matches('/').rsplit('/').next() {
        Some(name) if !name.is_empty() => format!("{name} index.md"),
        _ => "Index.md".to_string(),
    }
}

/// A folder's notes and sub-folders, sorted without regard to case.
#[derive(Default)]
struct Node {
    notes: Vec<String>,
    folders: BTreeMap<String, Node>,
}

impl Node {
    fn count(&self) -> usize {
        self.notes.len() + self.folders.values().map(Node::count).sum::<usize>()
    }
}

fn insert(root: &mut Node, relative: &str, full: &str) {
    let mut node = root;
    let mut parts: Vec<&str> = relative.split('/').collect();
    parts.pop();
    for part in parts {
        node = node.folders.entry(part.to_lowercase()).or_default();
    }
    node.notes.push(full.to_string());
}

fn link(path: &str, resolver: &LinkResolver) -> String {
    let form = resolver.shortest_form(path);
    if form == stem(path) {
        format!("[[{form}]]")
    } else {
        format!("[[{form}|{}]]", stem(path))
    }
}

fn render(
    node: &Node,
    folder_path: &str,
    resolver: &LinkResolver,
    files: &[String],
    depth: usize,
    out: &mut Vec<String>,
) {
    let indent = "  ".repeat(depth);
    let mut notes = node.notes.clone();
    notes.sort_by_key(|n| stem(n).to_lowercase());
    for n in notes {
        out.push(format!("{indent}- {}", link(&n, resolver)));
    }
    if depth + 1 >= MAX_DEPTH {
        return;
    }
    for (key, child) in &node.folders {
        if child.count() == 0 {
            continue;
        }
        // Show the folder with its real name: take it from the first note's path.
        let first = first_note(child).unwrap_or_default();
        let prefix_len = folder_path.len() + usize::from(!folder_path.is_empty());
        let name = first[prefix_len..]
            .split('/')
            .next()
            .filter(|s| s.to_lowercase() == *key)
            .unwrap_or(key)
            .to_string();
        let sub_path = if folder_path.is_empty() {
            name.clone()
        } else {
            format!("{folder_path}/{name}")
        };
        let own_index = format!("{sub_path}/{}", index_file_name(&sub_path));
        if files.iter().any(|f| f.eq_ignore_ascii_case(&own_index)) {
            out.push(format!(
                "{indent}- [[{}|{name}]]",
                resolver.shortest_form(&own_index)
            ));
        } else {
            out.push(format!("{indent}- **{name}**"));
        }
        render(child, &sub_path, resolver, files, depth + 1, out);
    }
}

fn first_note(node: &Node) -> Option<String> {
    node.notes
        .first()
        .cloned()
        .or_else(|| node.folders.values().find_map(first_note))
}

/// The generated list for `folder`: its notes first, then each sub-folder with its notes.
/// `files` are all vault files; the index note itself is left out.
pub fn build_block(files: &[String], folder: &str, resolver: &LinkResolver) -> String {
    let folder = folder.trim_matches('/');
    let own = if folder.is_empty() {
        index_file_name("")
    } else {
        format!("{folder}/{}", index_file_name(folder))
    };
    let prefix = if folder.is_empty() {
        String::new()
    } else {
        format!("{folder}/")
    };
    let mut root = Node::default();
    let mut kept = 0;
    for f in files {
        if !is_markdown(f) || !f.starts_with(&prefix) || f.eq_ignore_ascii_case(&own) {
            continue;
        }
        if kept >= MAX_ENTRIES {
            break;
        }
        kept += 1;
        insert(&mut root, &f[prefix.len()..], f);
    }
    let mut out = Vec::new();
    render(&root, folder, resolver, files, 0, &mut out);
    if out.is_empty() {
        out.push("_No notes here yet._".to_string());
    }
    out.join("\n")
}

/// Puts `block` into the note text. A new note gets a title; an existing note keeps everything
/// outside the markers, and a note without markers gets the block appended.
pub fn merge_block(existing: Option<&str>, title: &str, block: &str) -> String {
    let marked = format!("{START}\n{block}\n{END}");
    let Some(text) = existing else {
        return format!("# {title}\n\n{marked}\n");
    };
    if let (Some(start), Some(end)) = (text.find(START), text.find(END)) {
        if start < end {
            return format!("{}{marked}{}", &text[..start], &text[end + END.len()..]);
        }
    }
    format!("{}\n\n{marked}\n", text.trim_end())
}

/// Creates the index note of `folder` (`""` = the vault root), or refreshes its list when it
/// already exists. Returns the note's path. Unsaved work in an existing index is committed
/// first, and the change is one commit.
pub fn create_or_update(v: &OpenVault, folder: &str) -> AppResult<String> {
    let folder = folder.trim_matches('/');
    let dir = paths::resolve_dir(&v.root, folder, None)?;
    if !dir.is_dir() {
        return Err(AppError::NotFound(format!("{folder} is not a folder")));
    }
    let name = index_file_name(folder);
    let path = if folder.is_empty() {
        name
    } else {
        format!("{folder}/{name}")
    };
    v.refresh_files();
    let files = v.file_list();
    let block = build_block(&files, folder, &v.resolver());
    let abs = paths::resolve(&v.root, &path, None)?;
    let existing = if abs.exists() {
        Some(std::fs::read_to_string(&abs)?)
    } else {
        None
    };
    let title = if folder.is_empty() {
        v.name()
    } else {
        folder.rsplit('/').next().unwrap_or(folder).to_string()
    };
    let merged = merge_block(existing.as_deref(), &title, &block);
    if existing.as_deref() == Some(merged.as_str()) {
        return Ok(path);
    }
    if existing.is_some() {
        v.commit(
            CommitReason::new(CommitKind::Autosave, path.clone()),
            Some(std::slice::from_ref(&path)),
        )?;
    }
    ops::write_note(v, &path, &merged)?;
    v.refresh_files();
    v.commit(
        CommitReason::new(
            CommitKind::Index,
            if folder.is_empty() {
                v.name()
            } else {
                folder.to_string()
            },
        ),
        Some(std::slice::from_ref(&path)),
    )?;
    Ok(path)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::vault::open_for_test;

    fn vault(files: &[(&str, &str)]) -> (tempfile::TempDir, OpenVault) {
        let dir = tempfile::tempdir().unwrap();
        for (p, c) in files {
            let abs = dir.path().join(p);
            std::fs::create_dir_all(abs.parent().unwrap()).unwrap();
            std::fs::write(abs, c).unwrap();
        }
        let v = open_for_test(dir.path());
        (dir, v)
    }

    fn commit_count(v: &OpenVault) -> usize {
        v.with_repo(|r| {
            let mut w = r.revwalk()?;
            w.push_head()?;
            Ok(w.count())
        })
        .unwrap()
    }

    #[test]
    fn the_index_file_is_named_after_the_folder() {
        assert_eq!(
            index_file_name("Work/Security docs"),
            "Security docs index.md"
        );
        assert_eq!(index_file_name("Work"), "Work index.md");
        assert_eq!(index_file_name(""), "Index.md");
    }

    #[test]
    fn a_new_index_lists_notes_then_sub_folders_sorted_without_case() {
        let (_d, v) = vault(&[
            ("Work/zeta.md", "z"),
            ("Work/Alpha.md", "a"),
            ("Work/Sub/Deep.md", "d"),
            ("Work/Sub/Inner/Leaf.md", "l"),
            ("Work/photo.png", "x"),
            ("Home.md", "h"),
        ]);
        let path = create_or_update(&v, "Work").unwrap();
        assert_eq!(path, "Work/Work index.md");
        let text = std::fs::read_to_string(v.root.join(&path)).unwrap();
        assert_eq!(
            text,
            "# Work\n\n<!-- mimer:index:start -->\n- [[Alpha]]\n- [[zeta]]\n- **Sub**\n  - [[Deep]]\n  - **Inner**\n    - [[Leaf]]\n<!-- mimer:index:end -->\n"
        );
        assert!(
            !text.contains("Home"),
            "notes outside the folder are not listed"
        );
        assert!(!text.contains("photo"), "attachments are not listed");
    }

    #[test]
    fn the_index_never_lists_itself_and_empty_folders_show_a_hint() {
        let (_d, v) = vault(&[("Empty/.keep", "")]);
        let path = create_or_update(&v, "Empty").unwrap();
        let text = std::fs::read_to_string(v.root.join(path)).unwrap();
        assert!(text.contains("_No notes here yet._"));
        let again = create_or_update(&v, "Empty").unwrap();
        assert!(!std::fs::read_to_string(v.root.join(again))
            .unwrap()
            .contains("[[Empty index]]"));
    }

    #[test]
    fn ambiguous_names_link_by_path_with_the_short_name_as_text() {
        let (_d, v) = vault(&[("Work/Notes.md", "a"), ("Other/Notes.md", "b")]);
        let text =
            std::fs::read_to_string(v.root.join(create_or_update(&v, "Work").unwrap())).unwrap();
        assert!(text.contains("- [[Work/Notes|Notes]]"), "{text}");
    }

    #[test]
    fn refreshing_keeps_the_users_text_and_updates_only_the_list() {
        let (_d, v) = vault(&[("Work/a.md", "a")]);
        let path = create_or_update(&v, "Work").unwrap();
        let abs = v.root.join(&path);
        let mine = std::fs::read_to_string(&abs)
            .unwrap()
            .replace("# Work", "# Work\n\nMy intro.")
            + "\nMy footer.\n";
        std::fs::write(&abs, &mine).unwrap();
        std::fs::write(v.root.join("Work/b.md"), "b").unwrap();
        create_or_update(&v, "Work").unwrap();
        let text = std::fs::read_to_string(&abs).unwrap();
        assert!(text.contains("My intro."));
        assert!(text.contains("My footer."));
        assert!(text.contains("- [[a]]\n- [[b]]"));
    }

    #[test]
    fn a_note_without_markers_gets_the_list_appended_not_replaced() {
        assert_eq!(
            merge_block(Some("My own index\n"), "T", "- [[a]]"),
            "My own index\n\n<!-- mimer:index:start -->\n- [[a]]\n<!-- mimer:index:end -->\n"
        );
        assert_eq!(
            merge_block(None, "T", "- [[a]]"),
            "# T\n\n<!-- mimer:index:start -->\n- [[a]]\n<!-- mimer:index:end -->\n"
        );
    }

    #[test]
    fn markers_in_the_wrong_order_are_not_trusted() {
        let broken = format!("{END}\ntext\n{START}\n");
        let merged = merge_block(Some(&broken), "T", "- [[a]]");
        assert!(merged.starts_with(&broken.trim_end().to_string()));
        assert!(merged.ends_with(&format!("{END}\n")));
    }

    #[test]
    fn nothing_is_written_or_committed_when_the_list_has_not_changed() {
        let (_d, v) = vault(&[("Work/a.md", "a")]);
        create_or_update(&v, "Work").unwrap();
        let before = commit_count(&v);
        create_or_update(&v, "Work").unwrap();
        assert_eq!(commit_count(&v), before);
    }

    #[test]
    fn creating_makes_one_commit_and_the_index_is_found_by_the_link_resolver() {
        let (_d, v) = vault(&[("Work/a.md", "a")]);
        let before = commit_count(&v);
        create_or_update(&v, "Work").unwrap();
        assert_eq!(commit_count(&v), before + 1);
        let msg = v
            .with_repo(|r| {
                Ok(r.head()?
                    .peel_to_commit()?
                    .message()
                    .unwrap_or_default()
                    .to_string())
            })
            .unwrap();
        assert_eq!(msg.trim(), "Index: Work");
        assert!(v.resolver().resolve("Work index").is_some());
    }

    #[test]
    fn a_sub_folder_with_its_own_index_is_linked_to_it() {
        let (_d, v) = vault(&[("Work/Sub/x.md", "x")]);
        create_or_update(&v, "Work/Sub").unwrap();
        let text =
            std::fs::read_to_string(v.root.join(create_or_update(&v, "Work").unwrap())).unwrap();
        assert!(text.contains("- [[Sub index|Sub]]"), "{text}");
    }

    #[test]
    fn the_vault_root_gets_an_index_named_index() {
        let (_d, v) = vault(&[("Home.md", "h"), ("Work/a.md", "a")]);
        let path = create_or_update(&v, "").unwrap();
        assert_eq!(path, "Index.md");
        let text = std::fs::read_to_string(v.root.join(path)).unwrap();
        assert!(text.contains("- [[Home]]"));
        assert!(text.contains("- **Work**"));
    }

    #[test]
    fn a_missing_or_unsafe_folder_is_refused() {
        let (_d, v) = vault(&[("Work/a.md", "a")]);
        assert!(create_or_update(&v, "Nope").is_err());
        assert!(create_or_update(&v, "../escape").is_err());
        assert!(create_or_update(&v, ".git").is_err());
    }
}
