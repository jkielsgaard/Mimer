//! Notes the user attached to a chat message with the `/` picker.
//!
//! The frontend only sends paths. Everything is checked here: the path must be a Markdown note
//! inside the active scope (project folder or vault), at most [`MAX_MENTIONS`] are used, and each
//! one is cut at [`MENTION_CHAR_LIMIT`] characters.

use super::prompt::truncate_middle;
use crate::vault::{fs_ops, paths, tree, tree::is_markdown};
use std::path::Path;

/// Most notes that can be attached to one message.
pub const MAX_MENTIONS: usize = 5;

/// Longest text kept per attached note (same as the `read_note` tool).
pub const MENTION_CHAR_LIMIT: usize = 12_000;

/// Most notes taken from one attached folder or project.
pub const FOLDER_NOTE_LIMIT: usize = 40;

/// Longest text kept per note that comes from a folder (shorter than a note attached by itself,
/// because many of them share the prompt).
pub const FOLDER_NOTE_CHAR_LIMIT: usize = 6_000;

/// The result of loading the attached notes.
#[derive(Debug, Default, PartialEq)]
pub struct LoadedMentions {
    /// `(path, content)` of every note that could be read, in the order attached.
    pub notes: Vec<(String, String)>,
    /// One readable line per note that was left out, shown to the user as activity.
    pub skipped: Vec<String>,
    /// True when the open note is among the attached ones (so it is not sent twice).
    pub includes_current: bool,
}

/// Loads the attached notes. Paths outside `scope`, non-Markdown files, unreadable files,
/// duplicates and anything beyond [`MAX_MENTIONS`] are skipped with a reason.
pub fn load(
    root: &Path,
    scope: Option<&str>,
    requested: &[String],
    current_note: Option<&str>,
) -> LoadedMentions {
    let mut out = LoadedMentions::default();
    let mut seen: Vec<&str> = Vec::new();
    for path in requested {
        if seen.contains(&path.as_str()) {
            continue;
        }
        seen.push(path);
        if out.notes.len() >= MAX_MENTIONS {
            out.skipped.push(format!(
                "Could not attach {path} (at most {MAX_MENTIONS} notes per message)"
            ));
            continue;
        }
        if !is_markdown(path) {
            attach_folder(root, scope, path, current_note, &mut out);
            continue;
        }
        if paths::resolve(root, path, scope).is_err() {
            let place = if scope.is_some() {
                "outside this project"
            } else {
                "not a valid note path"
            };
            out.skipped
                .push(format!("Could not attach {path} ({place})"));
            continue;
        }
        match fs_ops::read_note(root, path) {
            Ok(note) => {
                if current_note == Some(path.as_str()) {
                    out.includes_current = true;
                }
                out.notes.push((
                    note.path,
                    truncate_middle(&note.content, MENTION_CHAR_LIMIT),
                ));
            }
            Err(_) => out
                .skipped
                .push(format!("Could not attach {path} (it could not be read)")),
        }
    }
    out
}

/// Attaches the notes of a folder (and its sub-folders), if `path` is one inside the scope.
fn attach_folder(
    root: &Path,
    scope: Option<&str>,
    path: &str,
    current_note: Option<&str>,
    out: &mut LoadedMentions,
) {
    let folder = path.trim_matches('/');
    let is_folder =
        !folder.is_empty() && paths::resolve_dir(root, folder, scope).is_ok_and(|abs| abs.is_dir());
    if !is_folder {
        let reason = if scope.is_some() && !folder.is_empty() {
            "not a note, or outside this project"
        } else {
            "not a Markdown note or a folder"
        };
        out.skipped
            .push(format!("Could not attach {path} ({reason})"));
        return;
    }
    let prefix = format!("{folder}/");
    let mut found: Vec<String> = tree::list_files(root)
        .into_iter()
        .filter(|f| is_markdown(f) && f.starts_with(&prefix))
        .collect();
    found.sort_by_key(|f| f.to_lowercase());
    let total = found.len();
    if total == 0 {
        out.skipped
            .push(format!("Could not attach {folder} (it has no notes)"));
        return;
    }
    let mut taken = 0;
    for note in found {
        if out.notes.iter().any(|(p, _)| *p == note) {
            continue;
        }
        if taken >= FOLDER_NOTE_LIMIT {
            break;
        }
        if let Ok(n) = fs_ops::read_note(root, &note) {
            if current_note == Some(note.as_str()) {
                out.includes_current = true;
            }
            out.notes
                .push((n.path, truncate_middle(&n.content, FOLDER_NOTE_CHAR_LIMIT)));
            taken += 1;
        }
    }
    if total > FOLDER_NOTE_LIMIT {
        out.skipped.push(format!(
            "{folder} has {total} notes; the first {FOLDER_NOTE_LIMIT} were attached"
        ));
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn vault() -> tempfile::TempDir {
        let dir = tempfile::tempdir().unwrap();
        let root = dir.path();
        std::fs::create_dir_all(root.join("Work/Sec")).unwrap();
        std::fs::write(root.join("Home.md"), "# Home").unwrap();
        std::fs::write(root.join("Work/Plan.md"), "# Plan").unwrap();
        std::fs::write(root.join("Work/Sec/Keys.md"), "# Keys").unwrap();
        std::fs::write(root.join("Work/photo.png"), "png").unwrap();
        dir
    }

    fn req(paths: &[&str]) -> Vec<String> {
        paths.iter().map(|p| p.to_string()).collect()
    }

    #[test]
    fn loads_notes_in_order() {
        let dir = vault();
        let got = load(dir.path(), None, &req(&["Work/Plan.md", "Home.md"]), None);
        let names: Vec<&str> = got.notes.iter().map(|(p, _)| p.as_str()).collect();
        assert_eq!(names, vec!["Work/Plan.md", "Home.md"]);
        assert_eq!(got.notes[0].1, "# Plan");
        assert!(got.skipped.is_empty());
    }

    #[test]
    fn notes_outside_the_scope_are_refused() {
        let dir = vault();
        let got = load(
            dir.path(),
            Some("Work/Sec"),
            &req(&["Work/Sec/Keys.md", "Home.md", "Work/Plan.md"]),
            None,
        );
        assert_eq!(got.notes.len(), 1);
        assert_eq!(got.notes[0].0, "Work/Sec/Keys.md");
        assert_eq!(got.skipped.len(), 2);
        assert!(got.skipped[0].contains("Home.md"));
        assert!(got.skipped[0].contains("outside this project"));
    }

    #[test]
    fn traversal_absolute_and_hidden_paths_are_refused() {
        let dir = vault();
        let got = load(
            dir.path(),
            None,
            &req(&[
                "../x.md",
                "/etc/passwd.md",
                ".git/config.md",
                "Work\\Plan.md",
                "nope.md",
            ]),
            None,
        );
        assert!(got.notes.is_empty());
        assert_eq!(got.skipped.len(), 5);
    }

    #[test]
    fn non_markdown_files_are_refused() {
        let dir = vault();
        let got = load(dir.path(), None, &req(&["Work/photo.png"]), None);
        assert!(got.notes.is_empty());
        assert!(got.skipped[0].contains("not a Markdown note"));
    }

    #[test]
    fn duplicates_count_once_and_the_limit_is_enforced() {
        let dir = vault();
        let mut files = Vec::new();
        for i in 0..7 {
            let name = format!("n{i}.md");
            std::fs::write(dir.path().join(&name), "x").unwrap();
            files.push(name);
        }
        let mut asked = files.clone();
        asked.insert(1, files[0].clone());
        let got = load(dir.path(), None, &asked, None);
        assert_eq!(got.notes.len(), MAX_MENTIONS);
        assert_eq!(got.skipped.len(), 2);
        assert!(got.skipped[0].contains("at most 5"));
    }

    #[test]
    fn marks_when_the_open_note_is_attached() {
        let dir = vault();
        let got = load(dir.path(), None, &req(&["Home.md"]), Some("Home.md"));
        assert!(got.includes_current);
        let other = load(dir.path(), None, &req(&["Home.md"]), Some("Work/Plan.md"));
        assert!(!other.includes_current);
    }

    #[test]
    fn long_notes_are_truncated() {
        let dir = vault();
        std::fs::write(dir.path().join("Big.md"), "z".repeat(50_000)).unwrap();
        let got = load(dir.path(), None, &req(&["Big.md"]), None);
        assert!(got.notes[0].1.contains("[...truncated...]"));
        assert!(got.notes[0].1.chars().count() <= MENTION_CHAR_LIMIT);
    }

    fn folder_vault() -> tempfile::TempDir {
        let dir = vault();
        let root = dir.path();
        std::fs::write(root.join("Work/Sec/Inner.md"), "# Inner").unwrap();
        std::fs::create_dir_all(root.join("Work/Sec/Deep")).unwrap();
        std::fs::write(root.join("Work/Sec/Deep/Leaf.md"), "# Leaf").unwrap();
        std::fs::create_dir_all(root.join("Empty")).unwrap();
        dir
    }

    #[test]
    fn a_folder_brings_all_its_notes_including_sub_folders() {
        let dir = folder_vault();
        let got = load(dir.path(), None, &req(&["Work/Sec"]), None);
        let names: Vec<&str> = got.notes.iter().map(|(p, _)| p.as_str()).collect();
        assert_eq!(
            names,
            vec![
                "Work/Sec/Deep/Leaf.md",
                "Work/Sec/Inner.md",
                "Work/Sec/Keys.md"
            ]
        );
        assert!(got.skipped.is_empty());
    }

    #[test]
    fn a_folder_counts_as_one_attachment_and_mixes_with_notes() {
        let dir = folder_vault();
        let got = load(
            dir.path(),
            None,
            &req(&["Home.md", "Work/Sec", "Work/Plan.md"]),
            None,
        );
        assert_eq!(got.notes.len(), 5);
    }

    #[test]
    fn a_note_named_twice_is_sent_once() {
        let dir = folder_vault();
        let got = load(
            dir.path(),
            None,
            &req(&["Work/Sec/Keys.md", "Work/Sec"]),
            Some("Work/Sec/Keys.md"),
        );
        assert_eq!(
            got.notes
                .iter()
                .filter(|(p, _)| p == "Work/Sec/Keys.md")
                .count(),
            1
        );
        assert!(got.includes_current);
    }

    #[test]
    fn a_folder_outside_the_project_is_refused_and_a_project_folder_is_allowed() {
        let dir = folder_vault();
        let got = load(
            dir.path(),
            Some("Work/Sec"),
            &req(&["Work", "Work/Sec", "Other"]),
            None,
        );
        assert_eq!(got.notes.len(), 3, "only the project folder itself");
        assert_eq!(got.skipped.len(), 2);
        assert!(got.skipped[0].contains("Work"));
    }

    #[test]
    fn empty_hidden_and_unsafe_folders_are_refused() {
        let dir = folder_vault();
        std::fs::create_dir_all(dir.path().join(".git")).unwrap();
        let got = load(
            dir.path(),
            None,
            &req(&["Empty", ".git", "../x", "", "/"]),
            None,
        );
        assert!(got.notes.is_empty());
        assert_eq!(got.skipped.len(), 5);
        assert!(got.skipped[0].contains("no notes"));
    }

    #[test]
    fn a_big_folder_is_cut_at_the_limit_with_a_notice_and_notes_are_shortened() {
        let dir = tempfile::tempdir().unwrap();
        for i in 0..(FOLDER_NOTE_LIMIT + 5) {
            std::fs::create_dir_all(dir.path().join("Big")).unwrap();
            std::fs::write(
                dir.path().join(format!("Big/n{i:03}.md")),
                "w".repeat(FOLDER_NOTE_CHAR_LIMIT * 2),
            )
            .unwrap();
        }
        let got = load(dir.path(), None, &req(&["Big"]), None);
        assert_eq!(got.notes.len(), FOLDER_NOTE_LIMIT);
        assert!(got.skipped[0].contains("first 40"));
        assert!(got.notes[0].1.chars().count() <= FOLDER_NOTE_CHAR_LIMIT);
    }
}
