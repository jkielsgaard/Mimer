//! Tool definitions and execution for the agent loop.

use super::proposals::{hash, Proposal, ProposalAction, ProposalSet};
use super::providers::types::{parse_args, ToolCall, ToolDef};
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
            description: "List child folders and notes of a folder. Use an empty path for the root of the allowed area. With recursive=true it lists every note in the folder and all its sub-folders (up to 400), which is the way to see a whole imported folder at once.",
            parameters: s(
                json!({"path": {"type": "string"}, "recursive": {"type": "boolean"}}),
                &["path"],
            ),
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
            description: "Propose renaming or moving a note or folder. Links to it are updated. Missing folders in the new path are created automatically, so this is also how you create a folder: move a note to \"New folder/Note.md\". For more than a few notes use propose_move_many.",
            parameters: s(
                json!({"from": {"type": "string"}, "to": {"type": "string"}, "reason": {"type": "string"}}),
                &["from", "to", "reason"],
            ),
        },
        ToolDef {
            name: "propose_move_many",
            description: "Propose moving or renaming many notes in one call (use this to sort a whole folder; about 20 per call is safest; call it again for more). Missing folders in the new paths are created automatically. Links are updated. Moves that are not valid are listed in the answer; fix those and send them again.",
            parameters: s(
                json!({
                    "moves": {
                        "type": "array",
                        "items": {
                            "type": "object",
                            "properties": {"from": {"type": "string"}, "to": {"type": "string"}},
                            "required": ["from", "to"]
                        }
                    },
                    "reason": {"type": "string"}
                }),
                &["moves", "reason"],
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
        // The user sees this line: it must not look like the change was proposed.
        summary: format!("Failed: {summary}"),
    }
}

/// Added to "does not exist" errors: small models shorten paths or invent them.
const PATH_HINT: &str = ". Use the full vault-relative path exactly as list_folder shows it";

/// Why a folder or file name in a new path cannot be used (Windows and OneDrive rules), if any.
fn path_name_problem(path: &str) -> Option<String> {
    path.split('/')
        .filter(|part| !part.is_empty())
        .find_map(crate::vault::fs_ops::name_problem)
}

/// A note moved to a path without `.md` would become a file with that name ("vendors").
fn extension_problem(from: &str, to: &str) -> Option<String> {
    let note = from.to_lowercase().ends_with(".md");
    (note && !to.to_lowercase().ends_with(".md")).then(|| {
        let name = from.rsplit('/').next().unwrap_or(from);
        format!(
            "'to' must be the complete new path including the file name, for example '{}/{name}'; '{to}' would turn the note into a file called '{to}'",
            to.trim_end_matches('/')
        )
    })
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
        "propose_move_many" => "Preparing to move several notes".to_string(),
        "propose_merge" => format!(
            "Preparing to merge into {}",
            or("target_path", "a new note")
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
            if args.get("recursive").and_then(Value::as_bool) == Some(true) {
                let prefix = if path.is_empty() {
                    scope
                        .map(|s| format!("{}/", s.trim_matches('/')))
                        .unwrap_or_default()
                } else {
                    format!("{}/", path.trim_matches('/'))
                };
                let found: Vec<String> = tree::list_files(&v.root)
                    .into_iter()
                    .filter(|f| f.to_lowercase().ends_with(".md") && f.starts_with(&prefix))
                    .collect();
                let total = found.len();
                let mut lines: Vec<String> = found.into_iter().take(RECURSIVE_LIMIT).collect();
                if total > RECURSIVE_LIMIT {
                    lines.push(format!(
                        "(… {} more notes not shown)",
                        total - RECURSIVE_LIMIT
                    ));
                }
                return ToolOutcome {
                    result: if lines.is_empty() {
                        "(no notes)".into()
                    } else {
                        format!("{total} notes:\n{}", lines.join("\n"))
                    },
                    summary,
                };
            }
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
            if let Some(problem) = path_name_problem(path) {
                return err(summary, problem);
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
            if let Some(problem) = extension_problem(from, to) {
                return err(summary, problem);
            }
            if let Some(problem) = path_name_problem(to) {
                return err(summary, problem);
            }
            let (a, b) = match (
                paths::resolve(&v.root, from, scope),
                paths::resolve(&v.root, to, scope),
            ) {
                (Ok(a), Ok(b)) => (a, b),
                (Err(e), _) | (_, Err(e)) => return err(summary, e),
            };
            if !a.exists() {
                return err(summary, format!("{from} does not exist{PATH_HINT}"));
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
        "propose_move_many" => move_many(v, scope, set, &args),
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
                return err(summary, format!("{path} does not exist{PATH_HINT}"));
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

/// Most notes listed by a recursive `list_folder`.
const RECURSIVE_LIMIT: usize = 400;

/// Looks for a list of moves that the model wrote as text (a JSON array of `{from, to}` objects,
/// usually in a code block) instead of calling `propose_move_many`, and turns it into that call.
/// `n` makes the call id unique.
pub fn rescue_moves(text: &str, n: usize) -> Option<ToolCall> {
    for (i, _) in text.match_indices('[') {
        let mut stream = serde_json::Deserializer::from_str(&text[i..]).into_iter::<Value>();
        let Some(Ok(Value::Array(items))) = stream.next() else {
            continue;
        };
        let moves: Vec<Value> = items
            .iter()
            .filter(|m| arg(m, "from").is_some() && arg(m, "to").is_some())
            .cloned()
            .collect();
        if !moves.is_empty() && moves.len() == items.len() {
            return Some(ToolCall {
                id: format!("rescued-{n}"),
                name: "propose_move_many".into(),
                arguments: json!({"moves": moves, "reason": "Sorted into folders"}).to_string(),
            });
        }
    }
    None
}

/// Notes in the folder the queued moves come from that have no queued move yet.
fn not_placed(v: &OpenVault, set: &ProposalSet) -> Vec<String> {
    let sources: Vec<&str> = set
        .proposals
        .iter()
        .filter(|p| p.action == ProposalAction::Move)
        .map(|p| p.path.as_str())
        .collect();
    let Some(first) = sources.first() else {
        return Vec::new();
    };
    // The deepest folder that holds every source.
    let mut common: Vec<&str> = first.split('/').collect();
    common.pop();
    for s in &sources[1..] {
        let parts: Vec<&str> = s.split('/').collect();
        let keep = common
            .iter()
            .zip(parts.iter())
            .take_while(|(a, b)| a == b)
            .count();
        common.truncate(keep);
    }
    if common.is_empty() {
        return Vec::new();
    }
    let prefix = format!("{}/", common.join("/"));
    tree::list_files(&v.root)
        .into_iter()
        .filter(|f| {
            tree::is_markdown(f) && f.starts_with(&prefix) && !sources.contains(&f.as_str())
        })
        .collect()
}

/// Most moves accepted by one `propose_move_many` call.
const MOVE_MANY_LIMIT: usize = 100;

/// `propose_move_many`: queues every valid move and lists the ones that were refused, so the
/// model can fix just those.
fn move_many(
    v: &OpenVault,
    scope: Option<&str>,
    set: &mut ProposalSet,
    args: &Value,
) -> ToolOutcome {
    let Some(moves) = args.get("moves").and_then(Value::as_array) else {
        return err(
            "propose_move_many failed".into(),
            "missing required argument 'moves' (a list of {from, to})",
        );
    };
    let reason = arg(args, "reason");
    let mut queued = 0usize;
    let mut refused: Vec<String> = Vec::new();
    let mut targets: std::collections::HashSet<String> = std::collections::HashSet::new();
    for m in moves.iter().take(MOVE_MANY_LIMIT) {
        let (Some(from), Some(to)) = (arg(m, "from"), arg(m, "to")) else {
            refused.push("an entry without from/to".into());
            continue;
        };
        if let Some(problem) = extension_problem(from, to) {
            refused.push(format!("{from} → {to}: {problem}"));
            continue;
        }
        let (a, b) = match (
            paths::resolve(&v.root, from, scope),
            paths::resolve(&v.root, to, scope),
        ) {
            (Ok(a), Ok(b)) => (a, b),
            (Err(e), _) | (_, Err(e)) => {
                refused.push(format!("{from} → {to}: {e}"));
                continue;
            }
        };
        if !a.exists() {
            refused.push(format!("{from} does not exist{PATH_HINT}"));
        } else if b.exists() || !targets.insert(to.to_lowercase()) {
            refused.push(format!(
                "{to} already exists or is used twice; choose another name"
            ));
        } else {
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
                reason,
                String::new(),
            );
            queued += 1;
        }
    }
    if moves.len() > MOVE_MANY_LIMIT {
        refused.push(format!(
            "only the first {MOVE_MANY_LIMIT} moves were read; send the other {} in another call",
            moves.len() - MOVE_MANY_LIMIT
        ));
    }
    let mut result = format!("Queued {queued} move(s) for the user to review (nothing is moved until the user applies them).");
    let left = not_placed(v, set);
    if !left.is_empty() {
        let shown: Vec<&str> = left.iter().take(40).map(String::as_str).collect();
        result.push_str(&format!(
            "\nNotes in the same folder that have no move yet ({}): {}. Place these too with propose_move_many before you answer.",
            left.len(),
            shown.join(", ")
        ));
    }
    if !refused.is_empty() {
        result.push_str(&format!("\nNot queued:\n- {}", refused.join("\n- ")));
    }
    ToolOutcome {
        result,
        summary: format!("Proposed moving {queued} notes"),
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
            Err(_) => return err(summary, format!("{source} does not exist{PATH_HINT}")),
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
        checks: Vec::new(),
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

    #[test]
    fn move_many_queues_valid_moves_and_lists_the_refused_ones() {
        let d = tempfile::tempdir().unwrap();
        let v = open_for_test(d.path());
        ops::write_note(&v, "In/a.md", "a").unwrap();
        ops::write_note(&v, "In/b.md", "b").unwrap();
        ops::write_note(&v, "In/c.md", "c").unwrap();
        let mut set = ProposalSet::new(None);
        let r = execute(
            &v,
            None,
            &mut set,
            &call(
                "propose_move_many",
                json!({"moves": [
                    {"from": "In/a.md", "to": "New folder/a.md"},
                    {"from": "In/b.md", "to": "New folder/a.md"},
                    {"from": "In/missing.md", "to": "X/m.md"},
                    {"from": "In/c.md", "to": "Other/c.md"}
                ], "reason": "sort"}),
            ),
        );
        assert_eq!(set.proposals.len(), 2, "{}", r.result);
        assert!(r.result.contains("Queued 2 move(s)"));
        assert!(r.result.contains("used twice"));
        assert!(r.result.contains("In/missing.md does not exist"));
        assert!(
            d.path().join("In/a.md").exists(),
            "nothing is moved by the tool"
        );
        let bad = execute(
            &v,
            None,
            &mut set,
            &call("propose_move_many", json!({"reason": "r"})),
        );
        assert!(bad.result.starts_with("Error:"));
    }

    #[test]
    fn recursive_list_shows_all_notes_below_a_folder_and_respects_scope() {
        let d = tempfile::tempdir().unwrap();
        let v = open_for_test(d.path());
        ops::write_note(&v, "Imp/a.md", "a").unwrap();
        ops::write_note(&v, "Imp/Sub/b.md", "b").unwrap();
        ops::write_note(&v, "Imp/Sub/Deep/c.md", "c").unwrap();
        ops::write_note(&v, "Other/x.md", "x").unwrap();
        let mut set = ProposalSet::new(None);
        let r = execute(
            &v,
            None,
            &mut set,
            &call("list_folder", json!({"path": "Imp", "recursive": true})),
        );
        assert!(r.result.starts_with("3 notes:"), "{}", r.result);
        assert!(r.result.contains("Imp/Sub/Deep/c.md"));
        assert!(!r.result.contains("Other/x.md"));
        let scoped = execute(
            &v,
            Some("Imp"),
            &mut set,
            &call("list_folder", json!({"path": "", "recursive": true})),
        );
        assert!(scoped.result.starts_with("3 notes:"), "{}", scoped.result);
        let out = execute(
            &v,
            Some("Imp"),
            &mut set,
            &call("list_folder", json!({"path": "Other", "recursive": true})),
        );
        assert!(out.result.starts_with("Error:"));
    }

    #[test]
    fn a_move_to_a_folder_name_without_the_file_name_is_refused() {
        let d = tempfile::tempdir().unwrap();
        let v = open_for_test(d.path());
        ops::write_note(&v, "In/a.md", "a").unwrap();
        let mut set = ProposalSet::new(None);
        let one = execute(
            &v,
            None,
            &mut set,
            &call(
                "propose_move",
                json!({"from": "In/a.md", "to": "vendors", "reason": "r"}),
            ),
        );
        assert!(one.result.contains("'vendors/a.md'"), "{}", one.result);
        assert!(one.summary.starts_with("Failed:"));
        let many = execute(
            &v,
            None,
            &mut set,
            &call(
                "propose_move_many",
                json!({"moves": [{"from": "In/a.md", "to": "vendors"}], "reason": "r"}),
            ),
        );
        assert!(many.result.contains("Queued 0 move(s)"));
        assert!(many.result.contains("complete new path"));
        assert!(set.proposals.is_empty());
        let missing = execute(
            &v,
            None,
            &mut set,
            &call(
                "propose_move",
                json!({"from": "a.md", "to": "X/a.md", "reason": "r"}),
            ),
        );
        assert!(missing.result.contains("exactly as list_folder shows it"));
    }

    #[test]
    fn a_list_of_moves_written_as_text_becomes_a_tool_call() {
        let text = "I moved them:\n```json\n[\n {\"from\": \"A/a.md\", \"to\": \"X/a.md\"},\n {\"from\": \"A/b.md\", \"to\": \"Y/b.md\"}\n]\n```\nDone [1].";
        let call = rescue_moves(text, 0).unwrap();
        assert_eq!(call.name, "propose_move_many");
        let args: Value = serde_json::from_str(&call.arguments).unwrap();
        assert_eq!(args["moves"].as_array().unwrap().len(), 2);
        assert!(rescue_moves("No list here, only [a note] and [1, 2].", 0).is_none());
        assert!(
            rescue_moves(r#"[{"from": "a.md"}]"#, 0).is_none(),
            "needs from and to"
        );
        assert!(
            rescue_moves(r#"[{"from": "a.md", "to": "b/a.md"}, 5]"#, 0).is_none(),
            "every entry must be a move"
        );
    }

    #[test]
    fn move_many_names_the_notes_that_still_have_no_move() {
        let d = tempfile::tempdir().unwrap();
        let v = open_for_test(d.path());
        for n in ["Imp/A/a.md", "Imp/A/b.md", "Imp/B/c.md", "Elsewhere/z.md"] {
            ops::write_note(&v, n, "x").unwrap();
        }
        let mut set = ProposalSet::new(None);
        let r = execute(
            &v,
            None,
            &mut set,
            &call(
                "propose_move_many",
                json!({"moves": [
                    {"from": "Imp/A/a.md", "to": "X/a.md"},
                    {"from": "Imp/B/c.md", "to": "X/c.md"}
                ], "reason": "r"}),
            ),
        );
        assert!(
            r.result.contains("have no move yet (1): Imp/A/b.md"),
            "{}",
            r.result
        );
        assert!(!r.result.contains("Elsewhere"));
        let r2 = execute(
            &v,
            None,
            &mut set,
            &call(
                "propose_move_many",
                json!({"moves": [{"from": "Imp/A/b.md", "to": "X/b.md"}], "reason": "r"}),
            ),
        );
        assert!(!r2.result.contains("no move yet"), "{}", r2.result);
    }
}
