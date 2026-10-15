//! Inline commands on selected text (no tools).

use super::providers;
use super::providers::types::{ChatMessage, LlmRequest};
use super::{router, ChatEvent, InlineCommand, InlineRequest};
use crate::error::AppResult;
use crate::projects;
use crate::settings::keychain;
use crate::state::AppState;
use tauri::ipc::Channel;
use tauri::{AppHandle, Manager};
use tokio_util::sync::CancellationToken;

const ONLY_REPLACEMENT: &str = "Return ONLY the replacement text. No explanations, no preamble, no code fences, no surrounding quotes.";

fn task(req: &InlineRequest) -> String {
    let custom = req.instruction.as_deref().unwrap_or("").trim().to_string();
    match req.command {
        InlineCommand::FixSpelling => "Fix spelling and grammar mistakes in the text. Do not change the meaning, tone or Markdown formatting.".into(),
        InlineCommand::Rewrite => "Rewrite the text to be clearer and easier to read. Keep the meaning and the Markdown formatting.".into(),
        InlineCommand::Shorten => "Shorten the text while keeping its key information. Keep the Markdown formatting.".into(),
        InlineCommand::Expand => "Expand the text with more detail and explanation. Keep the Markdown formatting.".into(),
        InlineCommand::RestructureList => "Restructure the text as a clear Markdown list. Keep all information.".into(),
        InlineCommand::Custom => format!("Apply this instruction to the text: {custom}"),
        InlineCommand::RefineInstructions => String::new(),
    }
}

/// Builds the system prompt and the single user message for an inline request.
pub fn build_messages(
    req: &InlineRequest,
    global: &str,
    project: Option<&projects::Project>,
) -> (String, ChatMessage) {
    if req.command == InlineCommand::RefineInstructions {
        let system = "You edit the instructions given to an AI writing assistant in a Markdown notes app. \
            Apply the requested change to the current instructions and return the complete new instructions. \
            Return ONLY the new instruction text, no explanations and no code fences."
            .to_string();
        let user = format!(
            "Current instructions:\n{}\n\nRequested change: {}",
            if req.text.trim().is_empty() {
                "(none yet)"
            } else {
                req.text.as_str()
            },
            req.instruction.as_deref().unwrap_or("")
        );
        return (system, ChatMessage::user(user));
    }
    let mut system = format!(
        "You are the writing assistant inside Mimer, a Markdown note-taking app. The user sends text; you transform it.\nTask: {}\n{ONLY_REPLACEMENT}\nAnswer in the language of the text.",
        task(req)
    );
    if !global.trim().is_empty() {
        system.push_str(&format!(
            "\n\n## User's global instructions\n{}",
            global.trim()
        ));
    }
    if let Some(p) = project.filter(|p| !p.instructions.trim().is_empty()) {
        system.push_str(&format!(
            "\n\n## Project instructions ({})\n{}",
            p.name,
            p.instructions.trim()
        ));
    }
    (system, ChatMessage::user(req.text.clone()))
}

/// Runs an inline command, streaming the replacement text.
pub async fn run_inline(
    app: &AppHandle,
    req: InlineRequest,
    channel: &Channel<ChatEvent>,
    cancel: CancellationToken,
) -> AppResult<()> {
    let state = app.state::<AppState>();
    let settings = state.settings_snapshot();
    let project = match (state.current_vault(), req.note_path.as_deref()) {
        (Ok(v), Some(p)) => projects::for_path(&v.project_list(), p).cloned(),
        _ => None,
    };
    let provider = if req.provider_id.is_some() || req.local_only.is_some() {
        router::select_provider(
            &settings,
            req.provider_id.as_deref(),
            req.local_only.unwrap_or(false),
        )?
    } else {
        router::select_for_project(&settings, project.as_ref())?
    };
    let key = keychain::get_key(&provider.config().id);
    let (system, user) = build_messages(&req, &settings.ai.global_instructions, project.as_ref());
    let llm = LlmRequest {
        system,
        messages: vec![user],
        tools: vec![],
        temperature: 0.3,
    };
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

    fn req(command: InlineCommand, instruction: Option<&str>) -> InlineRequest {
        InlineRequest {
            command,
            instruction: instruction.map(str::to_string),
            text: "hello wrld".into(),
            note_path: None,
            provider_id: None,
            local_only: None,
        }
    }

    #[test]
    fn prompts_demand_only_replacement_text() {
        for c in [
            InlineCommand::FixSpelling,
            InlineCommand::Rewrite,
            InlineCommand::Shorten,
            InlineCommand::Expand,
            InlineCommand::RestructureList,
        ] {
            let (sys, user) = build_messages(&req(c, None), "", None);
            assert!(sys.contains("Return ONLY the replacement text"));
            assert_eq!(user.content, "hello wrld");
        }
        let (sys, _) = build_messages(&req(InlineCommand::Custom, Some("make it rhyme")), "", None);
        assert!(sys.contains("make it rhyme"));
    }

    #[test]
    fn refine_instructions_includes_current_text() {
        let (_, user) = build_messages(
            &req(InlineCommand::RefineInstructions, Some("stricter")),
            "",
            None,
        );
        assert!(user.content.contains("hello wrld") && user.content.contains("stricter"));
    }
}
