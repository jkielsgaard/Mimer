//! Tool definitions and execution for the agent loop.

use super::proposals::{hash, Proposal, ProposalAction, ProposalSet};
use super::providers::types::{parse_args, ToolCall, ToolDef};
use crate::error::{AppError, AppResult};
use crate::search::{search, SearchQuery};
use crate::vault::{fs_ops, paths, tree, OpenVault};
use serde_json::{json, Value};
use uuid::Uuid;

const READ_LIMIT: usize = 12_000;

/// Result of running a tool: text for the model and a short line for the UI.
pub struct ToolOutcome {
    pub result: String,
    pub summary: String,
}

/// The tool schemas offered to the model.
pub fn definitions() -> Vec<ToolDef> {
    let s = |props: Value, required: &[&str]| json!({"type": "object", "properties": props, "required": required});
    vec![
        ToolDef {
            name: "search_notes",
            description: "Full-text search in the notes. Returns up to 10 hits with path, title and snippet.",
            parameters: s(
                json!({"query": {"type": "string"}, "tag": {"type": "string"}, "folder": {"type": "string"}}),
                &["query"],
            ),
        },
        ToolDef {
            name: "read_note",
            description: "Read the full content of a note by vault-relative path.",
            parameters: s(json!({"path": {"type": "string"}}), &["path"]),
        },
        ToolDef {
            name: "list_folder",
            description: "List child folders and notes of a folder. Use an empty path for the root of the allowed area.",
            parameters: s(json!({"path": {"type": "string"}}), &["path"]),
        },
        ToolDef {
            name: "propose_edit",
            description: "Propose replacing the complete content of an existing note. The user reviews it before anything is written.",
            parameters: s(
                json!({"path": {"type": "string"}, "new_content": {"type": "string"}, "reason": {"type": "string"}}),
                &["path", "new_content", "reason"],
            ),
        },
        ToolDef {
            name: "propose_create",
            description: "Propose creating a new note. The user reviews it before anything is written.",
            parameters: s(
                json!({"path": {"type": "string"}, "content": {"type": "string"}, "reason": {"type": "string"}}),
                &["path", "content", "reason"],
            ),
        },
        ToolDef {
            name: "propose_move",
            description: "Propose renaming or moving a note or folder. Links to it are updated.",
            parameters: s(
                json!({"from": {"type": "string"}, "to": {"type": "string"}, "reason": {"type": "string"}}),
                &["from", "to", "reason"],
            ),
        },
        ToolDef {
            name: "propose_merge",
            description: "Propose merging several notes into one: creates the new note (or edits one of the sources) and proposes deleting every other source note, in one step. Use this whenever the user asks to combine, merge or consolidate notes. The user reviews it; deleted notes can be restored from history.",
            parameters: s(
                json!({
                    "sources": {"type": "array", "items": {"type": "string"}, "description": "Paths of ALL notes being merged"},
                    "target_path": {"type": "string", "description": "Path of the merged note"},
                    "content": {"type": "string", "description": "Complete content of the merged note"},
                    "reason": {"type": "string"}
                }),
                &["sources", "target_path", "content", "reason"],
            ),
        },
        ToolDef {
            name: "write_research_prompt",
            description: "Write a prompt the user can take to a cloud AI that has internet access, when the user wants NEW documentation or facts about a subject. The prompt tells that AI what to research and in which format to answer, so the answer can be imported into the vault. Use this instead of writing such content yourself. The prompt is shown to the user as a card; do not repeat it.",
            parameters: s(
                json!({
                    "topic": {"type": "string", "description": "What to research"},
                    "goal": {"type": "string", "description": "What the document is for"},
                    "audience": {"type": "string"},
                    "depth": {"type": "string", "enum": ["overview", "detailed", "expert"]},
                    "kind": {"type": "string", "enum": ["documentation", "howto", "comparison", "summary", "checklist"]},
                    "language": {"type": "string", "description": "Language of the answer, for example Danish"},
                    "context": {"type": "string", "description": "What the user already has, so the answer fits"}
                }),
                &["topic"],
            ),
        },
        ToolDef {
            name: "propose_delete",
            description: "Propose deleting a note. The user reviews it; deleted notes can be restored from history.",
            parameters: s(json!({"path": {"type": "string"}, "reason": {"type": "string"}}), &["path", "reason"]),
        },
    ]
}

/// Schema of the meaning-based search tool (offered only when allowed; see agent.rs).
pub fn semantic_search_definition() -> ToolDef {
    ToolDef {
        name: "semantic_search",
        description: "Find notes by meaning. Use for questions where the exact words are unknown. Returns the most relevant passages with their note path.",
        parameters: json!({"type": "object", "properties": {"query": {"type": "string"}}, "required": ["query"]}),
    }
}

fn arg<'a>(v: &'a Value, key: &str) -> Option<&'a str> {
    v.get(key).and_then(Value::as_str)
}

fn err(summary: String, msg: impl std::fmt::Display) -> ToolOutcome {
    ToolOutcome {
        result: format!("Error: {msg}"),
        summary,
    }
}

fn truncate(s: &str, max: usize) -> String {
    if s.chars().count() <= max {
        s.to_string()
    } else {
        format!(
            "{}\n[...truncated...]",
            s.chars().take(max).collect::<String>()
        )
    }
}

/// The card for a `write_research_prompt` call: a title and the prompt text.
pub fn research_card(call: &ToolCall) -> AppResult<crate::research::ResearchCard> {
    let args = parse_args(&call.arguments)
        .map_err(|e| AppError::InvalidPath(format!("arguments are not valid JSON: {e}")))?;
    let get = |k: &str| arg(&args, k).unwrap_or("").to_string();
    let mut spec = crate::research::ResearchSpec {
        topic: get("topic"),
        goal: get("goal"),
        audience: get("audience"),
        context: get("context"),
        ..crate::research::ResearchSpec::default()
    };
    for (key, slot) in [
        ("depth", &mut spec.depth),
        ("kind", &mut spec.kind),
        ("language", &mut spec.language),
    ] {
        let v = get(key);
        if !v.trim().is_empty() {
            *slot = v;
        }
    }
    let today = chrono::Local::now().format("%Y-%m-%d").to_string();
    let text = crate::research::build_prompt(&spec, &today)?;
    let topic: String = spec.topic.trim().chars().take(80).collect();
    Ok(crate::research::ResearchCard {
        title: format!("Research: {topic}"),
        text,
    })
}

/// Longest piece of an argument shown in a progress line.
const DESCRIBE_LIMIT: usize = 60;

/// Short text for what a tool call is about to do ("Reading Work/Plan.md"), shown to the user
/// before the tool runs. Only paths and search words are used, never note content.
pub fn describe_call(call: &ToolCall) -> String {
    let args = parse_args(&call.arguments).unwrap_or(Value::Null);
    let short = |key: &str| -> String {
        let text = arg(&args, key).unwrap_or("").trim();
        if text.chars().count() > DESCRIBE_LIMIT {
            format!("{}…", text.chars().take(DESCRIBE_LIMIT).collect::<String>())
        } else {
            text.to_string()
        }
    };
    let or = |key: &str, fallback: &str| -> String {
        let t = short(key);
        if t.is_empty() {
            fallback.to_string()
        } else {
            t
        }
    };
    match call.name.as_str() {
        "search_notes" => format!("Searching notes for '{}'", short("query")),
        "semantic_search" => format!("Searching by meaning for '{}'", short("query")),
        "read_note" => format!("Reading {}", or("path", "a note")),
        "list_folder" => format!("Listing {}", or("path", "the folder")),
        "propose_edit" => format!("Preparing an edit to {}", or("path", "a note")),
        "propose_create" => format!("Preparing a new note {}", or("path", "")),
        "propose_move" => format!("Preparing to move {}", or("from", "a note")),
        "propose_delete" => format!("Preparing to delete {}", or("path", "a note")),
        "propose_merge" => format!(
            "Preparing to merge into {}",
            or("target_path", "a new note")
        ),
        "write_research_prompt" => format!(
            "Writing a research prompt about {}",
            or("topic", "the subject")
        ),
        other => format!("Running {other}"),
    }
}

/// Runs one tool call. Never panics and never touches the disk for `propose_*` tools.
pub fn execute(
    v: &OpenVault,
    scope: Option<&str>,
    set: &mut ProposalSet,
    call: &ToolCall,
) -> ToolOutcome {
    let args = match parse_args(&call.arguments) {
        Ok(a) => a,
        Err(e) => {
            return err(
                format!("Invalid arguments for {}", call.name),
                format!("arguments are not valid JSON: {e}"),
            )
        }
    };
    let missing = |name: &str| {
        let hint = if call.arguments.trim().is_empty() {
            " The call had no arguments at all: the answer was probably cut off because it was too long for the model's context. Do the work in smaller steps (one note at a time)."
        } else {
            ""
        };
        err(
            format!("{} failed", call.name),
            format!("missing required argument '{name}'.{hint}"),
        )
    };
    match call.name.as_str() {
        "search_notes" => {
            let Some(query) = arg(&args, "query") else {
                return missing("query");
            };
            let summary = format!("Searched notes for '{query}'");
            let folder = match arg(&args, "folder").filter(|f| !f.is_empty()) {
                Some(f) => match paths::resolve_dir(&v.root, f, scope) {
                    Ok(_) => Some(f.to_string()),
                    Err(e) => return err(summary, e),
                },
                None => scope.map(str::to_string),
            };
            let q = SearchQuery {
                text: query.to_string(),
                tag: arg(&args, "tag").map(str::to_string),
                folder,
            };
            match v.with_index(|c| search(c, &q)) {
                Ok(hits) if hits.is_empty() => ToolOutcome {
                    result: "No matching notes.".into(),
                    summary,
                },
                Ok(hits) => ToolOutcome {
                    result: hits
                        .iter()
                        .take(10)
                        .map(|h| {
                            format!(
                                "- {} — {}\n  {}",
                                h.path,
                                h.title,
                                h.snippet.replace("<mark>", "").replace("</mark>", "")
                            )
                        })
                        .collect::<Vec<_>>()
                        .join("\n"),
                    summary,
                },
                Err(e) => err(summary, e),
            }
        }
        "read_note" => {
            let Some(path) = arg(&args, "path") else {
                return missing("path");
            };
            let summary = format!("Read {path}");
            match paths::resolve(&v.root, path, scope)
                .and_then(|_| fs_ops::read_note(&v.root, path))
            {
                Ok(n) => ToolOutcome {
                    result: truncate(&n.content, READ_LIMIT),
                    summary,
                },
                Err(e) => err(summary, e),
            }
        }
        "list_folder" => {
            let path = arg(&args, "path").unwrap_or("");
            let summary = format!(
                "Listed {}",
                if path.is_empty() {
                    "the root folder"
                } else {
                    path
                }
            );
            let abs = match paths::resolve_dir(&v.root, path, scope) {
                Ok(a) => a,
                Err(e) => return err(summary, e),
            };
            let mut dirs = Vec::new();
            let mut notes = Vec::new();
            if let Ok(rd) = std::fs::read_dir(&abs) {
                for e in rd.flatten() {
                    let name = e.file_name().to_string_lossy().into_owned();
                    if paths::is_hidden(&name) {
                        continue;
                    }
                    match e.file_type() {
                        Ok(t) if t.is_dir() => dirs.push(format!("{name}/")),
                        Ok(t) if t.is_file() && tree::is_visible_file(&name) => notes.push(name),
                        _ => {}
                    }
                }
            }
            dirs.sort();
            notes.sort();
            let all: Vec<String> = dirs.into_iter().chain(notes).collect();
            ToolOutcome {
                result: if all.is_empty() {
                    "(empty)".into()
                } else {
                    all.join("\n")
                },
                summary,
            }
        }
        "propose_edit" => {
            let (Some(path), Some(content)) = (arg(&args, "path"), arg(&args, "new_content"))
            else {
                return missing("path/new_content");
            };
            let summary = format!("Proposed edit to {path}");
            let abs = match paths::resolve(&v.root, path, scope) {
                Ok(a) => a,
                Err(e) => return err(summary, e),
            };
            let Ok(bytes) = std::fs::read(&abs) else {
                return err(
                    summary,
                    format!("{path} does not exist; use propose_create"),
                );
            };
            let original = String::from_utf8_lossy(&bytes).into_owned();
            queue(
                set,
                ProposalAction::Edit,
                path,
                None,
                Some(content),
                Some(original),
                arg(&args, "reason"),
                summary,
            )
        }
        "propose_create" => {
            let (Some(path), Some(content)) = (arg(&args, "path"), arg(&args, "content")) else {
                return missing("path/content");
            };
            let summary = format!("Proposed new note {path}");
            if !path.to_lowercase().ends_with(".md") {
                return err(summary, "new notes must have a .md extension");
            }
            match paths::resolve(&v.root, path, scope) {
                Ok(a) if a.exists() => {
                    err(summary, format!("{path} already exists; use propose_edit"))
                }
                Ok(_) => queue(
                    set,
                    ProposalAction::Create,
                    path,
                    None,
                    Some(content),
                    None,
                    arg(&args, "reason"),
                    summary,
                ),
                Err(e) => err(summary, e),
            }
        }
        "propose_move" => {
            let (Some(from), Some(to)) = (arg(&args, "from"), arg(&args, "to")) else {
                return missing("from/to");
            };
            let summary = format!("Proposed move {from} → {to}");
            let (a, b) = match (
                paths::resolve(&v.root, from, scope),
                paths::resolve(&v.root, to, scope),
            ) {
                (Ok(a), Ok(b)) => (a, b),
                (Err(e), _) | (_, Err(e)) => return err(summary, e),
            };
            if !a.exists() {
                return err(summary, format!("{from} does not exist"));
            }
            if b.exists() {
                return err(summary, format!("{to} already exists"));
            }
            let original = std::fs::read(&a)
                .ok()
                .map(|b| String::from_utf8_lossy(&b).into_owned());
            queue(
                set,
                ProposalAction::Move,
                from,
                Some(to),
                None,
                original,
                arg(&args, "reason"),
                summary,
            )
        }
        "propose_merge" => merge(v, scope, set, &args),
        "write_research_prompt" => match research_card(call) {
            Ok(card) => ToolOutcome {
                result: "The research prompt was shown to the user as a card with a Copy button. Tell the user in one or two sentences to take it to a cloud AI with internet access and to bring the answer back with Import answer. Do not repeat the prompt.".into(),
                summary: format!("Wrote a research prompt: {}", card.title),
            },
            Err(e) => err("Research prompt failed".into(), e),
        },
        "propose_delete" => {
            let Some(path) = arg(&args, "path") else {
                return missing("path");
            };
            let summary = format!("Proposed deleting {path}");
            let abs = match paths::resolve(&v.root, path, scope) {
                Ok(a) => a,
                Err(e) => return err(summary, e),
            };
            if !abs.exists() {
                return err(summary, format!("{path} does not exist"));
            }
            let original = std::fs::read(&abs)
                .ok()
                .map(|b| String::from_utf8_lossy(&b).into_owned());
            queue(
                set,
                ProposalAction::Delete,
                path,
                None,
                None,
                original,
                arg(&args, "reason"),
                summary,
            )
        }
        other => err(
            format!("Unknown tool {other}"),
            format!("unknown tool '{other}'"),
        ),
    }
}

/// `propose_merge`: validates everything first, then queues the new note (or an edit of one of
/// the sources) and a delete for every other source, so nothing is half-proposed.
fn merge(v: &OpenVault, scope: Option<&str>, set: &mut ProposalSet, args: &Value) -> ToolOutcome {
    let sources: Vec<&str> = args
        .get("sources")
        .and_then(Value::as_array)
        .map(|a| a.iter().filter_map(Value::as_str).collect())
        .unwrap_or_default();
    let (Some(target), Some(content)) = (arg(args, "target_path"), arg(args, "content")) else {
        return err(
            "propose_merge failed".into(),
            "missing required argument 'target_path/content'",
        );
    };
    let summary = format!("Proposed merging {} notes into {target}", sources.len());
    if sources.is_empty() {
        return err(summary, "'sources' must list at least one note");
    }
    if !target.to_lowercase().ends_with(".md") {
        return err(summary, "the merged note must have a .md extension");
    }
    let target_abs = match paths::resolve(&v.root, target, scope) {
        Ok(a) => a,
        Err(e) => return err(summary, e),
    };
    let target_is_source = sources.contains(&target);
    if target_abs.exists() && !target_is_source {
        return err(
            summary,
            format!("{target} already exists; choose another name, or include it in 'sources'"),
        );
    }
    let mut originals: Vec<(&str, String)> = Vec::new();
    for source in &sources {
        let abs = match paths::resolve(&v.root, source, scope) {
            Ok(a) => a,
            Err(e) => return err(summary, e),
        };
        match std::fs::read(&abs) {
            Ok(bytes) => originals.push((source, String::from_utf8_lossy(&bytes).into_owned())),
            Err(_) => return err(summary, format!("{source} does not exist")),
        }
    }
    let reason = arg(args, "reason");
    if target_is_source {
        let original = originals
            .iter()
            .find(|(p, _)| *p == target)
            .map(|(_, c)| c.clone());
        queue(
            set,
            ProposalAction::Edit,
            target,
            None,
            Some(content),
            original,
            reason,
            String::new(),
        );
    } else {
        queue(
            set,
            ProposalAction::Create,
            target,
            None,
            Some(content),
            None,
            reason,
            String::new(),
        );
    }
    let mut deleted = Vec::new();
    for (path, original) in originals {
        if path == target {
            continue;
        }
        queue(
            set,
            ProposalAction::Delete,
            path,
            None,
            None,
            Some(original),
            reason,
            String::new(),
        );
        deleted.push(path);
    }
    ToolOutcome {
        result: format!(
            "Queued for user review: {} {target}, and deletion of {} note(s): {}.",
            if target_is_source {
                "edit of"
            } else {
                "new note"
            },
            deleted.len(),
            deleted.join(", ")
        ),
        summary: format!(
            "Proposed merging into {target} (deleting {} notes)",
            deleted.len()
        ),
    }
}

#[allow(clippy::too_many_arguments)]
fn queue(
    set: &mut ProposalSet,
    action: ProposalAction,
    path: &str,
    new_path: Option<&str>,
    content: Option<&str>,
    original: Option<String>,
    reason: Option<&str>,
    summary: String,
) -> ToolOutcome {
    set.add(Proposal {
        id: Uuid::new_v4(),
        action,
        path: path.to_string(),
        new_path: new_path.map(str::to_string),
        content: content.map(str::to_string),
        original_hash: original.as_deref().map(hash),
        original,
        reason: reason.unwrap_or("").to_string(),
    });
    ToolOutcome {
        result: "Queued for user review.".into(),
        summary,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::vault::{open_for_test, ops};

    fn call(name: &str, args: Value) -> ToolCall {
        ToolCall {
            id: "1".into(),
            name: name.into(),
            arguments: args.to_string(),
        }
    }

    #[test]
    fn out_of_scope_returns_error_text_not_a_crash() {
        let d = tempfile::tempdir().unwrap();
        let v = open_for_test(d.path());
        ops::write_note(&v, "Proj/a.md", "in scope").unwrap();
        ops::write_note(&v, "Secret/b.md", "secret").unwrap();
        let mut set = ProposalSet::new(Some("Proj".into()));
        let ok = execute(
            &v,
            Some("Proj"),
            &mut set,
            &call("read_note", json!({"path": "Proj/a.md"})),
        );
        assert_eq!(ok.result, "in scope");
        for c in [
            call("read_note", json!({"path": "Secret/b.md"})),
            call("read_note", json!({"path": "../x.md"})),
            call("list_folder", json!({"path": "Secret"})),
            call(
                "propose_edit",
                json!({"path": "Secret/b.md", "new_content": "x", "reason": "r"}),
            ),
            call(
                "propose_create",
                json!({"path": "Secret/new.md", "content": "x", "reason": "r"}),
            ),
            call(
                "propose_delete",
                json!({"path": "Secret/b.md", "reason": "r"}),
            ),
            call(
                "propose_move",
                json!({"from": "Proj/a.md", "to": "Secret/a.md", "reason": "r"}),
            ),
            call("search_notes", json!({"query": "x", "folder": "Secret"})),
        ] {
            let r = execute(&v, Some("Proj"), &mut set, &c);
            assert!(r.result.starts_with("Error:"), "{}: {}", c.name, r.result);
        }
        assert!(set.proposals.is_empty());
    }

    #[test]
    fn search_is_limited_to_scope_and_propose_never_writes() {
        let d = tempfile::tempdir().unwrap();
        let v = open_for_test(d.path());
        ops::write_note(&v, "Proj/a.md", "firewall inside").unwrap();
        ops::write_note(&v, "Other/b.md", "firewall outside").unwrap();
        let mut set = ProposalSet::new(Some("Proj".into()));
        let r = execute(
            &v,
            Some("Proj"),
            &mut set,
            &call("search_notes", json!({"query": "firewall"})),
        );
        assert!(r.result.contains("Proj/a.md") && !r.result.contains("Other/b.md"));
        let r = execute(
            &v,
            Some("Proj"),
            &mut set,
            &call(
                "propose_edit",
                json!({"path": "Proj/a.md", "new_content": "NEW", "reason": "why"}),
            ),
        );
        assert_eq!(r.result, "Queued for user review.");
        assert_eq!(
            std::fs::read_to_string(d.path().join("Proj/a.md")).unwrap(),
            "firewall inside"
        );
        assert_eq!(set.proposals.len(), 1);
    }

    #[test]
    fn bad_arguments_are_reported() {
        let d = tempfile::tempdir().unwrap();
        let v = open_for_test(d.path());
        let mut set = ProposalSet::new(None);
        let c = ToolCall {
            id: "1".into(),
            name: "read_note".into(),
            arguments: "{not json".into(),
        };
        assert!(execute(&v, None, &mut set, &c).result.starts_with("Error:"));
        assert!(execute(&v, None, &mut set, &call("nope", json!({})))
            .result
            .starts_with("Error:"));
        assert!(execute(&v, None, &mut set, &call("read_note", json!({})))
            .result
            .starts_with("Error:"));
    }

    #[test]
    fn describe_call_names_the_action_and_the_target() {
        let d = |name: &str, args: Value| describe_call(&call(name, args));
        assert_eq!(
            d("read_note", json!({"path": "Work/Plan.md"})),
            "Reading Work/Plan.md"
        );
        assert_eq!(
            d("search_notes", json!({"query": "firewall"})),
            "Searching notes for 'firewall'"
        );
        assert_eq!(
            d("semantic_search", json!({"query": "backup"})),
            "Searching by meaning for 'backup'"
        );
        assert_eq!(
            d("propose_move", json!({"from": "a.md", "to": "b.md"})),
            "Preparing to move a.md"
        );
        assert_eq!(d("list_folder", json!({"path": ""})), "Listing the folder");
        assert_eq!(d("mystery", json!({})), "Running mystery");
    }

    #[test]
    fn describe_call_never_includes_note_content_and_shortens_long_values() {
        let text = d_edit(&"secret body ".repeat(50), "Work/Plan.md");
        assert_eq!(text, "Preparing an edit to Work/Plan.md");
        assert!(!text.contains("secret"));
        let long = "x".repeat(200);
        let out = describe_call(&call("read_note", json!({ "path": long })));
        assert!(out.chars().count() <= "Reading ".chars().count() + DESCRIBE_LIMIT + 1);
        assert!(out.ends_with('…'));
    }

    #[test]
    fn describe_call_survives_bad_arguments() {
        let bad = ToolCall {
            id: "1".into(),
            name: "read_note".into(),
            arguments: "{not json".into(),
        };
        assert_eq!(describe_call(&bad), "Reading a note");
    }

    fn d_edit(content: &str, path: &str) -> String {
        describe_call(&call(
            "propose_edit",
            json!({"path": path, "new_content": content, "reason": "r"}),
        ))
    }

    fn merge_vault() -> (tempfile::TempDir, OpenVault) {
        let dir = tempfile::tempdir().unwrap();
        std::fs::create_dir_all(dir.path().join("Work")).unwrap();
        for n in ["a", "b", "c"] {
            std::fs::write(dir.path().join(format!("Work/{n}.md")), format!("# {n}")).unwrap();
        }
        let v = open_for_test(dir.path());
        (dir, v)
    }

    #[test]
    fn merge_queues_the_new_note_and_a_delete_for_every_source() {
        let (_d, v) = merge_vault();
        let mut set = ProposalSet::new(None);
        let r = execute(
            &v,
            None,
            &mut set,
            &call(
                "propose_merge",
                json!({"sources": ["Work/a.md", "Work/b.md", "Work/c.md"],
                       "target_path": "Work/All.md", "content": "# All", "reason": "merge"}),
            ),
        );
        assert!(r.result.starts_with("Queued"), "{}", r.result);
        assert!(r.result.contains("deletion of 3 note(s)"));
        let actions: Vec<(ProposalAction, &str)> = set
            .proposals
            .iter()
            .map(|p| (p.action, p.path.as_str()))
            .collect();
        assert_eq!(
            actions,
            vec![
                (ProposalAction::Create, "Work/All.md"),
                (ProposalAction::Delete, "Work/a.md"),
                (ProposalAction::Delete, "Work/b.md"),
                (ProposalAction::Delete, "Work/c.md"),
            ]
        );
        assert!(
            set.proposals[1].original.is_some(),
            "deletes keep the content for the diff"
        );
        assert!(!v.root.join("Work/All.md").exists(), "nothing is written");
    }

    #[test]
    fn merging_into_one_of_the_sources_edits_it_and_deletes_the_rest() {
        let (_d, v) = merge_vault();
        let mut set = ProposalSet::new(None);
        let r = execute(
            &v,
            None,
            &mut set,
            &call(
                "propose_merge",
                json!({"sources": ["Work/a.md", "Work/b.md"], "target_path": "Work/a.md",
                       "content": "# a+b", "reason": "r"}),
            ),
        );
        assert!(r.result.contains("edit of"), "{}", r.result);
        assert_eq!(set.proposals.len(), 2);
        assert_eq!(set.proposals[0].action, ProposalAction::Edit);
        assert_eq!(set.proposals[1].action, ProposalAction::Delete);
        assert_eq!(set.proposals[1].path, "Work/b.md");
    }

    #[test]
    fn a_bad_merge_queues_nothing() {
        let (_d, v) = merge_vault();
        let mut set = ProposalSet::new(None);
        for args in [
            json!({"sources": ["Work/a.md", "Work/missing.md"], "target_path": "Work/All.md", "content": "x", "reason": "r"}),
            json!({"sources": ["Work/a.md"], "target_path": "Work/b.md", "content": "x", "reason": "r"}),
            json!({"sources": ["Work/a.md"], "target_path": "Work/All.txt", "content": "x", "reason": "r"}),
            json!({"sources": [], "target_path": "Work/All.md", "content": "x", "reason": "r"}),
            json!({"sources": ["../x.md"], "target_path": "Work/All.md", "content": "x", "reason": "r"}),
        ] {
            let r = execute(&v, None, &mut set, &call("propose_merge", args));
            assert!(r.result.starts_with("Error:"), "{}", r.result);
        }
        assert!(set.proposals.is_empty(), "no half-proposed merge");
    }

    #[test]
    fn merge_respects_the_project_scope() {
        let (_d, v) = merge_vault();
        std::fs::create_dir_all(v.root.join("Other")).unwrap();
        std::fs::write(v.root.join("Other/x.md"), "x").unwrap();
        let mut set = ProposalSet::new(None);
        let r = execute(
            &v,
            Some("Work"),
            &mut set,
            &call(
                "propose_merge",
                json!({"sources": ["Work/a.md", "Other/x.md"], "target_path": "Work/All.md",
                       "content": "x", "reason": "r"}),
            ),
        );
        assert!(r.result.starts_with("Error:"));
        assert!(set.proposals.is_empty());
    }
}
