//! Saved prompts in `.vault/prompts.json` (committed to Git).

use crate::error::{AppError, AppResult};
use crate::projects;
use crate::vault::paths::resolve_internal;
use serde::{Deserialize, Serialize};
use std::path::Path;
use ts_rs::TS;
use uuid::Uuid;

const FILE: &str = ".vault/prompts.json";
const MAX_TITLE: usize = 80;

/// A reusable prompt.
#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct SavedPrompt {
    pub id: String,
    pub title: String,
    pub text: String,
    pub created_at: String,
}

#[derive(Debug, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase", default)]
struct PromptFile {
    schema_version: u32,
    prompts: Vec<SavedPrompt>,
}

fn read_file(root: &Path) -> PromptFile {
    resolve_internal(root, FILE)
        .ok()
        .and_then(|p| std::fs::read_to_string(p).ok())
        .and_then(|s| serde_json::from_str(&s).ok())
        .unwrap_or_default()
}

/// All saved prompts in insertion order. Empty when the file is missing or unreadable.
pub fn list(root: &Path) -> Vec<SavedPrompt> {
    read_file(root).prompts
}

/// Adds a prompt. Title and text are trimmed; both must be non-empty.
pub fn add(root: &Path, title: &str, text: &str) -> AppResult<SavedPrompt> {
    let title = title.trim();
    let text = text.trim();
    if title.is_empty() {
        return Err(AppError::InvalidPath("The prompt title is empty".into()));
    }
    if text.is_empty() {
        return Err(AppError::InvalidPath("The prompt text is empty".into()));
    }
    let prompt = SavedPrompt {
        id: Uuid::new_v4().to_string(),
        title: title.chars().take(MAX_TITLE).collect(),
        text: text.to_string(),
        created_at: projects::now(),
    };
    let mut file = read_file(root);
    file.schema_version = 1;
    file.prompts.push(prompt.clone());
    write(root, &file)?;
    Ok(prompt)
}

/// Removes a prompt. Returns its title, or `None` when no prompt has that id.
pub fn remove(root: &Path, id: &str) -> AppResult<Option<String>> {
    let mut file = read_file(root);
    let Some(pos) = file.prompts.iter().position(|p| p.id == id) else {
        return Ok(None);
    };
    let removed = file.prompts.remove(pos);
    write(root, &file)?;
    Ok(Some(removed.title))
}

fn write(root: &Path, file: &PromptFile) -> AppResult<()> {
    let abs = resolve_internal(root, FILE)?;
    let tmp = abs.with_extension("json.tmp");
    std::fs::write(&tmp, serde_json::to_vec_pretty(file)?)?;
    std::fs::rename(&tmp, &abs)?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn add_list_remove() {
        let d = tempfile::tempdir().unwrap();
        std::fs::create_dir_all(d.path().join(".vault")).unwrap();
        let a = add(d.path(), "First", "text one").unwrap();
        add(d.path(), "Second", "text two").unwrap();
        let titles: Vec<_> = list(d.path()).into_iter().map(|p| p.title).collect();
        assert_eq!(titles, vec!["First", "Second"]);
        assert_eq!(remove(d.path(), &a.id).unwrap().as_deref(), Some("First"));
        assert_eq!(remove(d.path(), "missing").unwrap(), None);
        assert_eq!(list(d.path()).len(), 1);
    }

    #[test]
    fn empty_title_or_text_is_rejected() {
        let d = tempfile::tempdir().unwrap();
        std::fs::create_dir_all(d.path().join(".vault")).unwrap();
        assert!(add(d.path(), "  ", "x").is_err());
        assert!(add(d.path(), "x", "   ").is_err());
    }
}
