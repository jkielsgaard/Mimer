//! Skills: ready-made jobs for Mimer that Mimer itself carries out, one note at a time.
//!
//! A small local model is poor at deciding by itself to call a tool, so it often answers in the
//! chat instead of changing a note. A skill takes that decision away: its `kind` says what Mimer
//! does (rewrite each note, sort notes into folders, write one new note, or just answer), and the
//! model only writes the text for one step. Mimer builds the proposals, which the user still
//! reviews before anything is written.
//!
//! Built-in skills live in the code. Skills the user made in an older version (before 0.11.0,
//! when Settings had a Skills tab) are read from `skills.json` next to `settings.json`; they can
//! no longer be made or changed in the app.

use serde::{Deserialize, Serialize};
use std::path::Path;
use ts_rs::TS;

/// What Mimer does when a skill runs.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub enum SkillKind {
    /// Fixes small mistakes: the model lists "wrong => right", Mimer puts only those in.
    Fix,
    /// Rewrites every chosen note: the model returns the whole new text of one note at a time.
    Rewrite,
    /// Sorts the chosen notes into folders: the model names the folder of one note at a time.
    Sort,
    /// Writes one new note from all the chosen notes.
    Create,
    /// An ordinary chat turn with the instruction put in front of the message.
    Answer,
}

/// What a skill can be run on. Decides where it is offered (the right-click menu in the file tree).
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, TS, Default)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub enum SkillTarget {
    /// One or more notes.
    Note,
    /// A folder (all the notes in it).
    Folder,
    /// Notes and folders alike.
    #[default]
    Both,
}

/// A skill: a name, a kind and the instruction the model follows.
#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct Skill {
    /// `builtin:<name>` for the ones in the code, a UUID for the user's own.
    pub id: String,
    pub name: String,
    pub description: String,
    pub kind: SkillKind,
    /// What the skill is offered for. Skills saved before this field existed work on both.
    #[serde(default)]
    pub applies_to: SkillTarget,
    pub instruction: String,
    /// Built-in skills cannot be changed or removed (they can be copied).
    #[serde(default)]
    pub builtin: bool,
}

#[derive(Debug, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase", default)]
struct SkillFile {
    schema_version: u32,
    skills: Vec<Skill>,
}

fn builtin(
    id: &str,
    name: &str,
    description: &str,
    kind: SkillKind,
    applies_to: SkillTarget,
    instruction: &str,
) -> Skill {
    Skill {
        id: format!("builtin:{id}"),
        name: name.into(),
        description: description.into(),
        kind,
        applies_to,
        instruction: instruction.into(),
        builtin: true,
    }
}

/// The skills that come with Mimer.
pub fn builtins() -> Vec<Skill> {
    use SkillKind::{Answer, Create, Fix, Rewrite, Sort};
    use SkillTarget::{Both, Folder, Note};
    vec![
        builtin(
            "fix-spelling",
            "Fix spelling and grammar",
            "Only the wrong words are changed",
            Fix,
            Both,
            "Fix spelling and grammar. Do not change the meaning, the structure, the links or the tags.",
        ),
        builtin(
            "improve-structure",
            "Improve the structure",
            "Clear headings, lists and tidy formatting",
            Rewrite,
            Both,
            "Improve the structure and formatting of the note: clear headings with consistent levels, short paragraphs, lists where they help, and tags in the front matter. Keep all the information and do not add anything new.",
        ),
        builtin(
            "improve-text",
            "Improve the writing",
            "Clearer and easier to read",
            Rewrite,
            Both,
            "Improve the text so it is clear and easy to read. Keep the meaning, the facts and the Markdown formatting.",
        ),
        builtin(
            "sort-into-folders",
            "Sort into folders",
            "File each note in a folder by subject",
            Sort,
            Folder,
            "Sort the notes into folders by subject. Use short folder names, and reuse a folder when a note fits it.",
        ),
        builtin(
            "summarise",
            "Summarise",
            "A short overview note",
            Create,
            Both,
            "Write a short summary of the notes. Only use what is in the notes, and link to each source note.",
        ),
        builtin(
            "action-items",
            "Collect action items",
            "Tasks and decisions in one list",
            Create,
            Both,
            "Collect all action items and decisions from the notes into one task list, grouped by note. Include who owns each item if the notes say so.",
        ),
        builtin(
            "index-page",
            "Create an index page",
            "A table of contents with links",
            Create,
            Folder,
            "Write an index note with a short description and a link to every source note, grouped by subject.",
        ),
        builtin(
            "explain",
            "Explain these notes",
            "Answer questions about the notes",
            Answer,
            Both,
            "Explain what the attached notes say in plain words. Only use what is in the notes. If something is missing, say so.",
        ),
        builtin(
            "duplicates",
            "Find duplicates and overlaps",
            "Notes that cover the same thing",
            Answer,
            Folder,
            "Find notes among the attached ones that cover the same subject or repeat each other. List them and say how they overlap. Then propose merging the ones that clearly belong together.",
        ),
        builtin(
            "merge",
            "Merge notes",
            "Combine the attached notes into one",
            Answer,
            Both,
            "Merge the attached notes into one note. Keep all information, remove duplicates, order it logically with clear headings, and propose deleting the notes that were merged.",
        ),
        builtin(
            "summary-at-top",
            "Short summary at the top",
            "Three lines: what, why, next",
            Rewrite,
            Note,
            "Add a short summary at the top of the note, right under its first heading, as a quote block of three lines that start with **What:**, **Why:** and **Next:**. Only use what the note says. Keep everything else in the note exactly as it is, word for word.",
        ),
        builtin(
            "title-and-tags",
            "Suggest a title and tags",
            "From the words in the note",
            Rewrite,
            Note,
            "Give the note a clear first heading (# ...) that says what it is about, and add two to five short tags of your own to the front matter (tags: [a, b]). Keep any tags it already has, and never add the tags meeting, epic or pinned. Change nothing else in the note.",
        ),
        builtin(
            "email-from-note",
            "An e-mail from this note",
            "A short e-mail as a new note",
            Create,
            Note,
            "Write a short, friendly e-mail based on the note, as a new note: a subject line, a greeting, the main points in a few short paragraphs or a list, and a closing. Only use what the note says. Write in the language of the note.",
        ),
        builtin(
            "split",
            "Split a long note",
            "One note per heading, plus an index",
            Answer,
            Note,
            "Split the note into one note per main heading, and create an index note that links to all of them. Keep the original text as it is.",
        ),
    ]
}

fn read_file(path: &Path) -> SkillFile {
    std::fs::read_to_string(path)
        .ok()
        .and_then(|s| serde_json::from_str(&s).ok())
        .unwrap_or_default()
}

/// The built-in skills followed by the user's own, in the order they were made.
pub fn list(path: &Path) -> Vec<Skill> {
    let mut all = builtins();
    all.extend(read_file(path).skills.into_iter().map(|mut s| {
        s.builtin = false;
        s
    }));
    all
}

/// Finds one skill by id.
pub fn find(path: &Path, id: &str) -> Option<Skill> {
    list(path).into_iter().find(|s| s.id == id)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn builtins_are_unique_and_written_in_english() {
        let all = builtins();
        let mut ids: Vec<&str> = all.iter().map(|s| s.id.as_str()).collect();
        ids.sort_unstable();
        ids.dedup();
        assert_eq!(ids.len(), all.len());
        assert!(all
            .iter()
            .all(|s| s.builtin && s.id.starts_with("builtin:")));
        assert!(all.iter().any(|s| s.kind == SkillKind::Rewrite));
        assert!(all.iter().any(|s| s.kind == SkillKind::Fix));
        assert!(all.iter().any(|s| s.kind == SkillKind::Sort));
        assert!(all.iter().any(|s| s.kind == SkillKind::Create));
        assert!(all.iter().any(|s| s.kind == SkillKind::Answer));
    }

    #[test]
    fn an_older_skill_without_a_target_works_on_both() {
        let d = tempfile::tempdir().unwrap();
        let file = d.path().join("skills.json");
        std::fs::write(
            &file,
            r#"{"schemaVersion":1,"skills":[{"id":"x","name":"Old","description":"","kind":"rewrite","instruction":"Do."}]}"#,
        )
        .unwrap();
        assert_eq!(find(&file, "x").unwrap().applies_to, SkillTarget::Both);
        let split = find(&file, "builtin:split").unwrap();
        assert_eq!(split.applies_to, SkillTarget::Note);
    }

    #[test]
    fn a_missing_or_broken_file_gives_only_the_built_ins() {
        let d = tempfile::tempdir().unwrap();
        let file = d.path().join("skills.json");
        assert_eq!(list(&file).len(), builtins().len());
        std::fs::write(&file, "not json").unwrap();
        assert_eq!(list(&file).len(), builtins().len());
    }
}
