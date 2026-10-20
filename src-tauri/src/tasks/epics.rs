//! Epic tasks: a note in the folder `Tasks/` that holds tasks. An epic is only a note, so it works
//! in any other editor. A task made in an ordinary note is put in an epic of its own, a note in
//! `Tasks/` with a `source:` line that points back at the note it came from.

use crate::error::{AppError, AppResult};
use serde::Serialize;
use ts_rs::TS;

/// The folder the epic notes live in.
pub const EPICS_DIR: &str = "Tasks";

/// The epic that quick tasks (written without choosing an epic) go into.
pub const INBOX: &str = "Tasks/Inbox.md";

/// One epic task: a note in `Tasks/`.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct Epic {
    /// The note, vault-relative.
    pub path: String,
    /// The first heading of the note, else its file name.
    pub title: String,
    /// The note the epic was made from (a link target such as `IT/VPN client guide`), if any.
    pub source: Option<String>,
}

/// Whether a path is a note in the epic folder.
pub fn is_epic_path(path: &str) -> bool {
    path.strip_prefix(EPICS_DIR)
        .is_some_and(|rest| rest.starts_with('/'))
        && path.to_lowercase().ends_with(".md")
        && !path[EPICS_DIR.len() + 1..].contains('/')
}

fn stem(path: &str) -> String {
    let name = path.rsplit('/').next().unwrap_or(path);
    name.strip_suffix(".md")
        .or_else(|| name.strip_suffix(".MD"))
        .unwrap_or(name)
        .to_string()
}

/// The `source:` of the front matter, as a link target (`[[x]]` and quotes are removed).
fn source_of(content: &str) -> Option<String> {
    let mut lines = content.lines();
    if lines.next()?.trim_end() != "---" {
        return None;
    }
    for l in lines {
        if l.trim_end() == "---" {
            return None;
        }
        if let Some(v) = l.strip_prefix("source:") {
            let v = v
                .trim()
                .trim_matches('"')
                .trim_start_matches("[[")
                .trim_end_matches("]]")
                .trim();
            return (!v.is_empty()).then(|| v.to_string());
        }
    }
    None
}

/// Reads an epic from its note.
pub fn read_epic(path: &str, content: &str) -> Epic {
    let title = content
        .lines()
        .find_map(|l| l.strip_prefix("# "))
        .map(|t| t.trim().to_string())
        .filter(|t| !t.is_empty())
        .unwrap_or_else(|| stem(path));
    Epic {
        path: path.to_string(),
        title,
        source: source_of(content),
    }
}

/// The text of a new epic note.
pub fn new_epic_text(title: &str, source: Option<&str>) -> AppResult<String> {
    let title = title.split_whitespace().collect::<Vec<_>>().join(" ");
    if title.is_empty() {
        return Err(AppError::InvalidPath("The epic task needs a name".into()));
    }
    Ok(match source {
        Some(s) => format!("---\nsource: \"[[{s}]]\"\n---\n# {title}\n\n"),
        None => format!("# {title}\n\n"),
    })
}

/// The link target of a note: its path without `.md`.
pub fn link_target(note: &str) -> String {
    note.strip_suffix(".md")
        .or_else(|| note.strip_suffix(".MD"))
        .unwrap_or(note)
        .to_string()
}

/// A file name for an epic: the title without characters a file name cannot have.
pub fn file_name_for(title: &str) -> String {
    let cleaned: String = title
        .chars()
        .map(|c| {
            if matches!(c, '/' | '\\' | ':' | '*' | '?' | '"' | '<' | '>' | '|') {
                ' '
            } else {
                c
            }
        })
        .collect();
    let cleaned = cleaned.split_whitespace().collect::<Vec<_>>().join(" ");
    let cleaned = cleaned.trim_matches('.').to_string();
    if cleaned.is_empty() {
        "Epic".to_string()
    } else {
        cleaned.chars().take(80).collect()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn only_notes_directly_in_the_epic_folder_are_epics() {
        assert!(is_epic_path("Tasks/VPN.md"));
        assert!(!is_epic_path("Tasks/Sub/VPN.md"));
        assert!(!is_epic_path("Tasks.md"));
        assert!(!is_epic_path("Other/Tasks/VPN.md"));
        assert!(!is_epic_path("Tasks/pic.png"));
    }

    #[test]
    fn the_title_and_source_are_read_from_the_note() {
        let e = read_epic(
            "Tasks/VPN client guide.md",
            "---\nsource: \"[[IT/VPN client guide]]\"\n---\n# The VPN guide\n\n- [ ] A\n",
        );
        assert_eq!(e.title, "The VPN guide");
        assert_eq!(e.source.as_deref(), Some("IT/VPN client guide"));
        let plain = read_epic("Tasks/Plain.md", "- [ ] A\n");
        assert_eq!(plain.title, "Plain");
        assert_eq!(plain.source, None);
    }

    #[test]
    fn a_new_epic_has_a_heading_and_maybe_a_source() {
        assert_eq!(
            new_epic_text(" Office  move ", None).unwrap(),
            "# Office move\n\n"
        );
        assert_eq!(
            new_epic_text("Guide", Some("IT/Guide")).unwrap(),
            "---\nsource: \"[[IT/Guide]]\"\n---\n# Guide\n\n"
        );
        assert!(new_epic_text("  ", None).is_err());
        assert_eq!(file_name_for("a/b: c?"), "a b c");
    }
}
