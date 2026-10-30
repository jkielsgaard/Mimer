//! Inline commands on selected text (no tools).

use super::clean;
use super::providers;
use super::providers::types::{ChatMessage, LlmRequest};
use super::{router, ChatEvent, InlineCommand, InlineRequest};
use crate::error::{AppError, AppResult};
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
        InlineCommand::FixSpelling => "Fix spelling and grammar mistakes in the text, in the language the text is written in (it can be Danish, English or another language). Do not change the meaning, tone or Markdown formatting.".into(),
        InlineCommand::Rewrite => "Rewrite the text to be clearer and easier to read. Keep the meaning and the Markdown formatting.".into(),
        InlineCommand::Shorten => "Shorten the text while keeping its key information. Keep the Markdown formatting.".into(),
        InlineCommand::Expand => "Expand the text with more detail and explanation. Keep the Markdown formatting.".into(),
        InlineCommand::RestructureList => "Restructure the text as a clear Markdown list. Keep all information.".into(),
        InlineCommand::Custom => format!("Apply this instruction to the text: {custom}"),
    }
}

/// Which language to answer in. A custom task (such as Translate to English) may name another
/// language, and then the task wins: "answer in the language of the text" made small models
/// return the text untranslated.
fn language_rule(req: &InlineRequest, answer_language: &str) -> String {
    let chosen = answer_language.trim();
    // A custom instruction may ask for another language (a translation), so it decides.
    if !chosen.is_empty() && req.command != InlineCommand::Custom {
        return format!("Answer in {chosen}.");
    }
    if req.command == InlineCommand::Custom {
        "Write in the language the task asks for. If it names none, keep the language of the text."
            .into()
    } else {
        "Answer in the language of the text.".into()
    }
}

/// Builds the system prompt and the single user message for an inline request. A fixed command
/// does one thing, so it gets its task, the language rule and nothing else: not the "About me"
/// text and not the project's. `small` is for a small model (Phi Silica): one short message with
/// the task first and the text last.
pub fn build_messages(
    req: &InlineRequest,
    answer_language: &str,
    small: bool,
) -> (String, ChatMessage) {
    if small {
        let user = format!(
            "{}\n{}\n{ONLY_REPLACEMENT}\n\nText:\n{}",
            task(req),
            language_rule(req, answer_language),
            req.text
        );
        return (String::new(), ChatMessage::user(user));
    }
    let system = format!(
        "You are the writing assistant inside Mimer, a Markdown note-taking app. The user sends text; you transform it.\n{ONLY_REPLACEMENT}\n{}\nTask: {}",
        language_rule(req, answer_language),
        task(req)
    );
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
    // Inline commands read notes, so the router decides (local, or the cloud AI the user turned
    // on). The provider override comes from the project dialog and is checked here, not in the UI.
    let provider = router::select_notes(&settings, project.as_ref(), req.provider_id.as_deref())?;
    // The built-in AI must be awake (loaded) before anything is sent to it.
    crate::engine::service::require_awake(&state, provider.config())?;
    crate::foundry::service::require_awake(&state, provider.config())?;
    crate::engine::service::touch(&state);
    crate::foundry::service::touch(&state);
    let key = keychain::get_key(&provider.config().id);
    let small = provider.config().kind == crate::settings::ProviderKind::PhiSilica;
    let (system, user) = build_messages(&req, &settings.ai.answer_language, small);
    let llm = LlmRequest {
        system,
        messages: vec![user],
        tools: vec![],
        temperature: 0.3,
    };
    let client = providers::http_client()?;
    let may_shrink = matches!(
        req.command,
        InlineCommand::Shorten | InlineCommand::RestructureList | InlineCommand::Custom
    );
    let check = settings.ai.check_answers;
    // The whole answer is read before anything is shown, so reasoning and lead-ins never reach
    // the note, and an answer that cannot be used is tried once more instead of being offered.
    let mut last = String::from("the model did not give a usable answer");
    for _ in 0..2 {
        let resp = providers::chat(
            &client,
            &provider,
            key.as_deref(),
            &llm,
            &cancel,
            &mut |_| {},
        )
        .await?;
        let answer = clean::clean_replacement(&resp.text);
        if let Err(why) = clean::usable_replacement(&req.text, &answer, may_shrink) {
            last = why;
            continue;
        }
        if check && !self_check(&client, &provider, key.as_deref(), &cancel, &req, &answer).await? {
            last = "the answer did not pass the AI's own check".into();
            continue;
        }
        let _ = channel.send(ChatEvent::TextDelta { text: answer });
        let _ = channel.send(ChatEvent::Done);
        return Ok(());
    }
    Err(AppError::Provider(format!(
        "The AI did not give a usable answer ({last}). Try again, or choose a larger model in Settings."
    )))
}

/// Asks the model whether its own answer is only the finished text, with the same meaning.
/// An unclear reply counts as a pass, so the check can only stop an answer it clearly rejects.
async fn self_check(
    client: &reqwest::Client,
    provider: &impl router::Approved,
    key: Option<&str>,
    cancel: &CancellationToken,
    req: &InlineRequest,
    answer: &str,
) -> AppResult<bool> {
    let llm = LlmRequest {
        system: "You check the work of a text editor. You get an ORIGINAL text, the task, and a \
            PROPOSED replacement. Answer YES if the proposed text is only the finished text \
            (no explanations, no reasoning, nothing left out that the task did not ask to remove) \
            and does what the task asked. Otherwise answer NO. Answer with YES or NO only."
            .into(),
        messages: vec![ChatMessage::user(format!(
            "Task: {}\n\nORIGINAL:\n{}\n\nPROPOSED:\n{}",
            task(req),
            req.text,
            answer
        ))],
        tools: vec![],
        temperature: 0.0,
    };
    let resp = providers::chat(client, provider, key, &llm, cancel, &mut |_| {}).await?;
    Ok(!resp.text.trim().to_uppercase().starts_with("NO"))
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
            let (sys, user) = build_messages(&req(c, None), "", false);
            assert!(sys.contains("Return ONLY the replacement text"));
            assert_eq!(user.content, "hello wrld");
        }
        let (sys, _) = build_messages(
            &req(InlineCommand::Custom, Some("make it rhyme")),
            "",
            false,
        );
        assert!(sys.contains("make it rhyme"));
    }

    #[test]
    fn a_translation_is_not_told_to_keep_the_language_of_the_text() {
        let translate = "Translate the text into English.";
        let (sys, _) = build_messages(&req(InlineCommand::Custom, Some(translate)), "", false);
        assert!(!sys.contains("Answer in the language of the text"), "{sys}");
        assert!(sys.ends_with(&format!(
            "Task: Apply this instruction to the text: {translate}"
        )));
        let (sys, _) = build_messages(&req(InlineCommand::FixSpelling, None), "", false);
        assert!(sys.contains("Answer in the language of the text"));
    }

    #[test]
    fn a_small_model_gets_one_short_message_with_the_text_last() {
        let (sys, user) = build_messages(
            &req(
                InlineCommand::Custom,
                Some("Translate the text into English."),
            ),
            "Danish",
            true,
        );
        assert!(sys.is_empty());
        assert!(user
            .content
            .starts_with("Apply this instruction to the text: Translate"));
        assert!(user.content.ends_with("Text:\nhello wrld"));
    }

    #[test]
    fn the_chosen_answer_language_applies_to_fixed_commands_but_not_to_a_custom_one() {
        let (sys, _) = build_messages(&req(InlineCommand::Rewrite, None), "Danish", false);
        assert!(sys.contains("Answer in Danish."));
        assert!(!sys.contains("Answer in the language of the text"));
        let (sys, _) = build_messages(
            &req(InlineCommand::Custom, Some("Translate it into English.")),
            "Danish",
            false,
        );
        assert!(!sys.contains("Answer in Danish"), "{sys}");
    }

    #[test]
    fn no_instruction_text_reaches_a_fixed_command() {
        let (sys, user) = build_messages(&req(InlineCommand::Shorten, None), "", false);
        assert!(!sys.contains("global instructions") && !sys.contains("About the user"));
        assert_eq!(user.content, "hello wrld");
    }
}
