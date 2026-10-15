//! Local Git repository handling: init, commits, history and restore.

pub mod autosave;
pub mod history;
pub mod repo;

use serde::{Deserialize, Serialize};
use ts_rs::TS;

/// Why a commit is being made; decides the message.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub enum CommitKind {
    Save,
    Autosave,
    AutosaveOnClose,
    Idle,
    SnapshotBeforeAi,
    Ai,
    SnapshotBeforeReload,
    SnapshotBeforeDelete,
    SnapshotBeforeRename,
    SnapshotBeforeRestore,
    SnapshotBeforeImport,
    Rename,
    Delete,
    Restore,
    Project,
    Recovered,
    Initial,
    Prompts,
    Template,
    VaultSettings,
    Import,
    Index,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct CommitReason {
    pub kind: CommitKind,
    pub detail: Option<String>,
}

impl CommitReason {
    /// A reason for a commit, with optional detail (usually a path).
    pub fn new(kind: CommitKind, detail: impl Into<Option<String>>) -> Self {
        Self {
            kind,
            detail: detail.into(),
        }
    }

    /// The commit message required by the spec for this reason.
    pub fn message(&self) -> String {
        let d = self.detail.as_deref().unwrap_or("");
        let with = |prefix: &str| {
            if d.is_empty() {
                prefix.to_string()
            } else {
                format!("{prefix}: {d}")
            }
        };
        let plain = |prefix: &str| {
            if d.is_empty() {
                prefix.to_string()
            } else {
                format!("{prefix} {d}")
            }
        };
        match self.kind {
            CommitKind::Save => with("Save"),
            CommitKind::Autosave => with("Autosave"),
            CommitKind::AutosaveOnClose => "Autosave on close".into(),
            CommitKind::Idle => "Autosave".into(),
            CommitKind::SnapshotBeforeAi => with("Snapshot before AI"),
            CommitKind::Ai => with("AI"),
            CommitKind::SnapshotBeforeReload => with("Snapshot before reload"),
            CommitKind::SnapshotBeforeDelete => with("Snapshot before delete"),
            CommitKind::SnapshotBeforeRename => with("Snapshot before rename"),
            CommitKind::SnapshotBeforeRestore => with("Snapshot before restore"),
            CommitKind::SnapshotBeforeImport => with("Snapshot before import"),
            CommitKind::Rename => plain("Rename"),
            CommitKind::Delete => plain("Delete"),
            CommitKind::Restore => plain("Restore"),
            CommitKind::Project => with("Project"),
            CommitKind::Recovered => "Recovered uncommitted changes".into(),
            CommitKind::Initial => "Initialize vault".into(),
            CommitKind::Prompts => with("Prompts"),
            CommitKind::Template => with("Template"),
            CommitKind::VaultSettings => "Vault settings updated".into(),
            CommitKind::Import => with("Import"),
            CommitKind::Index => with("Index"),
        }
    }
}

/// One commit touching a file.
#[derive(Debug, Clone, Serialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct CommitEntry {
    pub sha: String,
    pub short_sha: String,
    pub message: String,
    /// Commit time, seconds since the epoch.
    #[ts(type = "number")]
    pub time: i64,
    /// The file's path at that commit (differs from the current path after renames).
    pub path: String,
}

/// A file that existed in history but not in `HEAD`.
#[derive(Debug, Clone, Serialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct DeletedFile {
    pub path: String,
    /// Last commit that contained the file.
    pub sha: String,
    pub short_sha: String,
    pub message: String,
    #[ts(type = "number")]
    pub time: i64,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn commit_messages_match_the_spec() {
        let m = |k, d: &str| CommitReason::new(k, Some(d.to_string())).message();
        assert_eq!(m(CommitKind::Save, "a.md"), "Save: a.md");
        assert_eq!(m(CommitKind::Autosave, "a.md"), "Autosave: a.md");
        assert_eq!(
            CommitReason::new(CommitKind::AutosaveOnClose, None).message(),
            "Autosave on close"
        );
        assert_eq!(
            CommitReason::new(CommitKind::Idle, None).message(),
            "Autosave"
        );
        assert_eq!(
            m(CommitKind::SnapshotBeforeAi, "x"),
            "Snapshot before AI: x"
        );
        assert_eq!(m(CommitKind::Ai, "x"), "AI: x");
        assert_eq!(
            m(CommitKind::SnapshotBeforeReload, "a.md"),
            "Snapshot before reload: a.md"
        );
        assert_eq!(m(CommitKind::Rename, "a → b"), "Rename a → b");
        assert_eq!(m(CommitKind::Delete, "a.md"), "Delete a.md");
        assert_eq!(
            m(CommitKind::Restore, "a.md to abc1234"),
            "Restore a.md to abc1234"
        );
        assert_eq!(m(CommitKind::Project, "P updated"), "Project: P updated");
        assert_eq!(
            CommitReason::new(CommitKind::Recovered, None).message(),
            "Recovered uncommitted changes"
        );
    }
}
