//! The chat agent loop: send → run tool calls → append results → repeat.

use super::proposals::ProposalSet;
use super::providers;
use super::providers::types::{ChatMessage, LlmRequest};
use super::{mentions, prompt, router, tools, ChatEvent, ChatMessageIn, ChatRequest, ChatRole};
use crate::error::AppResult;
use crate::projects;
use crate::settings::keychain;
use crate::state::AppState;
use crate::vault::fs_ops;
use tauri::ipc::Channel;
use tauri::{AppHandle, Manager};
use tokio_util::sync::CancellationToken;

/// Maximum agent iterations per turn.
pub const MAX_ITERATIONS: usize = 15;

/// Lower than for plain chat: choosing tools and writing their arguments needs steady answers,
/// and small local models drift into repeating themselves when it is higher.
const AGENT_TEMPERATURE: f32 = 0.3;

/// Most times in one turn that a list of moves written as text is turned into a tool call.
const MAX_RESCUES: usize = 3;

fn convert(m: &ChatMessageIn) -> ChatMessage {
    match m.role {
        ChatRole::User => ChatMessage::user(m.content.clone()),
        ChatRole::Assistant => {
            ChatMessage::assistant(with_activity(&m.content, &m.activity), vec![])
        }
    }
}

/// An earlier answer followed by a short list of what Mimer did in that turn, because tool calls
/// are not part of the history. Without it Mimer cannot tell later which notes it already
/// created, merged or proposed to delete.
fn with_activity(content: &str, activity: &[String]) -> String {
    if activity.is_empty() {
        return content.to_string();
    }
    let list = activity
        .iter()
        .map(|a| format!("- {a}"))
        .collect::<Vec<_>>()
        .join("\n");
    format!("{content}\n\n[What you did in that turn:\n{list}]")
}

/// Runs one chat turn, streaming events to the channel.
pub async fn run_chat(
    app: &AppHandle,
    req: ChatRequest,
    channel: &Channel<ChatEvent>,
    cancel: CancellationToken,
) -> AppResult<()> {
    let state = app.state::<AppState>();
    let vault = state.current_vault()?;
    let settings = state.settings_snapshot();
    let all_projects = vault.project_list();
    let anchor = req.note_path.as_deref().or(req.folder.as_deref());
    let project = anchor
        .and_then(|a| projects::for_path(&all_projects, a))
        .cloned();
    // Notes only go to a local provider; a cloud provider is refused here.
    let provider = router::select_for_project(&settings, project.as_ref())?;
    let cfg = provider.config().clone();
    // The built-in AI must be awake (loaded) before anything is sent to it.
    crate::engine::service::require_awake(&state, &cfg)?;
    crate::foundry::service::require_awake(&state, &cfg)?;
    crate::engine::service::touch(&state);
    crate::foundry::service::touch(&state);
    let key = keychain::get_key(&cfg.id);
    let scope = project.as_ref().map(|p| p.folder.clone());

    let note = if req.include_current_note {
        match req.note_path.as_deref() {
            Some(p) => fs_ops::read_note(&vault.root, p)
                .ok()
                .map(|n| (n.path, n.content)),
            None => None,
        }
    } else {
        None
    };
    let attached = mentions::load(
        &vault.root,
        scope.as_deref(),
        &req.mentions,
        req.note_path.as_deref(),
    );
    for line in &attached.skipped {
        let _ = channel.send(ChatEvent::ToolCall {
            name: "attach".into(),
            summary: line.clone(),
        });
    }
    // An attached note replaces "include current note" for the same file.
    let note = if attached.includes_current {
        None
    } else {
        note
    };
    let tools_enabled = cfg.supports_tools;
    let tool_defs = if tools_enabled {
        tools::definitions()
    } else {
        Vec::new()
    };
    let mut msgs: Vec<ChatMessage> = req.messages.iter().map(convert).collect();
    // Semantic search is offered only when the rules allow it (see embeddings::semantic_allowed).
    let indexed = crate::embeddings::counts(&vault, &settings.ai.embeddings.model).1;
    let semantic_ok = tools_enabled && crate::embeddings::semantic_allowed(&settings, indexed);
    let mut tool_defs = tool_defs;
    if semantic_ok {
        tool_defs.push(tools::semantic_search_definition());
    }
    let mut set = ProposalSet::new(scope.clone());
    let mut rescued = 0usize;
    let client = providers::http_client()?;

    for iteration in 0..MAX_ITERATIONS {
        if cancel.is_cancelled() {
            break;
        }
        let _ = channel.send(ChatEvent::Step {
            step: u32::try_from(iteration + 1).unwrap_or(u32::MAX),
            max: u32::try_from(MAX_ITERATIONS).unwrap_or(u32::MAX),
        });
        let input = prompt::PromptInput {
            base_instruction: &settings.ai.base_instruction,
            allow_own_knowledge: settings.ai.allow_own_knowledge,
            global_instructions: &settings.ai.global_instructions,
            project: project.as_ref(),
            scope: scope.as_deref(),
            note: note.as_ref().map(|(p, c)| (p.as_str(), c.as_str())),
            mentions: &attached.notes,
            selection: req.selection.as_deref(),
            tools_enabled,
        };
        let (system, fitted) = prompt::assemble(&input, msgs.clone(), cfg.context_tokens);
        let llm = LlmRequest {
            system,
            messages: fitted,
            tools: tool_defs.clone(),
            temperature: AGENT_TEMPERATURE,
        };
        let resp = providers::chat(
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
        let mut calls = resp.tool_calls.clone();
        // Small models sometimes write the list of moves as text instead of calling the tool.
        // The moves are only proposals, so they are queued for review just the same.
        if calls.is_empty() && rescued < MAX_RESCUES && !cancel.is_cancelled() {
            if let Some(call) = tools::rescue_moves(&resp.text, rescued) {
                rescued += 1;
                calls.push(call);
            }
        }
        if calls.is_empty() || cancel.is_cancelled() {
            break;
        }
        msgs.push(ChatMessage::assistant(resp.text.clone(), calls.clone()));
        for call in &calls {
            let _ = channel.send(ChatEvent::ToolStart {
                name: call.name.clone(),
                detail: tools::describe_call(call),
            });
            let out = if call.name == "semantic_search" {
                semantic_tool(&vault, &settings, semantic_ok, scope.as_deref(), call).await
            } else {
                tools::execute(&vault, scope.as_deref(), &mut set, call)
            };
            if call.name == "write_research_prompt" {
                if let Ok(card) = tools::research_card(call) {
                    let _ = channel.send(ChatEvent::ResearchPrompt {
                        title: card.title,
                        text: card.text,
                    });
                }
            }
            let _ = channel.send(ChatEvent::ToolCall {
                name: call.name.clone(),
                summary: out.summary,
            });
            msgs.push(ChatMessage::tool_result(call.id.clone(), out.result));
        }
        if iteration + 1 == MAX_ITERATIONS {
            let _ = channel.send(ChatEvent::TextDelta {
                text: format!("\n\n_Stopped after {MAX_ITERATIONS} tool iterations._"),
            });
        }
    }

    if !set.proposals.is_empty() {
        let id = set.id;
        if let Ok(mut map) = state.proposals.lock() {
            map.insert(id, set);
        }
        let _ = channel.send(ChatEvent::ProposalsReady { set_id: id });
    }
    let _ = channel.send(ChatEvent::Done);
    Ok(())
}

/// Runs the `semantic_search` tool: embed the query, rank stored chunks, format for the model.
async fn semantic_tool(
    vault: &crate::vault::OpenVault,
    settings: &crate::settings::Settings,
    allowed: bool,
    scope: Option<&str>,
    call: &super::providers::types::ToolCall,
) -> tools::ToolOutcome {
    let query = super::providers::types::parse_args(&call.arguments)
        .ok()
        .and_then(|a| a.get("query").and_then(|q| q.as_str().map(str::to_string)))
        .unwrap_or_default();
    let summary = format!("Searched by meaning for '{query}'");
    if !allowed {
        return tools::ToolOutcome {
            result: "Error: semantic search is not available in this project.".into(),
            summary,
        };
    }
    let outcome = async {
        let (embed, model) = crate::embeddings::embedder_for(settings)?;
        let chunks = crate::embeddings::load_vectors(vault, &model)?;
        let q = crate::embeddings::search::embed_query(&embed, &query).await?;
        let hits = crate::embeddings::search::rank(&chunks, &q, scope, 5);
        Ok::<_, crate::error::AppError>(hits)
    }
    .await;
    match outcome {
        Ok(hits) if hits.is_empty() => tools::ToolOutcome {
            result: "No matching passages.".into(),
            summary,
        },
        Ok(hits) => {
            let result = hits
                .iter()
                .enumerate()
                .map(|(i, h)| format!("[{}] {} — {}\n{}", i + 1, h.path, h.title, h.snippet))
                .collect::<Vec<_>>()
                .join("\n\n");
            tools::ToolOutcome { result, summary }
        }
        Err(e) => tools::ToolOutcome {
            result: format!("Error: {e}"),
            summary,
        },
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn earlier_activity_is_added_to_the_answer_so_later_messages_can_refer_to_it() {
        assert_eq!(with_activity("Done.", &[]), "Done.");
        let text = with_activity(
            "I merged them.",
            &[
                "Proposed new note Work/All.md".into(),
                "Proposed deleting Work/a.md".into(),
            ],
        );
        assert!(text.starts_with("I merged them."));
        assert!(text.contains("- Proposed new note Work/All.md"));
        assert!(text.contains("- Proposed deleting Work/a.md"));
    }
}
