//! Skills: ready-made jobs for Mimer that Mimer itself carries out, one note at a time.
//!
//! A small local model is poor at deciding by itself to call a tool, so it often answers in the
//! chat instead of changing a note. A skill takes that decision away: its `kind` says what Mimer
//! does (rewrite each note, sort notes into folders, write one new note, or just answer), and the
//! model only writes the text for one step. Mimer builds the proposals, which the user still
//! reviews before anything is written.
//!
//! Built-in skills live in the code. The user's own skills are stored in `skills.json` next to
//! `settings.json` (they belong to the user, not to a vault).

use crate::error::{AppError, AppResult};
use serde::{Deserialize, Serialize};
use std::path::Path;
use ts_rs::TS;
use uuid::Uuid;

const MAX_NAME: usize = 40;
const MAX_DESCRIPTION: usize = 120;
const MAX_INSTRUCTION: usize = 4000;
/// Most skills the user can keep.
const MAX_SKILLS: usize = 100;

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
            "Give the note a clear first heading (# ...) that says what it is about, and add two to five short tags to the front matter (tags: [a, b]). Keep any tags it already has. Change nothing else in the note.",
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

fn write_file(path: &Path, file: &SkillFile) -> AppResult<()> {
    if let Some(dir) = path.parent() {
        std::fs::create_dir_all(dir)?;
    }
    let tmp = path.with_extension("json.tmp");
    std::fs::write(&tmp, serde_json::to_vec_pretty(file)?)?;
    std::fs::rename(&tmp, path)?;
    Ok(())
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

/// Checks the fields of a skill the user wrote.
fn validate(s: &Skill) -> AppResult<()> {
    if s.name.trim().is_empty() {
        return Err(AppError::Settings("The skill needs a name".into()));
    }
    if s.name.trim().chars().count() > MAX_NAME {
        return Err(AppError::Settings(format!(
            "The name can be at most {MAX_NAME} characters"
        )));
    }
    if s.description.chars().count() > MAX_DESCRIPTION {
        return Err(AppError::Settings(format!(
            "The description can be at most {MAX_DESCRIPTION} characters"
        )));
    }
    if s.instruction.trim().is_empty() {
        return Err(AppError::Settings("The skill needs an instruction".into()));
    }
    if s.instruction.chars().count() > MAX_INSTRUCTION {
        return Err(AppError::Settings(format!(
            "The instruction can be at most {MAX_INSTRUCTION} characters"
        )));
    }
    Ok(())
}

/// Adds a new skill (empty id) or changes one of the user's own. Built-in skills are refused.
pub fn save(path: &Path, mut skill: Skill) -> AppResult<Skill> {
    if skill.id.starts_with("builtin:") {
        return Err(AppError::Settings(
            "A built-in skill cannot be changed. Copy it and change the copy.".into(),
        ));
    }
    validate(&skill)?;
    skill.name = skill.name.trim().to_string();
    skill.description = skill.description.trim().to_string();
    skill.instruction = skill.instruction.trim().to_string();
    skill.builtin = false;
    let mut file = read_file(path);
    file.schema_version = 1;
    let name_taken = |other: &Skill| {
        other.id != skill.id && other.name.to_lowercase() == skill.name.to_lowercase()
    };
    if builtins().iter().any(name_taken) || file.skills.iter().any(name_taken) {
        return Err(AppError::AlreadyExists(format!(
            "A skill called \"{}\" already exists",
            skill.name
        )));
    }
    match file.skills.iter_mut().find(|s| s.id == skill.id) {
        Some(existing) => *existing = skill.clone(),
        None => {
            if file.skills.len() >= MAX_SKILLS {
                return Err(AppError::Settings(format!(
                    "You can keep at most {MAX_SKILLS} skills"
                )));
            }
            skill.id = Uuid::new_v4().to_string();
            file.skills.push(skill.clone());
        }
    }
    write_file(path, &file)?;
    Ok(skill)
}

/// Removes one of the user's own skills. Returns false when there was none with that id.
pub fn remove(path: &Path, id: &str) -> AppResult<bool> {
    if id.starts_with("builtin:") {
        return Err(AppError::Settings(
            "A built-in skill cannot be removed".into(),
        ));
    }
    let mut file = read_file(path);
    let before = file.skills.len();
    file.skills.retain(|s| s.id != id);
    if file.skills.len() == before {
        return Ok(false);
    }
    write_file(path, &file)?;
    Ok(true)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn mine(name: &str) -> Skill {
        Skill {
            id: String::new(),
            name: name.into(),
            description: "d".into(),
            kind: SkillKind::Rewrite,
            applies_to: SkillTarget::Both,
            instruction: "Do it.".into(),
            builtin: false,
        }
    }

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
    fn add_change_and_remove_a_skill() {
        let d = tempfile::tempdir().unwrap();
        let file = d.path().join("skills.json");
        let a = save(&file, mine("Shorten")).unwrap();
        assert!(!a.id.is_empty() && !a.builtin);
        assert_eq!(list(&file).len(), builtins().len() + 1);
        let mut changed = a.clone();
        changed.instruction = "Cut it in half.".into();
        save(&file, changed).unwrap();
        let again = find(&file, &a.id).unwrap();
        assert_eq!(again.instruction, "Cut it in half.");
        assert_eq!(list(&file).len(), builtins().len() + 1);
        assert!(remove(&file, &a.id).unwrap());
        assert!(!remove(&file, &a.id).unwrap());
        assert_eq!(list(&file).len(), builtins().len());
    }

    #[test]
    fn built_in_skills_cannot_be_changed_or_removed() {
        let d = tempfile::tempdir().unwrap();
        let file = d.path().join("skills.json");
        let mut b = builtins().remove(0);
        b.instruction = "changed".into();
        assert!(save(&file, b).is_err());
        assert!(remove(&file, "builtin:fix-spelling").is_err());
    }

    #[test]
    fn bad_input_and_duplicate_names_are_refused() {
        let d = tempfile::tempdir().unwrap();
        let file = d.path().join("skills.json");
        assert!(save(&file, mine("  ")).is_err());
        let mut empty = mine("Empty");
        empty.instruction = "  ".into();
        assert!(save(&file, empty).is_err());
        save(&file, mine("Mine")).unwrap();
        assert!(save(&file, mine("mine")).is_err());
        assert!(save(&file, mine("Fix spelling and grammar")).is_err());
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
