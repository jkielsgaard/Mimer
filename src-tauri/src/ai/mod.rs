//! AI assistant: providers, routing, prompts, tools, agent loop and proposals.

pub mod agent;
pub mod checks;
pub mod clean;
pub mod inline;
pub mod mentions;
pub mod prompt;
pub mod proposals;
pub mod providers;
pub mod router;
pub mod skill_run;
pub mod tools;

use crate::error::AppError;
use serde::{Deserialize, Serialize};
use ts_rs::TS;
use uuid::Uuid;

/// Events streamed to the frontend through a Tauri `Channel`.
#[derive(Debug, Clone, Serialize, TS)]
#[serde(
    tag = "type",
    rename_all = "camelCase",
    rename_all_fields = "camelCase"
)]
#[ts(export)]
pub enum ChatEvent {
    TextDelta {
        text: String,
    },
    /// Sent before each model call of a turn; `step` counts from 1.
    Step {
        step: u32,
        max: u32,
    },
    /// Sent before a tool runs, for example "Reading Work/Plan.md". Never contains note content.
    ToolStart {
        name: String,
        detail: String,
    },
    /// Shown as "Searching notes…".
    ToolCall {
        name: String,
        summary: String,
    },
    ProposalsReady {
        set_id: Uuid,
    },
    /// A long skill run did its first notes only; the rest waits for the user to say go on.
    SkillTrial {
        skill_id: String,
        skill_name: String,
        /// Notes done in the trial.
        done: u32,
        /// Notes in the whole run.
        total: u32,
        /// The notes still to do, sent back to continue the run.
        rest: Vec<RunTarget>,
        /// Folders a sort skill has chosen so far, so the rest reuses them.
        folders: Vec<String>,
        /// The extra instructions the user typed, so the rest follows them too.
        skill_input: Option<String>,
        /// The note or folder the run started from, which decides its project.
        anchor: Option<String>,
    },
    Done,
    Error {
        error: AppError,
    },
}

/// One note of a skill run and the folder it is sorted inside.
#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct RunTarget {
    pub path: String,
    pub base: String,
}

/// Continues a skill run after its trial: exactly these notes, with the folders chosen so far.
#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct SkillContinue {
    pub targets: Vec<RunTarget>,
    #[serde(default)]
    pub folders: Vec<String>,
    /// The extra instructions of the first part of the run.
    #[serde(default)]
    pub skill_input: Option<String>,
    /// The note or folder the run started from; its project is used again.
    #[serde(default)]
    pub anchor: Option<String>,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, TS)]
#[serde(rename_all = "lowercase")]
#[ts(export)]
pub enum ChatRole {
    User,
    Assistant,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct ChatMessageIn {
    pub role: ChatRole,
    pub content: String,
    /// What Mimer did in that turn ("Proposed new note …"), so a later message such as "now
    /// delete the old ones" can refer to it. Empty for user messages.
    #[serde(default)]
    pub activity: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct ChatRequest {
    pub messages: Vec<ChatMessageIn>,
    pub include_current_note: bool,
    /// The open note, if any.
    pub note_path: Option<String>,
    /// The selected folder when no note is open.
    pub folder: Option<String>,
    pub selection: Option<String>,
    /// Notes attached with the `/` picker (vault-relative paths; checked in `ai::mentions`).
    #[serde(default)]
    pub mentions: Vec<String>,
    /// The skill to run (see `crate::skills`); `None` for an ordinary chat message.
    #[serde(default)]
    pub skill: Option<String>,
    /// What the user typed next to the skill: extra instructions for this run.
    #[serde(default)]
    pub skill_input: Option<String>,
    /// Set when the user continues a skill run after its trial.
    #[serde(default)]
    pub skill_continue: Option<SkillContinue>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub enum InlineCommand {
    FixSpelling,
    Rewrite,
    Shorten,
    Expand,
    RestructureList,
    Custom,
    /// Used by the project dialog's "Ask AI" button.
    RefineInstructions,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct InlineRequest {
    pub command: InlineCommand,
    /// Free-text instruction for `custom` and `refineInstructions`.
    pub instruction: Option<String>,
    /// The selected text (or the current project instructions).
    pub text: String,
    pub note_path: Option<String>,
    /// Overrides for the project dialog (unsaved project settings).
    pub provider_id: Option<String>,
}
