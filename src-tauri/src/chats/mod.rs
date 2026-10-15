//! Persisted chat history: one JSON file per chat in `.vault/chats/`. Never committed to Git.

use crate::ai::ChatRole;
use crate::error::{AppError, AppResult};
use crate::projects;
use crate::vault::paths::resolve_internal;
use serde::{Deserialize, Serialize};
use std::path::Path;
use ts_rs::TS;
use uuid::Uuid;

const DIR: &str = ".vault/chats";
const MAX_BYTES: usize = 5 * 1024 * 1024;
const TITLE_CHARS: usize = 60;

/// One message as stored on disk.
#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct StoredMessage {
    pub id: u32,
    pub role: ChatRole,
    pub content: String,
    pub activity: Vec<String>,
    pub error: Option<String>,
    /// Notes the user attached to this message (older chats have none).
    #[serde(default)]
    pub mentions: Vec<String>,
    /// Prompts for a cloud AI that Mimer wrote in this answer (older chats have none).
    #[serde(default)]
    pub research: Vec<crate::research::ResearchCard>,
}

/// A whole chat as stored on disk.
#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct StoredChat {
    pub schema_version: u32,
    pub id: String,
    pub title: String,
    pub project_id: Option<String>,
    pub created_at: String,
    pub updated_at: String,
    pub messages: Vec<StoredMessage>,
}

/// Short description of a chat for the History menu.
#[derive(Debug, Clone, Serialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct ChatSummary {
    pub id: String,
    pub title: String,
    pub project_id: Option<String>,
    pub updated_at: String,
    pub message_count: u32,
}

/// Rejects anything that is not a UUID, so chat ids can never escape the chats folder.
pub fn validate_id(id: &str) -> AppResult<()> {
    Uuid::parse_str(id)
        .map(|_| ())
        .map_err(|_| AppError::InvalidPath("Invalid chat id".into()))
}

fn file_rel(id: &str) -> String {
    format!("{DIR}/{id}.json")
}

fn read_chat(path: &Path) -> Option<StoredChat> {
    let text = std::fs::read_to_string(path).ok()?;
    serde_json::from_str(&text).ok()
}

/// Saves a chat. Keeps the original `created_at`, fills an empty title from the first user
/// message, and sets `updated_at` to now.
pub fn save(root: &Path, mut chat: StoredChat) -> AppResult<StoredChat> {
    validate_id(&chat.id)?;
    if chat.messages.is_empty() {
        return Err(AppError::InvalidPath("The chat has no messages".into()));
    }
    let abs = resolve_internal(root, &file_rel(&chat.id))?;
    let now = projects::now();
    chat.created_at = match read_chat(&abs) {
        Some(existing) => existing.created_at,
        None if chat.created_at.is_empty() => now.clone(),
        None => chat.created_at.clone(),
    };
    if chat.title.trim().is_empty() {
        chat.title = chat
            .messages
            .iter()
            .find(|m| matches!(m.role, ChatRole::User))
            .map(|m| m.content.trim().chars().take(TITLE_CHARS).collect())
            .unwrap_or_else(|| "Chat".into());
    }
    chat.updated_at = now;
    chat.schema_version = 1;
    let bytes = serde_json::to_vec_pretty(&chat)?;
    if bytes.len() > MAX_BYTES {
        return Err(AppError::Io("This chat is too large to save".into()));
    }
    if let Some(dir) = abs.parent() {
        std::fs::create_dir_all(dir)?;
    }
    let tmp = abs.with_extension("json.tmp");
    std::fs::write(&tmp, &bytes)?;
    std::fs::rename(&tmp, &abs)?;
    Ok(chat)
}

/// Loads one chat.
pub fn load(root: &Path, id: &str) -> AppResult<StoredChat> {
    validate_id(id)?;
    let abs = resolve_internal(root, &file_rel(id))?;
    read_chat(&abs).ok_or_else(|| AppError::NotFound("Chat not found".into()))
}

/// Lists all chats, newest first. Unreadable files are skipped.
pub fn list(root: &Path) -> Vec<ChatSummary> {
    let Ok(read) = std::fs::read_dir(root.join(DIR)) else {
        return Vec::new();
    };
    let mut out: Vec<ChatSummary> = read
        .flatten()
        .filter(|e| e.path().extension().is_some_and(|x| x == "json"))
        .filter_map(|e| read_chat(&e.path()))
        .map(|c| ChatSummary {
            message_count: u32::try_from(c.messages.len()).unwrap_or(u32::MAX),
            id: c.id,
            title: c.title,
            project_id: c.project_id,
            updated_at: c.updated_at,
        })
        .collect();
    out.sort_by(|a, b| b.updated_at.cmp(&a.updated_at));
    out
}

/// Deletes one chat. A missing chat is not an error.
pub fn delete(root: &Path, id: &str) -> AppResult<()> {
    validate_id(id)?;
    let abs = resolve_internal(root, &file_rel(id))?;
    match std::fs::remove_file(abs) {
        Ok(()) => Ok(()),
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(()),
        Err(e) => Err(e.into()),
    }
}

/// Deletes every chat and returns how many were removed.
pub fn delete_all(root: &Path) -> AppResult<u32> {
    let Ok(read) = std::fs::read_dir(root.join(DIR)) else {
        return Ok(0);
    };
    let mut n = 0;
    for e in read.flatten() {
        let p = e.path();
        if p.extension().is_some_and(|x| x == "json") {
            std::fs::remove_file(&p)?;
            n += 1;
        }
    }
    Ok(n)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn msg(id: u32, role: ChatRole, content: &str) -> StoredMessage {
        StoredMessage {
            id,
            role,
            content: content.into(),
            activity: vec![],
            error: None,
            mentions: vec![],
            research: vec![],
        }
    }

    fn chat(id: &str, messages: Vec<StoredMessage>) -> StoredChat {
        StoredChat {
            schema_version: 1,
            id: id.into(),
            title: String::new(),
            project_id: None,
            created_at: String::new(),
            updated_at: String::new(),
            messages,
        }
    }

    const ID: &str = "3f6c1e2a-1111-4222-8333-444455556666";

    #[test]
    fn save_and_load_round_trip() {
        let d = tempfile::tempdir().unwrap();
        let saved = save(
            d.path(),
            chat(ID, vec![msg(1, ChatRole::User, "Hello there")]),
        )
        .unwrap();
        let back = load(d.path(), ID).unwrap();
        assert_eq!(back.messages.len(), 1);
        assert_eq!(back.title, "Hello there");
        assert_eq!(back.updated_at, saved.updated_at);
        assert!(!back.created_at.is_empty());
    }

    #[test]
    fn created_at_is_kept_on_resave() {
        let d = tempfile::tempdir().unwrap();
        let first = save(d.path(), chat(ID, vec![msg(1, ChatRole::User, "a")])).unwrap();
        let mut c = chat(
            ID,
            vec![
                msg(1, ChatRole::User, "a"),
                msg(2, ChatRole::Assistant, "b"),
            ],
        );
        c.created_at = "1999-01-01T00:00:00Z".into();
        let second = save(d.path(), c).unwrap();
        assert_eq!(second.created_at, first.created_at);
    }

    #[test]
    fn title_is_truncated_to_60_chars() {
        let d = tempfile::tempdir().unwrap();
        let long = "x".repeat(100);
        let saved = save(d.path(), chat(ID, vec![msg(1, ChatRole::User, &long)])).unwrap();
        assert_eq!(saved.title.chars().count(), 60);
    }

    #[test]
    fn list_is_sorted_and_skips_corrupt_files() {
        let d = tempfile::tempdir().unwrap();
        let other = "9f6c1e2a-1111-4222-8333-444455556666";
        save(d.path(), chat(ID, vec![msg(1, ChatRole::User, "old")])).unwrap();
        std::thread::sleep(std::time::Duration::from_millis(5));
        save(d.path(), chat(other, vec![msg(1, ChatRole::User, "new")])).unwrap();
        std::fs::write(d.path().join(DIR).join("broken.json"), "{not json").unwrap();
        let list = list(d.path());
        assert_eq!(list.len(), 2);
        assert_eq!(list[0].title, "new");
        assert_eq!(list[0].message_count, 1);
    }

    #[test]
    fn invalid_ids_are_rejected() {
        let d = tempfile::tempdir().unwrap();
        for id in ["../x", "a/b", "", "not-a-uuid"] {
            assert!(
                save(d.path(), chat(id, vec![msg(1, ChatRole::User, "x")])).is_err(),
                "{id}"
            );
            assert!(load(d.path(), id).is_err(), "{id}");
            assert!(delete(d.path(), id).is_err(), "{id}");
        }
    }

    #[test]
    fn empty_chat_is_rejected() {
        let d = tempfile::tempdir().unwrap();
        assert!(save(d.path(), chat(ID, vec![])).is_err());
    }

    #[test]
    fn delete_and_delete_all() {
        let d = tempfile::tempdir().unwrap();
        let other = "9f6c1e2a-1111-4222-8333-444455556666";
        save(d.path(), chat(ID, vec![msg(1, ChatRole::User, "a")])).unwrap();
        save(d.path(), chat(other, vec![msg(1, ChatRole::User, "b")])).unwrap();
        delete(d.path(), ID).unwrap();
        delete(d.path(), ID).unwrap(); // second delete is fine
        assert_eq!(delete_all(d.path()).unwrap(), 1);
        assert!(list(d.path()).is_empty());
    }

    #[test]
    fn old_messages_without_mentions_still_load_and_new_ones_round_trip() {
        let old: StoredMessage = serde_json::from_str(
            r#"{"id":1,"role":"user","content":"hi","activity":[],"error":null}"#,
        )
        .unwrap();
        assert!(old.mentions.is_empty());

        let d = tempfile::tempdir().unwrap();
        let mut m = msg(1, ChatRole::User, "merge these");
        m.mentions = vec!["Work/Plan.md".into(), "Home.md".into()];
        save(d.path(), chat(ID, vec![m])).unwrap();
        let loaded = load(d.path(), ID).unwrap();
        assert_eq!(loaded.messages[0].mentions, vec!["Work/Plan.md", "Home.md"]);
    }
}
