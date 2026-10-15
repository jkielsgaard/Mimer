//! Raven: a plain chat with a cloud AI that has **no access to notes**.
//!
//! This module is deliberately small and takes only what a chat needs: the settings (to find the
//! cloud provider) and the messages the user typed. It has no vault, no tools, no mentions and no
//! current note, so there is no path from a note to a cloud provider through it. Notes are only
//! ever sent to local providers (see `ai::router`).

use super::providers::types::{ChatMessage, LlmRequest};
use super::{providers, router, ChatEvent, ChatRole};
use crate::error::{AppError, AppResult};
use crate::settings::{keychain, Settings};
use serde::{Deserialize, Serialize};
use tauri::ipc::Channel;
use tokio_util::sync::CancellationToken;
use ts_rs::TS;

/// Most messages kept in one request, besides the token budget.
const MAX_MESSAGES: usize = 40;

/// What Raven is told about itself. Fixed in code, not editable.
pub const SYSTEM_PROMPT: &str = "You are Raven, a research assistant inside the Mimer note-taking app. \
You help the user find knowledge from the wider world: facts, explanations, comparisons and how-tos.
Rules:
- You have no access to the user's notes or files. Never claim to have read them. If the user wants help with their notes, tell them to ask Mimer, the notes assistant, in the other tab.
- Answer in the language the user writes in.
- Be concise and clear. Prefer plain Markdown.
- When you use knowledge that may have changed or that the user may want to check, say so and give source names or URLs when you know them. Say clearly when you are unsure. Never invent sources.
- If you cannot browse the internet, say so instead of pretending.";

/// One message in a Raven chat. Nothing but the role and the text.
#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct RavenMessage {
    pub role: ChatRole,
    pub content: String,
}

/// A Raven request: the conversation so far, and nothing else.
#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct RavenRequest {
    pub messages: Vec<RavenMessage>,
}

/// Builds the model request: the fixed system prompt, the latest messages that fit in 75% of the
/// context window (tokens estimated as chars / 4, at least the last message), and no tools.
pub fn build_request(messages: &[RavenMessage], context_tokens: u32) -> AppResult<LlmRequest> {
    if messages.last().is_none_or(|m| m.content.trim().is_empty()) {
        return Err(AppError::Provider("Write a message first".into()));
    }
    let budget = (context_tokens as usize * 4) * 3 / 4;
    let mut used = SYSTEM_PROMPT.len();
    let mut kept: Vec<&RavenMessage> = Vec::new();
    for m in messages.iter().rev().take(MAX_MESSAGES) {
        used += m.content.len();
        if used > budget && !kept.is_empty() {
            break;
        }
        kept.push(m);
    }
    kept.reverse();
    let msgs = kept
        .iter()
        .map(|m| match m.role {
            ChatRole::User => ChatMessage::user(m.content.clone()),
            ChatRole::Assistant => ChatMessage::assistant(m.content.clone(), vec![]),
        })
        .collect();
    Ok(LlmRequest {
        system: SYSTEM_PROMPT.to_string(),
        messages: msgs,
        tools: Vec::new(),
        temperature: 0.7,
    })
}

/// Runs one Raven turn, streaming the answer to the channel.
pub async fn run_raven(
    settings: &Settings,
    request: RavenRequest,
    channel: &Channel<ChatEvent>,
    cancel: CancellationToken,
) -> AppResult<()> {
    let provider = router::select_cloud(settings)?;
    let cfg = provider.config().clone();
    let key = keychain::get_key(&cfg.id);
    let llm = build_request(&request.messages, cfg.context_tokens)?;
    let client = providers::http_client()?;
    providers::chat(
        &client,
        &provider,
        key.as_deref(),
        &llm,
        &cancel,
        &mut |t| {
            let _ = channel.send(ChatEvent::TextDelta {
                text: t.to_string(),
            });
        },
    )
    .await?;
    let _ = channel.send(ChatEvent::Done);
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn msg(role: ChatRole, text: &str) -> RavenMessage {
        RavenMessage {
            role,
            content: text.into(),
        }
    }

    #[test]
    fn the_request_has_no_tools_and_says_raven_cannot_see_notes() {
        let r = build_request(&[msg(ChatRole::User, "What is Yggdrasil?")], 8000).unwrap();
        assert!(r.tools.is_empty());
        assert!(r.system.contains("no access to the user's notes"));
        assert_eq!(r.messages.len(), 1);
    }

    #[test]
    fn an_empty_conversation_or_message_is_an_error() {
        assert!(build_request(&[], 8000).is_err());
        assert!(build_request(&[msg(ChatRole::User, "   ")], 8000).is_err());
    }

    #[test]
    fn old_messages_are_dropped_when_the_context_is_small_but_the_last_one_stays() {
        let big = "x".repeat(2_000);
        let history = [
            msg(ChatRole::User, &big),
            msg(ChatRole::Assistant, &big),
            msg(ChatRole::User, "short question"),
        ];
        // 1,500 tokens ≈ 4,500 characters of budget, the system prompt takes about 900.
        let r = build_request(&history, 1_500).unwrap();
        assert_eq!(r.messages.last().unwrap().content, "short question");
        assert!(r.messages.len() < history.len());
        let tiny = build_request(&history, 1).unwrap();
        assert_eq!(tiny.messages.len(), 1, "the last message is always kept");
    }

    #[test]
    fn at_most_forty_messages_are_sent() {
        let many: Vec<RavenMessage> = (0..100)
            .map(|i| msg(ChatRole::User, &i.to_string()))
            .collect();
        let r = build_request(&many, 100_000).unwrap();
        assert_eq!(r.messages.len(), MAX_MESSAGES);
        assert_eq!(r.messages.last().unwrap().content, "99");
    }

    #[test]
    fn a_local_provider_cannot_run_raven() {
        let mut s = Settings::default();
        s.ai.raven_provider_id = Some("lmstudio-default".into());
        assert!(router::select_cloud(&s).is_err());
    }
}
