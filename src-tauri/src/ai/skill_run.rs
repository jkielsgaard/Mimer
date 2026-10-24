//! Runs a skill (see [`crate::skills`]): Mimer does the work note by note and the model only writes
//! the text for one step, so the result does not depend on a small model deciding to call a tool.
//!
//! Every change is queued as a proposal through the same tools the chat agent uses, so the paths
//! are checked against the scope in the same way and the user reviews everything before it is
//! written.

use super::prompt::truncate_middle;
use super::proposals::ProposalSet;
use super::providers::types::{ChatMessage, LlmRequest, ToolCall};
use super::providers::{self, http_client};
use super::{router, tools, ChatEvent, ChatRequest};
use crate::error::{AppError, AppResult};
use crate::projects;
use crate::settings::keychain;
use crate::skills::{Skill, SkillKind};
use crate::state::AppState;
use crate::vault::{fs_ops, paths, tree, tree::is_markdown, OpenVault};
use serde_json::json;
use tauri::ipc::Channel;
use tauri::{AppHandle, Manager, Runtime};
use tokio_util::sync::CancellationToken;

/// Most notes one `rewrite` run changes (each note is one model call).
const MAX_REWRITE: usize = 50;
/// Most notes one `sort` run files.
const MAX_SORT: usize = 300;
/// Most notes one `create` run reads.
const MAX_CREATE: usize = 30;
/// Longest note a rewrite sends in one step.
const NOTE_CHAR_LIMIT: usize = 12_000;
/// What the model sees of a note when it chooses a folder.
const SORT_PEEK_CHARS: usize = 1_200;
/// Longest text of one source note in a `create` run.
const CREATE_NOTE_CHARS: usize = 3_000;
/// Longest folder name the model can choose for a sort.
const FOLDER_NAME_CHARS: usize = 40;
const FALLBACK_FOLDER: &str = "Miscellaneous";
/// Temperature: steady answers, because the text is used as it is.
const TEMPERATURE: f32 = 0.2;

/// One note a skill works on, and the folder it is sorted inside.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Target {
    pub path: String,
    /// The attached folder this note was found in, or the note's own folder.
    pub base: String,
}

fn parent(path: &str) -> String {
    path.rsplit_once('/')
        .map(|(p, _)| p.to_string())
        .unwrap_or_default()
}

fn file_name(path: &str) -> &str {
    path.rsplit('/').next().unwrap_or(path)
}

/// Finds the notes a skill works on: the attached notes and folders (every note below a
/// folder), or else the open note, or else the selected folder. Anything outside `scope` is left
/// out. The second value lists what was left out and why.
pub fn collect_targets(
    root: &std::path::Path,
    scope: Option<&str>,
    mentions: &[String],
    current_note: Option<&str>,
    folder: Option<&str>,
) -> (Vec<Target>, Vec<String>) {
    let mut out: Vec<Target> = Vec::new();
    let mut skipped = Vec::new();
    let all = tree::list_files(root);
    let add_folder = |dir: &str, out: &mut Vec<Target>, skipped: &mut Vec<String>| {
        let dir = dir.trim_matches('/');
        // Nothing chosen is not "the whole vault": a skill needs a note or a folder to work on.
        if dir.is_empty() {
            skipped.push("no folder is chosen".to_string());
            return;
        }
        let ok = paths::resolve_dir(root, dir, scope).is_ok_and(|p| p.is_dir());
        if !ok {
            skipped.push(format!("{dir} is not a folder in this scope"));
            return;
        }
        let prefix = if dir.is_empty() {
            String::new()
        } else {
            format!("{dir}/")
        };
        let mut found: Vec<&String> = all
            .iter()
            .filter(|f| is_markdown(f) && f.starts_with(&prefix))
            .collect();
        found.sort_by_key(|f| f.to_lowercase());
        for f in found {
            if !out.iter().any(|t| &t.path == f) {
                out.push(Target {
                    path: f.clone(),
                    base: dir.to_string(),
                });
            }
        }
    };
    let add_note = |path: &str, out: &mut Vec<Target>, skipped: &mut Vec<String>| {
        if out.iter().any(|t| t.path == path) {
            return;
        }
        if paths::resolve(root, path, scope).is_err() || !root.join(path).is_file() {
            skipped.push(format!("{path} is not a note in this scope"));
            return;
        }
        out.push(Target {
            path: path.to_string(),
            base: parent(path),
        });
    };
    if !mentions.is_empty() {
        for m in mentions {
            if is_markdown(m) {
                add_note(m, &mut out, &mut skipped);
            } else {
                add_folder(m, &mut out, &mut skipped);
            }
        }
    } else if let Some(note) = current_note {
        add_note(note, &mut out, &mut skipped);
    } else if let Some(dir) = folder {
        add_folder(dir, &mut out, &mut skipped);
    }
    (out, skipped)
}

/// Removes one code fence the model put around its answer.
pub fn strip_fence(text: &str) -> String {
    let t = text.trim();
    if let Some(rest) = t.strip_prefix("```") {
        if let Some(body) = rest.strip_suffix("```") {
            let body = body.split_once('\n').map_or("", |(_, b)| b);
            return body.trim_end().to_string();
        }
    }
    t.to_string()
}

/// Checks a rewritten note and returns the text to propose, or the reason it is not used.
pub fn accept_rewrite(original: &str, answer: &str) -> Result<String, &'static str> {
    let new = strip_fence(answer);
    if new.trim().is_empty() {
        return Err("the model gave no text");
    }
    if new.trim() == original.trim() {
        return Err("the model returned the note unchanged (it may already be fine)");
    }
    // A model that stops half-way would cut the note; the user would have to notice in the diff.
    if original.chars().count() > 200 && new.chars().count() * 5 < original.chars().count() {
        return Err("the answer was much shorter than the note, so it was not used");
    }
    let mut text = new;
    if original.ends_with('\n') {
        text.push('\n');
    }
    Ok(text)
}

/// Turns the model's answer into a folder name or a two-level path such as `Customers/Acme`.
pub fn clean_folder(answer: &str, known: &[String]) -> String {
    let line = answer
        .lines()
        .map(str::trim)
        .find(|l| !l.is_empty())
        .unwrap_or("");
    let line = line
        .trim_start_matches(['`', '"', '\'', '*'])
        .trim_end_matches(['`', '"', '\'', '*']);
    let lower = line.to_lowercase();
    let line = lower
        .strip_prefix("folder:")
        .map(|_| line["folder:".len()..].trim())
        .unwrap_or(line);
    let mut parts: Vec<String> = Vec::new();
    for seg in line.split(['/', '\\']) {
        let cleaned: String = seg
            .chars()
            .filter(|c| !matches!(c, ':' | '*' | '?' | '"' | '<' | '>' | '|' | '`' | '.'))
            .collect();
        let cleaned: String = cleaned.trim().chars().take(FOLDER_NAME_CHARS).collect();
        let cleaned = cleaned.trim().to_string();
        if !cleaned.is_empty() {
            parts.push(cleaned);
        }
        if parts.len() == 2 {
            break;
        }
    }
    if parts.is_empty() {
        return FALLBACK_FOLDER.into();
    }
    let joined = parts.join("/");
    // Reuse the spelling of a folder that was chosen before.
    known
        .iter()
        .find(|k| k.to_lowercase() == joined.to_lowercase())
        .cloned()
        .unwrap_or(joined)
}

/// Splits the model's answer for a new note into its title (the first `# ` line) and the text.
pub fn title_of(text: &str) -> String {
    let title = text
        .lines()
        .map(str::trim)
        .find(|l| l.starts_with("# "))
        .map(|l| l.trim_start_matches('#').trim().to_string())
        .unwrap_or_default();
    let clean: String = title
        .chars()
        .filter(|c| {
            !matches!(
                c,
                '/' | '\\' | ':' | '*' | '?' | '"' | '<' | '>' | '|' | '['
            )
        })
        .collect();
    let clean: String = clean.trim().chars().take(60).collect();
    if clean.trim().is_empty() {
        "Untitled".into()
    } else {
        clean.trim().to_string()
    }
}

/// Instructions plus the user's global and project instructions.
fn system_for(
    task: &str,
    extra: &str,
    global: &str,
    project: Option<&projects::Project>,
) -> String {
    let mut s = String::from(task);
    if !extra.trim().is_empty() {
        s.push_str(&format!(
            "\n\n## Extra instructions for this run\n{}",
            extra.trim()
        ));
    }
    if !global.trim().is_empty() {
        s.push_str(&format!(
            "\n\n## User's global instructions\n{}",
            global.trim()
        ));
    }
    if let Some(p) = project.filter(|p| !p.instructions.trim().is_empty()) {
        s.push_str(&format!(
            "\n\n## Project instructions ({})\n{}",
            p.name,
            p.instructions.trim()
        ));
    }
    s
}

fn tool_call(name: &str, args: serde_json::Value) -> ToolCall {
    ToolCall {
        id: format!("skill-{name}"),
        name: name.into(),
        arguments: args.to_string(),
    }
}

/// The instruction for rewriting one note.
fn rewrite_task(instruction: &str) -> String {
    format!(
        "You are the editing assistant inside Mimer, a Markdown note-taking app.\nTask: {}\nYou receive ONE note. Return the COMPLETE new note and nothing else: no explanation, no preamble, no code fences. Keep the front matter, the [[wiki-links]] and the #tags unless the task says otherwise. Never invent facts. Write in the language the task asks for; if it names none, keep the language of the note.",
        instruction.trim()
    )
}

/// The instruction for choosing a folder for one note; `used` are folders chosen earlier.
fn sort_task(instruction: &str, used: &[String]) -> String {
    let mut task = format!(
        "You file notes into folders for a Markdown notes app.\nTask: {}\nYou receive ONE note. Answer with ONLY the name of the folder it belongs in, on one line: one or two levels at most, for example `Vendors` or `Customers/Acme`. No explanation, no quotes, no file name.",
        instruction.trim()
    );
    if !used.is_empty() {
        task.push_str(&format!(
            "\nFolders already in use (reuse one when the note fits): {}.",
            used.join(", ")
        ));
    }
    task
}

/// The instruction for writing one note from several.
fn create_task(instruction: &str) -> String {
    format!(
        "You are the writing assistant inside Mimer, a Markdown note-taking app.\nTask: {}\nYou receive several source notes. Write ONE new note. The first line must be a title as `# Title`. Use only information that is in the source notes, and link a source with [[Note name]] where it helps. Return only the note: no preamble and no code fences. Write in the language the task asks for; if it names none, use the language of the notes.",
        instruction.trim()
    )
}

/// One call to the model with a system and a user message, and the whole answer back.
async fn ask_model(
    client: &reqwest::Client,
    provider: &router::NotesProvider,
    key: Option<&str>,
    cancel: &CancellationToken,
    system: String,
    user: String,
) -> AppResult<String> {
    let llm = LlmRequest {
        system,
        messages: vec![ChatMessage::user(user)],
        tools: vec![],
        temperature: TEMPERATURE,
    };
    let resp = providers::chat(client, provider, key, &llm, cancel, &mut |_| {}).await?;
    Ok(resp.text)
}

/// The instruction for listing small corrections in part of a note.
fn fix_task(instruction: &str) -> String {
    format!(
        "You proofread notes for a Markdown notes app.\nTask: {}\nYou receive PART of one note. List ONLY the corrections, one per line, in exactly this form:\nwrong text => corrected text\nCopy the wrong text exactly as it is written in the note; add a few words around it when the same words occur more than once. Do not list text that is already correct. Do not change names, numbers, links or tags. No explanation. If nothing needs fixing, answer NONE.",
        instruction.trim()
    )
}

/// The `3.` or `12)` at the start of a list item, with the dot or bracket.
fn list_number(text: &str) -> Option<&str> {
    let t = text.trim_start();
    let digits = t.chars().take_while(char::is_ascii_digit).count();
    let mark = t[digits..].chars().next()?;
    let after = t[digits + mark.len_utf8()..].chars().next();
    (digits > 0 && matches!(mark, '.' | ')') && after.is_some_and(char::is_whitespace))
        .then(|| &t[..digits + mark.len_utf8()])
}

/// Reads "wrong => right" lines from the model's answer. Lines in another form are ignored.
pub fn parse_fixes(answer: &str) -> Vec<(String, String)> {
    let mut out = Vec::new();
    for line in strip_fence(answer).lines() {
        let line = line.trim().trim_start_matches(['-', '*', '•']).trim();
        let Some((wrong, right)) = ["=>", "→", "->"]
            .iter()
            .find_map(|sep| line.split_once(sep))
        else {
            continue;
        };
        // "1. wrong => right": the list number is not part of the wrong text. When the right
        // text starts with the same number ("3. gang => 3. gang"), it belongs to the note.
        let wrong = match list_number(wrong) {
            Some(n) if list_number(right) != Some(n) => wrong.trim_start()[n.len()..].trim_start(),
            _ => wrong,
        };
        let clean = |t: &str| {
            t.trim()
                .trim_matches(|c| matches!(c, '"' | '`' | '\'' | '“' | '”'))
                .to_string()
        };
        let (wrong, right) = (clean(wrong), clean(right));
        if wrong.is_empty() || wrong == right || wrong.contains('\n') {
            continue;
        }
        // A "fix" that is a whole paragraph, or adds much more text, is not a small fix.
        if wrong.chars().count() > 300 || right.chars().count() > wrong.chars().count() * 3 + 40 {
            continue;
        }
        out.push((wrong, right));
    }
    out
}

/// Puts the fixes into `text` where the wrong text stands on its own (not inside a longer
/// word). Returns the new text and how many places were changed.
pub fn apply_fixes(text: &str, fixes: &[(String, String)]) -> (String, usize) {
    let mut out = text.to_string();
    let mut changed = 0;
    for (wrong, right) in fixes {
        let starts_word = wrong.chars().next().is_some_and(char::is_alphanumeric);
        let ends_word = wrong.chars().last().is_some_and(char::is_alphanumeric);
        let mut result = String::with_capacity(out.len());
        let mut last = 0;
        for (at, _) in out.match_indices(wrong.as_str()) {
            if at < last {
                continue;
            }
            let before = out[..at].chars().last();
            let after = out[at + wrong.len()..].chars().next();
            let alone = !(starts_word && before.is_some_and(char::is_alphanumeric))
                && !(ends_word && after.is_some_and(char::is_alphanumeric));
            if !alone {
                continue;
            }
            result.push_str(&out[last..at]);
            result.push_str(right);
            last = at + wrong.len();
            changed += 1;
        }
        result.push_str(&out[last..]);
        out = result;
    }
    (out, changed)
}

/// Splits a note into pieces for proofreading, in order: `(text, send)`. The properties block
/// and code blocks are never sent; the rest is cut at blank lines into pieces of about `limit`
/// characters. Joining the pieces gives the note back exactly.
pub fn proofread_pieces(text: &str, limit: usize) -> Vec<(String, bool)> {
    let mut pieces: Vec<(String, bool)> = Vec::new();
    let start = crate::markdown::frontmatter::split(text).map_or(0, |f| f.end);
    if start > 0 {
        pieces.push((text[..start].to_string(), false));
    }
    let mut current = String::new();
    let mut in_code = false;
    let push = |cur: &mut String, send: bool, pieces: &mut Vec<(String, bool)>| {
        if !cur.is_empty() {
            pieces.push((std::mem::take(cur), send));
        }
    };
    for line in text[start..].split_inclusive('\n') {
        let fence = {
            let t = line.trim_start();
            t.starts_with("```") || t.starts_with("~~~")
        };
        if fence && !in_code {
            push(&mut current, true, &mut pieces);
            in_code = true;
            current.push_str(line);
            continue;
        }
        if in_code {
            current.push_str(line);
            if fence {
                push(&mut current, false, &mut pieces);
                in_code = false;
            }
            continue;
        }
        current.push_str(line);
        let long = current.chars().count();
        if (long >= limit && line.trim().is_empty()) || long >= limit * 2 {
            push(&mut current, true, &mut pieces);
        }
    }
    let send = !in_code;
    push(&mut current, send, &mut pieces);
    pieces
}

/// Everything one run needs.
struct Run<'a> {
    /// Progress goes here; `None` for a preview.
    channel: Option<&'a Channel<ChatEvent>>,
    cancel: &'a CancellationToken,
    provider: router::NotesProvider,
    key: Option<String>,
    client: reqwest::Client,
    vault: std::sync::Arc<OpenVault>,
    scope: Option<String>,
    global: String,
    project: Option<projects::Project>,
    skill: Skill,
    extra: String,
    /// Characters of one note that fit in a step of this model.
    note_limit: usize,
}

impl Run<'_> {
    async fn ask(&self, system: String, user: String) -> AppResult<String> {
        ask_model(
            &self.client,
            &self.provider,
            self.key.as_deref(),
            self.cancel,
            system,
            user,
        )
        .await
    }

    fn system(&self, task: &str) -> String {
        system_for(task, &self.extra, &self.global, self.project.as_ref())
    }

    fn step(&self, i: usize, n: usize, detail: String) {
        let Some(channel) = self.channel else { return };
        let _ = channel.send(ChatEvent::Step {
            step: u32::try_from(i).unwrap_or(u32::MAX),
            max: u32::try_from(n).unwrap_or(u32::MAX),
        });
        let _ = channel.send(ChatEvent::ToolStart {
            name: "skill".into(),
            detail,
        });
    }

    fn propose(&self, set: &mut ProposalSet, call: &ToolCall) -> Result<(), String> {
        let out = tools::execute(&self.vault, self.scope.as_deref(), set, call);
        if out.result.starts_with("Error") {
            Err(out.result.trim_start_matches("Error: ").to_string())
        } else {
            Ok(())
        }
    }

    /// Proposes `text` as the new content of `path`, with the checks against `original`.
    fn propose_edit(
        &self,
        set: &mut ProposalSet,
        path: &str,
        original: &str,
        text: &str,
    ) -> Result<(), String> {
        let call = tool_call(
            "propose_edit",
            json!({"path": path, "new_content": text, "reason": self.skill.name}),
        );
        self.propose(set, &call)?;
        let checks = super::checks::check_change(original, text);
        if let Some(p) = set.proposals.iter_mut().find(|p| p.path == path) {
            p.checks = checks;
        }
        Ok(())
    }

    /// The whole note rewritten by the model, or why it is not used.
    async fn rewrite_text(&self, original: &str) -> AppResult<Result<String, String>> {
        if original.chars().count() > self.note_limit {
            return Ok(Err("too long to rewrite in one step".into()));
        }
        let system = self.system(&rewrite_task(&self.skill.instruction));
        let answer = self.ask(system, original.to_string()).await?;
        if self.cancel.is_cancelled() {
            // Stop returns what was written so far; half a note is never proposed.
            return Ok(Err("stopped before the answer was complete".into()));
        }
        Ok(accept_rewrite(original, &answer).map_err(str::to_string))
    }

    /// The note with the model's small fixes put in, or why nothing changed.
    async fn fix_text(&self, original: &str) -> AppResult<Result<String, String>> {
        let system = self.system(&fix_task(&self.skill.instruction));
        let limit = (self.note_limit / 3).clamp(800, 3_000);
        let mut out = String::with_capacity(original.len());
        let mut changed = 0;
        for (piece, send) in proofread_pieces(original, limit) {
            if !send || piece.trim().is_empty() || self.cancel.is_cancelled() {
                out.push_str(&piece);
                continue;
            }
            let answer = self.ask(system.clone(), piece.clone()).await?;
            if self.cancel.is_cancelled() {
                return Ok(Err("stopped before the answer was complete".into()));
            }
            let (fixed, n) = apply_fixes(&piece, &parse_fixes(&answer));
            changed += n;
            out.push_str(&fixed);
        }
        Ok(if changed == 0 || out == original {
            Err("nothing to fix".into())
        } else {
            Ok(out)
        })
    }

    /// The folder the model chooses for one note, cleaned up.
    async fn choose_folder(&self, path: &str, content: &str, used: &[String]) -> AppResult<String> {
        let system = self.system(&sort_task(&self.skill.instruction, used));
        let user = format!(
            "Note name: {}\n\n{}",
            file_name(path).trim_end_matches(".md"),
            truncate_middle(content, SORT_PEEK_CHARS)
        );
        let answer = self.ask(system, user).await?;
        Ok(clean_folder(&answer, used))
    }

    /// Rewrite or fix every note, one at a time.
    async fn change_each(
        &self,
        targets: &[Target],
        set: &mut ProposalSet,
        fix: bool,
    ) -> AppResult<Vec<String>> {
        let mut notes: Vec<String> = Vec::new();
        let n = targets.len();
        for (i, t) in targets.iter().enumerate() {
            if self.cancel.is_cancelled() {
                break;
            }
            let verb = if fix { "Proofreading" } else { "Rewriting" };
            self.step(i + 1, n, format!("{verb} {}", t.path));
            let original = match fs_ops::read_note(&self.vault.root, &t.path) {
                Ok(note) => note.content,
                Err(_) => {
                    notes.push(format!("{}: could not be read", t.path));
                    continue;
                }
            };
            let result = if fix {
                self.fix_text(&original).await?
            } else {
                self.rewrite_text(&original).await?
            };
            if self.cancel.is_cancelled() {
                break;
            }
            match result {
                Ok(text) => {
                    if let Err(e) = self.propose_edit(set, &t.path, &original, &text) {
                        notes.push(format!("{}: {e}", t.path));
                    }
                }
                Err(why) => notes.push(format!("{}: {why}", t.path)),
            }
        }
        Ok(notes)
    }

    async fn sort(
        &self,
        targets: &[Target],
        set: &mut ProposalSet,
        used: &mut Vec<String>,
    ) -> AppResult<Vec<String>> {
        let mut notes: Vec<String> = Vec::new();
        let n = targets.len();
        for (i, t) in targets.iter().enumerate() {
            if self.cancel.is_cancelled() {
                break;
            }
            self.step(i + 1, n, format!("Choosing a folder for {}", t.path));
            let content = match fs_ops::read_note(&self.vault.root, &t.path) {
                Ok(note) => note.content,
                Err(_) => {
                    notes.push(format!("{}: could not be read", t.path));
                    continue;
                }
            };
            let folder = self.choose_folder(&t.path, &content, used).await?;
            if self.cancel.is_cancelled() {
                break;
            }
            if !used.contains(&folder) {
                used.push(folder.clone());
            }
            let dest = if t.base.is_empty() {
                format!("{folder}/{}", file_name(&t.path))
            } else {
                format!("{}/{folder}/{}", t.base, file_name(&t.path))
            };
            if dest == t.path {
                continue;
            }
            let call = tool_call(
                "propose_move",
                json!({"from": t.path, "to": dest, "reason": self.skill.name}),
            );
            if let Err(e) = self.propose(set, &call) {
                notes.push(format!("{}: {e}", t.path));
            }
        }
        Ok(notes)
    }

    /// The text of one new note written from the sources, or why there is none.
    async fn create_text(&self, targets: &[Target], notes: &mut Vec<String>) -> AppResult<String> {
        let mut sources = String::new();
        let budget = self.note_limit.saturating_mul(2);
        for t in targets {
            let Ok(note) = fs_ops::read_note(&self.vault.root, &t.path) else {
                notes.push(format!("{}: could not be read", t.path));
                continue;
            };
            let piece = format!(
                "## Source note: {}\n{}\n\n",
                t.path.trim_end_matches(".md"),
                truncate_middle(&note.content, CREATE_NOTE_CHARS)
            );
            if sources.chars().count() + piece.chars().count() > budget {
                notes.push(format!("{}: left out, there was no room for it", t.path));
                continue;
            }
            sources.push_str(&piece);
        }
        if sources.is_empty() {
            return Ok(String::new());
        }
        let system = self.system(&create_task(&self.skill.instruction));
        let answer = self.ask(system, sources).await?;
        Ok(strip_fence(&answer))
    }

    async fn create(&self, targets: &[Target], set: &mut ProposalSet) -> AppResult<Vec<String>> {
        let mut notes: Vec<String> = Vec::new();
        self.step(
            1,
            1,
            format!("Writing one note from {} notes", targets.len()),
        );
        let text = self.create_text(targets, &mut notes).await?;
        if self.cancel.is_cancelled() {
            return Ok(notes);
        }
        if text.trim().is_empty() {
            notes.push("the model gave no text".into());
            return Ok(notes);
        }
        let title = title_of(&text);
        let base = targets.first().map(|t| t.base.clone()).unwrap_or_default();
        let mut path = String::new();
        for n in 0..50 {
            let name = if n == 0 {
                format!("{title}.md")
            } else {
                format!("{title} {}.md", n + 1)
            };
            let candidate = if base.is_empty() {
                name
            } else {
                format!("{base}/{name}")
            };
            if !self.vault.root.join(&candidate).exists()
                && !set.proposals.iter().any(|p| p.path == candidate)
            {
                path = candidate;
                break;
            }
        }
        if path.is_empty() {
            notes.push("no free name for the new note".into());
            return Ok(notes);
        }
        let call = tool_call(
            "propose_create",
            json!({"path": path, "content": format!("{}\n", text.trim_end()), "reason": self.skill.name}),
        );
        if let Err(e) = self.propose(set, &call) {
            notes.push(e);
        }
        Ok(notes)
    }
}

/// Notes a long run does first, so the user can check the skill before it does the rest.
pub const TRIAL_NOTES: usize = 3;

/// The notes of a continued run, checked again: each must still be a note inside the scope.
fn continue_targets(
    root: &std::path::Path,
    scope: Option<&str>,
    list: &[super::RunTarget],
) -> (Vec<Target>, Vec<String>) {
    let mut out = Vec::new();
    let mut skipped = Vec::new();
    for t in list {
        let base_ok = (t.base.is_empty() && scope.is_none())
            || paths::resolve_dir(root, &t.base, scope).is_ok_and(|p| p.is_dir());
        let note_ok = is_markdown(&t.path)
            && paths::resolve(root, &t.path, scope).is_ok_and(|p| p.is_file())
            && (t.base.is_empty() || t.path.starts_with(&format!("{}/", t.base)));
        if base_ok && note_ok {
            out.push(Target {
                path: t.path.clone(),
                base: t.base.clone(),
            });
        } else {
            skipped.push(format!("{} is no longer a note in this scope", t.path));
        }
    }
    (out, skipped)
}

/// Runs a skill that is not of kind `answer`, streaming progress and a short report.
pub async fn run_skill<R: Runtime>(
    app: &AppHandle<R>,
    req: &ChatRequest,
    skill: Skill,
    channel: &Channel<ChatEvent>,
    cancel: &CancellationToken,
) -> AppResult<()> {
    let state = app.state::<AppState>();
    let vault = state.current_vault()?;
    let settings = state.settings_snapshot();
    // A continued run uses the project of the trial, not of whatever is open now.
    let anchor = req
        .skill_continue
        .as_ref()
        .and_then(|c| c.anchor.as_deref())
        .or(req.note_path.as_deref())
        .or(req.folder.as_deref())
        .filter(|a| !a.is_empty());
    let all_projects = vault.project_list();
    let project = anchor
        .and_then(|a| projects::for_path(&all_projects, a))
        .cloned();
    // Notes only go to a local provider; a cloud provider is refused here.
    let provider = router::select_for_project(&settings, project.as_ref())?;
    let cfg = provider.config().clone();
    crate::engine::service::require_awake(&state, &cfg)?;
    crate::foundry::service::require_awake(&state, &cfg)?;
    crate::engine::service::touch(&state);
    crate::foundry::service::touch(&state);
    let scope = project.as_ref().map(|p| p.folder.clone());

    let current = if req.include_current_note {
        req.note_path.as_deref()
    } else {
        None
    };
    let continued = req.skill_continue.as_ref();
    let (mut targets, skipped) = match continued {
        Some(c) => continue_targets(&vault.root, scope.as_deref(), &c.targets),
        None => collect_targets(
            &vault.root,
            scope.as_deref(),
            &req.mentions,
            current,
            req.folder.as_deref().filter(|_| req.note_path.is_none()),
        ),
    };
    let say = |text: String| {
        let _ = channel.send(ChatEvent::TextDelta { text });
    };
    if targets.is_empty() {
        let mut text = format!(
            "**{}** needs notes to work on. Attach a note or a folder with `/`, or open a note or select a folder, and run it again.",
            skill.name
        );
        for line in skipped.iter().filter(|l| !l.starts_with("no folder")) {
            text.push_str(&format!("\n- {line}"));
        }
        say(text);
        let _ = channel.send(ChatEvent::Done);
        return Ok(());
    }
    let limit = match skill.kind {
        SkillKind::Rewrite | SkillKind::Fix => MAX_REWRITE,
        SkillKind::Sort => MAX_SORT,
        _ => MAX_CREATE,
    };
    let mut report: Vec<String> = skipped;
    if targets.len() > limit {
        report.push(format!(
            "{} notes were chosen, but one run takes at most {limit}. The first {limit} were used; run it again for the rest.",
            targets.len()
        ));
        targets.truncate(limit);
    }
    // A long run starts with a few notes, so a skill that does the wrong thing is found early.
    let total = targets.len();
    let trial = continued.is_none()
        && matches!(
            skill.kind,
            SkillKind::Rewrite | SkillKind::Fix | SkillKind::Sort
        )
        && total > TRIAL_NOTES + 2;
    let rest: Vec<Target> = if trial {
        targets.split_off(TRIAL_NOTES)
    } else {
        Vec::new()
    };
    let note_limit = ((cfg.context_tokens as usize).saturating_mul(4) * 2 / 5).min(NOTE_CHAR_LIMIT);
    let run = Run {
        channel: Some(channel),
        cancel,
        key: keychain::get_key(&cfg.id),
        provider,
        client: http_client()?,
        vault: vault.clone(),
        scope,
        global: settings.ai.global_instructions.clone(),
        project,
        extra: continued
            .and_then(|c| c.skill_input.clone())
            .or_else(|| req.skill_input.clone())
            .unwrap_or_default(),
        note_limit: note_limit.max(1_000),
        skill: skill.clone(),
    };
    let mut set = ProposalSet::new(run.scope.clone());
    let mut used: Vec<String> = continued.map(|c| c.folders.clone()).unwrap_or_default();
    let outcome = match skill.kind {
        SkillKind::Rewrite => run.change_each(&targets, &mut set, false).await,
        SkillKind::Fix => run.change_each(&targets, &mut set, true).await,
        SkillKind::Sort => run.sort(&targets, &mut set, &mut used).await,
        SkillKind::Create => run.create(&targets, &mut set).await,
        SkillKind::Answer => Ok(Vec::new()),
    };
    let (notes, failure): (Vec<String>, Option<AppError>) = match outcome {
        Ok(n) => (n, None),
        Err(e) => (Vec::new(), Some(e)),
    };
    report.extend(notes);

    let count = set.proposals.len();
    let flagged = set
        .proposals
        .iter()
        .filter(|p| !super::checks::all_ok(&p.checks))
        .count();
    let plural = |n: usize| if n == 1 { "" } else { "s" };
    let mut text = if trial {
        format!(
            "**{}**: tried on the first {} of {total} notes, {count} proposed change{}. Look at them first; if they are right, continue with the other {}.",
            skill.name,
            targets.len(),
            plural(count),
            rest.len()
        )
    } else if count == 0 {
        format!("**{}**: nothing was proposed.", skill.name)
    } else {
        format!(
            "**{}**: {count} proposed change{}. Review them, then apply the ones you want.",
            skill.name,
            plural(count)
        )
    };
    if flagged > 0 {
        text.push_str(&format!(
            " {flagged} change{} did not pass Mimer's checks and {} not selected in the review.",
            plural(flagged),
            if flagged == 1 { "is" } else { "are" }
        ));
    }
    if cancel.is_cancelled() {
        text.push_str(" The run was stopped before it finished.");
    }
    if !report.is_empty() {
        text.push_str("\n\nLeft out:\n");
        for line in report.iter().take(30) {
            text.push_str(&format!("- {line}\n"));
        }
        if report.len() > 30 {
            text.push_str(&format!("- …and {} more\n", report.len() - 30));
        }
    }
    say(text);
    if count > 0 {
        let id = set.id;
        if let Ok(mut map) = state.proposals.lock() {
            map.insert(id, set);
        }
        let _ = channel.send(ChatEvent::ProposalsReady { set_id: id });
    }
    if trial && failure.is_none() && !cancel.is_cancelled() {
        let _ = channel.send(ChatEvent::SkillTrial {
            skill_id: skill.id.clone(),
            skill_name: skill.name.clone(),
            done: u32::try_from(targets.len()).unwrap_or(u32::MAX),
            total: u32::try_from(total).unwrap_or(u32::MAX),
            rest: rest
                .into_iter()
                .map(|t| super::RunTarget {
                    path: t.path,
                    base: t.base,
                })
                .collect(),
            folders: used,
            skill_input: req.skill_input.clone(),
            anchor: anchor.map(str::to_string),
        });
    }
    match failure {
        Some(e) => Err(e),
        None => {
            let _ = channel.send(ChatEvent::Done);
            Ok(())
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn vault() -> tempfile::TempDir {
        let d = tempfile::tempdir().unwrap();
        let r = d.path();
        std::fs::create_dir_all(r.join("Work/Sec")).unwrap();
        std::fs::write(r.join("Home.md"), "# Home").unwrap();
        std::fs::write(r.join("Work/Plan.md"), "# Plan").unwrap();
        std::fs::write(r.join("Work/Sec/Keys.md"), "# Keys").unwrap();
        std::fs::write(r.join("Work/photo.png"), "png").unwrap();
        d
    }

    fn v(items: &[&str]) -> Vec<String> {
        items.iter().map(|s| s.to_string()).collect()
    }

    #[test]
    fn a_folder_gives_every_note_below_it() {
        let d = vault();
        let (t, skipped) = collect_targets(d.path(), None, &v(&["Work"]), None, None);
        let names: Vec<&str> = t.iter().map(|x| x.path.as_str()).collect();
        assert_eq!(names, vec!["Work/Plan.md", "Work/Sec/Keys.md"]);
        assert!(t.iter().all(|x| x.base == "Work"));
        assert!(skipped.is_empty());
    }

    #[test]
    fn attached_notes_win_over_the_open_note_and_the_folder() {
        let d = vault();
        let (t, _) = collect_targets(d.path(), None, &v(&["Home.md"]), Some("Work/Plan.md"), None);
        assert_eq!(t.len(), 1);
        assert_eq!(t[0].path, "Home.md");
        assert_eq!(t[0].base, "");
        let (t, _) = collect_targets(d.path(), None, &[], Some("Work/Plan.md"), Some("Work"));
        assert_eq!(t[0].path, "Work/Plan.md");
        assert_eq!(t[0].base, "Work");
        let (t, _) = collect_targets(d.path(), None, &[], None, Some("Work"));
        assert_eq!(t.len(), 2);
    }

    #[test]
    fn nothing_outside_the_scope_is_used() {
        let d = vault();
        let (t, skipped) = collect_targets(
            d.path(),
            Some("Work/Sec"),
            &v(&["Home.md", "Work/Sec/Keys.md", "Work"]),
            None,
            None,
        );
        let names: Vec<&str> = t.iter().map(|x| x.path.as_str()).collect();
        assert_eq!(names, vec!["Work/Sec/Keys.md"]);
        assert_eq!(skipped.len(), 2);
    }

    #[test]
    fn a_code_fence_around_the_answer_is_removed() {
        assert_eq!(strip_fence("```markdown\n# A\n\ntext\n```"), "# A\n\ntext");
        assert_eq!(strip_fence("  plain  "), "plain");
        assert_eq!(strip_fence("```\n```"), "");
    }

    #[test]
    fn a_rewrite_is_checked_before_it_is_proposed() {
        let old = "# Note\n\nsome text\n";
        assert_eq!(
            accept_rewrite(old, "# Note\n\nbetter text"),
            Ok("# Note\n\nbetter text\n".to_string())
        );
        assert_eq!(accept_rewrite(old, "  "), Err("the model gave no text"));
        assert_eq!(
            accept_rewrite(old, "# Note\n\nsome text"),
            Err("the model returned the note unchanged (it may already be fine)")
        );
        let long = "word ".repeat(100);
        assert!(accept_rewrite(&long, "short").is_err());
        assert!(accept_rewrite("hi", "hello").is_ok());
    }

    #[test]
    fn folder_answers_are_cleaned() {
        let known = v(&["Vendors"]);
        assert_eq!(clean_folder("vendors", &known), "Vendors");
        assert_eq!(
            clean_folder("`Customers/Acme/Deep/Deeper`", &known),
            "Customers/Acme"
        );
        assert_eq!(
            clean_folder("Folder: Meetings\nbecause it is", &known),
            "Meetings"
        );
        assert_eq!(clean_folder("  \n", &known), "Miscellaneous");
        assert_eq!(clean_folder("a:b*c", &known), "abc");
        assert_eq!(clean_folder("../../etc", &known), "etc");
        assert!(clean_folder(&"x".repeat(200), &known).chars().count() <= 40);
    }

    #[test]
    fn the_title_of_a_new_note_becomes_its_file_name() {
        assert_eq!(title_of("# Summary: Q1/Q2\n\ntext"), "Summary Q1Q2");
        assert_eq!(title_of("no heading"), "Untitled");
        assert_eq!(title_of("intro\n# Real title\n"), "Real title");
    }

    #[test]
    fn instructions_are_added_in_order() {
        let s = system_for("Task.", "Be brief.", "Global.", None);
        assert!(s.starts_with("Task."));
        assert!(s.find("Be brief.").unwrap() < s.find("Global.").unwrap());
    }

    // ---- end to end: the whole run against a fake model server --------------------------

    use crate::ai::ChatMessageIn;
    use serde_json::Value;
    use std::io::{Read, Write};
    use std::sync::{Arc, Mutex};

    /// How long the fake model waits before it answers (milliseconds), for the stop test.
    static REPLY_DELAY_MS: std::sync::atomic::AtomicU64 = std::sync::atomic::AtomicU64::new(0);

    /// A model server that answers like a tiny model would, depending on the skill's prompt.
    fn fake_model() -> u16 {
        let listener = std::net::TcpListener::bind("127.0.0.1:0").unwrap();
        let port = listener.local_addr().unwrap().port();
        std::thread::spawn(move || {
            for stream in listener.incoming() {
                let Ok(mut stream) = stream else { continue };
                std::thread::spawn(move || {
                    let mut buf = Vec::new();
                    let mut chunk = [0u8; 4096];
                    let (head_end, len) = loop {
                        let n = stream.read(&mut chunk).unwrap_or(0);
                        if n == 0 {
                            return;
                        }
                        buf.extend_from_slice(&chunk[..n]);
                        if let Some(i) = buf.windows(4).position(|w| w == b"\r\n\r\n") {
                            let head = String::from_utf8_lossy(&buf[..i]).to_lowercase();
                            let len = head
                                .lines()
                                .find_map(|l| l.strip_prefix("content-length:"))
                                .and_then(|v| v.trim().parse::<usize>().ok())
                                .unwrap_or(0);
                            break (i + 4, len);
                        }
                    };
                    while buf.len() < head_end + len {
                        let n = stream.read(&mut chunk).unwrap_or(0);
                        if n == 0 {
                            break;
                        }
                        buf.extend_from_slice(&chunk[..n]);
                    }
                    let body: Value = serde_json::from_slice(&buf[head_end..]).unwrap_or_default();
                    let msgs = body["messages"].as_array().cloned().unwrap_or_default();
                    let system = msgs
                        .iter()
                        .find(|m| m["role"] == "system")
                        .and_then(|m| m["content"].as_str())
                        .unwrap_or("")
                        .to_string();
                    let user = msgs
                        .iter()
                        .rfind(|m| m["role"] == "user")
                        .and_then(|m| m["content"].as_str())
                        .unwrap_or("")
                        .to_string();
                    let answer = if system.contains("proofread notes") {
                        if user.contains("teh") {
                            "1. teh => the\n- wrold → world\nThis line is ignored".to_string()
                        } else {
                            "NONE".to_string()
                        }
                    } else if system.contains("editing assistant") {
                        format!("```markdown\n{}\nREWRITTEN\n```", user.trim_end())
                    } else if system.contains("file notes into folders") {
                        if user.to_lowercase().contains("key") {
                            "Vendors".to_string()
                        } else {
                            "Folder: Notes/Other".to_string()
                        }
                    } else if system.contains("ONE new note") {
                        "# Overview\n\nAll the notes in short.".to_string()
                    } else {
                        "I do not know".to_string()
                    };
                    let chunk = serde_json::json!({
                        "choices": [{"index": 0, "delta": {"content": answer}, "finish_reason": null}]
                    });
                    let delay = REPLY_DELAY_MS.load(std::sync::atomic::Ordering::Relaxed);
                    if delay > 0 {
                        std::thread::sleep(std::time::Duration::from_millis(delay));
                    }
                    let reply = format!(
                        "HTTP/1.1 200 OK\r\nContent-Type: text/event-stream\r\nConnection: close\r\n\r\ndata: {chunk}\n\ndata: [DONE]\n\n"
                    );
                    let _ = stream.write_all(reply.as_bytes());
                });
            }
        });
        port
    }

    struct Harness {
        app: tauri::App<tauri::test::MockRuntime>,
        _dir: tempfile::TempDir,
        events: Arc<Mutex<Vec<Value>>>,
    }

    fn harness(files: &[(&str, &str)]) -> Harness {
        let dir = tempfile::tempdir().unwrap();
        for (path, text) in files {
            let abs = dir.path().join(path);
            std::fs::create_dir_all(abs.parent().unwrap()).unwrap();
            std::fs::write(abs, text).unwrap();
        }
        let port = fake_model();
        let mut settings = crate::settings::Settings::default();
        settings.ai.default_provider_id = "lmstudio-default".into();
        for p in &mut settings.ai.providers {
            if p.id == "lmstudio-default" {
                p.base_url = format!("http://127.0.0.1:{port}/v1");
                p.model = "fake".into();
            }
        }
        let app = tauri::test::mock_app();
        app.handle().manage(AppState::new(
            settings,
            dir.path().join("settings.json"),
            None,
        ));
        let vault = crate::vault::open_for_test(dir.path());
        *app.state::<AppState>().vault.write().unwrap() = Some(Arc::new(vault));
        Harness {
            app,
            _dir: dir,
            events: Arc::new(Mutex::new(Vec::new())),
        }
    }

    impl Harness {
        fn request(&self, mentions: &[&str]) -> ChatRequest {
            ChatRequest {
                messages: vec![ChatMessageIn {
                    role: crate::ai::ChatRole::User,
                    content: "Skill".into(),
                    activity: vec![],
                }],
                include_current_note: false,
                note_path: None,
                folder: None,
                selection: None,
                mentions: v(mentions),
                skill: None,
                skill_input: None,
                skill_continue: None,
            }
        }

        async fn run(&self, kind: SkillKind, instruction: &str, req: ChatRequest) {
            self.run_with(kind, instruction, req, &CancellationToken::new())
                .await;
        }

        async fn run_with(
            &self,
            kind: SkillKind,
            instruction: &str,
            req: ChatRequest,
            cancel: &CancellationToken,
        ) {
            let events = self.events.clone();
            let channel = Channel::new(move |body| {
                if let tauri::ipc::InvokeResponseBody::Json(j) = body {
                    events
                        .lock()
                        .unwrap()
                        .push(serde_json::from_str(&j).unwrap());
                }
                Ok(())
            });
            let skill = Skill {
                id: "u".into(),
                name: "Test skill".into(),
                description: String::new(),
                kind,
                applies_to: crate::skills::SkillTarget::Both,
                instruction: instruction.into(),
                builtin: false,
            };
            run_skill(self.app.handle(), &req, skill, &channel, cancel)
                .await
                .unwrap();
        }

        fn text(&self) -> String {
            self.events
                .lock()
                .unwrap()
                .iter()
                .filter(|e| e["type"] == "textDelta")
                .map(|e| e["text"].as_str().unwrap_or("").to_string())
                .collect()
        }

        fn proposals(&self) -> Vec<crate::ai::proposals::Proposal> {
            let state = self.app.state::<AppState>();
            let map = state.proposals.lock().unwrap();
            map.values().flat_map(|s| s.proposals.clone()).collect()
        }
    }

    #[tokio::test(flavor = "multi_thread")]
    async fn a_rewrite_skill_proposes_an_edit_for_every_note_even_from_a_model_that_only_talks() {
        let h = harness(&[
            ("Work/A.md", "# A\n\nfirst note\n"),
            ("Work/B.md", "# B\n\nsecond note\n"),
        ]);
        h.run(SkillKind::Rewrite, "Improve it.", h.request(&["Work"]))
            .await;
        let props = h.proposals();
        assert_eq!(props.len(), 2, "{}", h.text());
        for p in &props {
            assert_eq!(p.action, crate::ai::proposals::ProposalAction::Edit);
            let text = p.content.as_deref().unwrap();
            // The code fence the model added is gone; the original text is kept.
            assert!(
                text.ends_with("REWRITTEN\n") && !text.contains("```"),
                "{text}"
            );
            assert!(p.original.as_deref().unwrap().contains("note"));
        }
        assert!(h.text().contains("2 proposed changes"), "{}", h.text());
        let events = h.events.lock().unwrap();
        assert!(events.iter().any(|e| e["type"] == "proposalsReady"));
        assert!(events.iter().any(|e| e["type"] == "done"));
        assert!(events.iter().any(|e| e["type"] == "step"));
    }

    #[tokio::test(flavor = "multi_thread")]
    async fn a_sort_skill_moves_every_note_into_the_folder_the_model_names() {
        let h = harness(&[
            ("Inbox/KeyBridge.md", "# KeyBridge\n\nkey vendor"),
            ("Inbox/Husk.md", "# Husk\n\nbuy milk"),
        ]);
        h.run(SkillKind::Sort, "Sort them.", h.request(&["Inbox"]))
            .await;
        let mut moves: Vec<(String, String)> = h
            .proposals()
            .into_iter()
            .map(|p| (p.path, p.new_path.unwrap()))
            .collect();
        moves.sort();
        assert_eq!(
            moves,
            vec![
                (
                    "Inbox/Husk.md".to_string(),
                    "Inbox/Notes/Other/Husk.md".to_string()
                ),
                (
                    "Inbox/KeyBridge.md".to_string(),
                    "Inbox/Vendors/KeyBridge.md".to_string()
                ),
            ],
            "{}",
            h.text()
        );
    }

    #[tokio::test(flavor = "multi_thread")]
    async fn a_create_skill_proposes_one_new_note_next_to_the_sources() {
        let h = harness(&[("Work/A.md", "# A\n\none"), ("Work/B.md", "# B\n\ntwo")]);
        h.run(SkillKind::Create, "Summarise.", h.request(&["Work"]))
            .await;
        let props = h.proposals();
        assert_eq!(props.len(), 1, "{}", h.text());
        assert_eq!(
            props[0].action,
            crate::ai::proposals::ProposalAction::Create
        );
        assert_eq!(props[0].path, "Work/Overview.md");
        assert!(props[0]
            .content
            .as_deref()
            .unwrap()
            .starts_with("# Overview"));
    }

    #[tokio::test(flavor = "multi_thread")]
    async fn a_skill_without_notes_says_what_to_attach_and_changes_nothing() {
        let h = harness(&[("Work/A.md", "# A")]);
        h.run(SkillKind::Rewrite, "Improve it.", h.request(&[]))
            .await;
        assert!(h.proposals().is_empty());
        assert!(h.text().contains("needs notes to work on"), "{}", h.text());
    }

    #[test]
    fn fixes_are_read_from_loose_lines_and_put_in_only_where_the_word_stands_alone() {
        let fixes =
            parse_fixes("```\n1. fejlde => fejlede\n- passe → passer\nNONE\nwrong -> wrong\n```");
        assert_eq!(
            fixes,
            vec![
                ("fejlde".to_string(), "fejlede".to_string()),
                ("passe".to_string(), "passer".to_string())
            ]
        );
        let (text, n) = apply_fixes("Det fejlde. Det passe ikke, men passer nu.", &fixes);
        assert_eq!(text, "Det fejlede. Det passer ikke, men passer nu.");
        assert_eq!(n, 2);
        // A paragraph-sized "fix" is not a small fix.
        let long = format!("a => {}", "b ".repeat(200));
        assert!(parse_fixes(&long).is_empty());
    }

    #[test]
    fn a_note_is_cut_into_pieces_that_join_back_exactly_and_skip_code() {
        let note = format!(
            "---\ntags: [x]\n---\n# Title\n\n{}\n\n```\ncode teh\n```\n\n{}\n",
            "word ".repeat(300),
            "more ".repeat(300)
        );
        let pieces = proofread_pieces(&note, 800);
        let joined: String = pieces.iter().map(|(t, _)| t.as_str()).collect();
        assert_eq!(joined, note);
        assert!(!pieces[0].1, "the properties are not sent");
        assert!(pieces
            .iter()
            .any(|(t, send)| t.contains("code teh") && !send));
        assert!(pieces.iter().filter(|(_, send)| *send).count() >= 2);
    }

    #[tokio::test(flavor = "multi_thread")]
    async fn a_fix_skill_changes_only_the_listed_words_and_attaches_its_checks() {
        let h = harness(&[
            (
                "Work/A.md",
                "# A\n\nteh wrold of [[Prisliste]] on 31 May\n\n```\nteh code\n```\n",
            ),
            ("Work/B.md", "# B\n\nall fine\n"),
        ]);
        h.run(SkillKind::Fix, "Fix spelling.", h.request(&["Work"]))
            .await;
        let props = h.proposals();
        assert_eq!(props.len(), 1, "{}", h.text());
        let text = props[0].content.as_deref().unwrap();
        assert!(
            text.contains("the world of [[Prisliste]] on 31 May"),
            "{text}"
        );
        assert!(
            text.contains("teh code"),
            "code is never sent or changed: {text}"
        );
        assert!(
            crate::ai::checks::all_ok(&props[0].checks),
            "{:?}",
            props[0].checks
        );
        assert!(
            h.text().contains("Work/B.md: nothing to fix"),
            "{}",
            h.text()
        );
    }

    #[tokio::test(flavor = "multi_thread")]
    async fn a_long_run_does_three_notes_first_and_continues_with_the_rest() {
        let files: Vec<(String, String)> = (1..=7)
            .map(|i| (format!("Inbox/N{i}.md"), format!("# N{i}\n\nnote {i}\n")))
            .collect();
        let refs: Vec<(&str, &str)> = files
            .iter()
            .map(|(a, b)| (a.as_str(), b.as_str()))
            .collect();
        let h = harness(&refs);
        h.run(SkillKind::Sort, "Sort.", h.request(&["Inbox"])).await;
        assert_eq!(h.proposals().len(), 3, "{}", h.text());
        let trial = h
            .events
            .lock()
            .unwrap()
            .iter()
            .find(|e| e["type"] == "skillTrial")
            .cloned()
            .expect("a trial event");
        assert_eq!(trial["done"], 3);
        assert_eq!(trial["total"], 7);
        assert_eq!(trial["rest"].as_array().unwrap().len(), 4);
        assert!(
            h.text().contains("tried on the first 3 of 7"),
            "{}",
            h.text()
        );

        let rest: Vec<crate::ai::RunTarget> =
            serde_json::from_value(trial["rest"].clone()).unwrap();
        let folders: Vec<String> = serde_json::from_value(trial["folders"].clone()).unwrap();
        assert_eq!(folders, vec!["Notes/Other".to_string()]);
        let mut req = h.request(&[]);
        req.skill_continue = Some(crate::ai::SkillContinue {
            targets: rest,
            folders,
            skill_input: None,
            anchor: None,
        });
        h.events.lock().unwrap().clear();
        h.run(SkillKind::Sort, "Sort.", req).await;
        let all = h.proposals();
        assert_eq!(all.len(), 7, "{}", h.text());
        assert!(all.iter().all(|p| p
            .new_path
            .as_deref()
            .unwrap()
            .starts_with("Inbox/Notes/Other/")));
        assert!(!h
            .events
            .lock()
            .unwrap()
            .iter()
            .any(|e| e["type"] == "skillTrial"));
    }

    #[tokio::test(flavor = "multi_thread")]
    async fn a_continued_run_refuses_notes_outside_the_vault() {
        let h = harness(&[("Work/A.md", "# A\n\nteh\n")]);
        let mut req = h.request(&[]);
        req.skill_continue = Some(crate::ai::SkillContinue {
            targets: vec![
                crate::ai::RunTarget {
                    path: "../outside.md".into(),
                    base: String::new(),
                },
                crate::ai::RunTarget {
                    path: "Work/A.md".into(),
                    base: "Work".into(),
                },
            ],
            folders: vec![],
            skill_input: None,
            anchor: None,
        });
        h.run(SkillKind::Fix, "Fix.", req).await;
        assert_eq!(h.proposals().len(), 1);
        assert!(
            h.text().contains("../outside.md is no longer a note"),
            "{}",
            h.text()
        );
    }

    /// Runs the fix and rewrite recipes against a real local model. Start one first, then:
    /// `MIMER_REAL_MODEL=http://127.0.0.1:18931/v1 cargo test real_model -- --ignored --nocapture`
    #[tokio::test(flavor = "multi_thread")]
    #[ignore = "needs a running local model"]
    async fn real_model_fixes_and_checks() {
        let Ok(url) = std::env::var("MIMER_REAL_MODEL") else {
            return;
        };
        let note = "# Møde med acme\n\nmøde med acme i dag, tror det var tirsdag. de vil have ny licens til 40 brugere men vi har kun 25 i dag og det kan blive dyrt. husk at spørge peter om rabat inden fredag!! Se [[Prisliste]].\n\nglemte næsten, backup af filserveren fejlde igen i nat. 3. gang denne måned. loggen siger noget med disk fuld men der er 200 gb ledigt så det passe ikke. måske er det et rettigheds problem på share'n.\n\nkunde hos bygma ringede angående vpn. de kan ikke connecte fra hjemmekontor siden i mandags. de bruger stadig den gamle klient version 4.2 #kunder\n";
        let h = harness(&[("Work/Acme.md", note)]);
        {
            let state = h.app.state::<AppState>();
            let mut s = state.settings.write().unwrap();
            for p in &mut s.ai.providers {
                if p.id == "lmstudio-default" {
                    p.base_url = url.clone();
                }
            }
        }
        for (kind, instruction) in [
            (SkillKind::Fix, "Fix spelling and grammar. Keep my own words and the way I write."),
            (SkillKind::Rewrite, "Improve the structure of the note: clear headings, short paragraphs, and lists where they help. Keep all the information and do not add anything new."),
            (SkillKind::Rewrite, "Translate the note to English. Keep the names of people and companies, and the links."),
        ] {
            h.events.lock().unwrap().clear();
            {
                let state = h.app.state::<AppState>();
                state.proposals.lock().unwrap().clear();
            }
            let started = std::time::Instant::now();
            h.run(kind, instruction, h.request(&["Work/Acme.md"])).await;
            println!("\n===== {kind:?}: {instruction} ({:.1} s)", started.elapsed().as_secs_f32());
            println!("{}", h.text());
            for p in h.proposals() {
                println!("--- new text ---\n{}", p.content.as_deref().unwrap_or(""));
                for c in &p.checks {
                    println!("check {}: {} {}", c.label, c.ok, c.detail.as_deref().unwrap_or(""));
                }
            }
        }
    }

    #[test]
    fn a_list_number_is_dropped_but_a_number_that_belongs_to_the_note_is_kept() {
        let fixes = parse_fixes(
            "1. teh => the\n2) wrold => world\n3. gang denne maned => 3. gang denne måned\n- 12. 2024 => 12. 2025",
        );
        assert_eq!(
            fixes,
            vec![
                ("teh".to_string(), "the".to_string()),
                ("wrold".to_string(), "world".to_string()),
                (
                    "3. gang denne maned".to_string(),
                    "3. gang denne måned".to_string()
                ),
                ("12. 2024".to_string(), "12. 2025".to_string()),
            ]
        );
        let (text, _) = apply_fixes("3. gang denne maned", &fixes);
        assert_eq!(text, "3. gang denne måned");
    }

    #[test]
    fn nothing_chosen_is_not_the_whole_vault() {
        let d = tempfile::tempdir().unwrap();
        std::fs::create_dir_all(d.path().join("Work")).unwrap();
        std::fs::write(d.path().join("Work/A.md"), "# A").unwrap();
        let (t, skipped) = collect_targets(d.path(), None, &[], None, Some(""));
        assert!(t.is_empty());
        assert_eq!(skipped, vec!["no folder is chosen".to_string()]);
    }

    #[tokio::test(flavor = "multi_thread")]
    async fn stopping_a_run_proposes_nothing_from_a_half_finished_answer() {
        let h = harness(&[
            ("Work/A.md", "# A\n\nteh text\n"),
            ("Work/B.md", "# B\n\nteh more\n"),
        ]);
        REPLY_DELAY_MS.store(500, std::sync::atomic::Ordering::Relaxed);
        for kind in [
            SkillKind::Rewrite,
            SkillKind::Fix,
            SkillKind::Sort,
            SkillKind::Create,
        ] {
            let cancel = CancellationToken::new();
            let stopper = cancel.clone();
            tokio::spawn(async move {
                tokio::time::sleep(std::time::Duration::from_millis(150)).await;
                stopper.cancel();
            });
            h.run_with(kind, "Do it.", h.request(&["Work"]), &cancel)
                .await;
            assert!(h.proposals().is_empty(), "{kind:?}: {}", h.text());
        }
        REPLY_DELAY_MS.store(0, std::sync::atomic::Ordering::Relaxed);
    }

    #[tokio::test(flavor = "multi_thread")]
    async fn a_continued_run_keeps_the_project_of_the_trial_not_the_open_note() {
        let h = harness(&[]);
        let vault = h.app.state::<AppState>().current_vault().unwrap();
        crate::projects::service::create(&vault, "Sec", "Write formally.".into(), None).unwrap();
        crate::projects::service::create(&vault, "Other", String::new(), None).unwrap();
        std::fs::write(vault.root.join("Sec/A.md"), "# A\n\nteh\n").unwrap();
        std::fs::write(vault.root.join("Other/Home.md"), "# Home\n").unwrap();
        vault.refresh_files();
        let mut req = h.request(&[]);
        // A note in another project is open when "do the other notes" is pressed.
        req.note_path = Some("Other/Home.md".into());
        req.skill_continue = Some(crate::ai::SkillContinue {
            targets: vec![crate::ai::RunTarget {
                path: "Sec/A.md".into(),
                base: "Sec".into(),
            }],
            folders: vec![],
            skill_input: Some("keep British spelling".into()),
            anchor: Some("Sec/A.md".into()),
        });
        h.run(SkillKind::Fix, "Fix.", req).await;
        assert_eq!(h.proposals().len(), 1, "{}", h.text());
    }
}
