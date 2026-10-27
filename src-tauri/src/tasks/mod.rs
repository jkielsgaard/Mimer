//! Tasks that live in notes. A task is a Markdown checklist line (`- [ ] Title #tag made:2026-10-14`).
//! Under it, indented: checklist lines are its steps, list items that start with a date
//! (`- 2026-10-14 What happened`) are its log, and plain text lines are its note. Everything is
//! plain Markdown that reads well in any other editor. This module reads those lines and edits
//! them in place. The older forms, quote lines for the log (`> 2026-10-14 …`) and the note
//! (`> text`), are still read; a line Mimer writes uses the new form.

pub mod epics;
pub mod ideas;

use crate::error::{AppError, AppResult};
use regex::Regex;
use serde::{Deserialize, Serialize};
use std::sync::LazyLock;
use ts_rs::TS;

/// One step of a task: an indented checklist line.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct TaskStep {
    /// 0-based line in the note.
    pub line: u32,
    pub text: String,
    pub done: bool,
    /// A fingerprint of the line; an edit is refused when the line changed since it was read.
    pub key: String,
}

/// One dated line of a task's log.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct TaskLog {
    pub line: u32,
    /// `YYYY-MM-DD`.
    pub date: String,
    pub text: String,
    /// A fingerprint of the line; an edit is refused when the line changed since it was read.
    pub key: String,
}

/// A task found in a note.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct Task {
    pub path: String,
    /// 0-based line of the task in the note.
    pub line: u32,
    /// The last line of the task's block (steps and log).
    pub end: u32,
    pub key: String,
    /// The title, without the `#tags` and the `due:` / `plan:` / `status:` / `est:` words.
    pub title: String,
    pub done: bool,
    pub tags: Vec<String>,
    pub due: Option<String>,
    /// A date, or `later`: when the user wants to do it.
    pub plan: Option<String>,
    /// `doing`, `waiting`, `dropped` or another word the user wrote.
    pub status: Option<String>,
    pub est_minutes: Option<u32>,
    pub steps: Vec<TaskStep>,
    pub log: Vec<TaskLog>,
    /// The task's own note: the indented plain text lines (or, in older files, quote lines
    /// without a date), joined by newlines.
    pub note: String,
    /// When the task was made (`made:YYYY-MM-DD`), written once by Mimer.
    pub made: Option<String>,
    /// The note the task points at: the first `[[wiki-link]]` in its line, as a link target
    /// (an alias or a heading after it is left out). The link is not part of the title.
    pub link: Option<String>,
}

/// What to change in a task's words. `None` leaves a word alone, `Some(None)` removes it.
#[derive(Debug, Clone, Default, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct MetaPatch {
    #[serde(default, with = "double_option")]
    #[ts(type = "string | null", optional)]
    pub due: Option<Option<String>>,
    #[serde(default, with = "double_option")]
    #[ts(type = "string | null", optional)]
    pub plan: Option<Option<String>>,
    #[serde(default, with = "double_option")]
    #[ts(type = "string | null", optional)]
    pub status: Option<Option<String>>,
    #[serde(default, with = "double_option")]
    #[ts(type = "number | null", optional)]
    pub est_minutes: Option<Option<u32>>,
}

/// Serde for "missing" (`None`) versus "null" (`Some(None)`) versus a value (`Some(Some(v))`).
mod double_option {
    use serde::{Deserialize, Deserializer};

    pub fn deserialize<'de, D, T>(d: D) -> Result<Option<Option<T>>, D::Error>
    where
        D: Deserializer<'de>,
        T: Deserialize<'de>,
    {
        Ok(Some(Option::deserialize(d)?))
    }
}

static TASK_RE: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r"^(\s*)[-*+]\s+\[([ xX])\]\s+(.*)$").expect("valid task regex"));
static LOG_RE: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(r"^(\s*)>\s*(\d{4}-\d{2}-\d{2})\s+(.*)$").expect("valid log regex")
});
static NOTE_RE: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r"^(\s*)>\s?(.*)$").expect("valid note regex"));
/// A log line as a list item: `- 2026-10-14 What happened`.
static LOG_ITEM_RE: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(r"^(\s*)[-*+]\s+(\d{4}-\d{2}-\d{2})\s+(.*)$").expect("valid log item regex")
});
/// Any list item or quote line: not plain text.
static MARKED_RE: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(r"^\s*([-*+]\s|\d+[.)]\s|>|#{1,6}\s)").expect("valid marker regex")
});
static LINK_RE: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r"\[\[[^\[\]]+\]\]").expect("valid link regex"));
static TAG_RE: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(r"(^|\s)#([\p{L}\p{N}_/-]*\p{L}[\p{L}\p{N}_/-]*)").expect("valid tag regex")
});
static WORD_RE: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(r"(?:^|\s)(due|plan|status|est|made):(\S+)").expect("valid word regex")
});

/// A fingerprint of a line, to notice that it changed.
pub fn line_key(line: &str) -> String {
    let h = crate::ai::proposals::hash(line.trim_end());
    h[..12].to_string()
}

fn indent_of(line: &str) -> usize {
    line.chars()
        .take_while(|c| *c == ' ' || *c == '\t')
        .map(|c| if c == '\t' { 4 } else { 1 })
        .sum()
}

fn is_date(s: &str) -> bool {
    s.len() == 10
        && s.chars().enumerate().all(|(i, c)| match i {
            4 | 7 => c == '-',
            _ => c.is_ascii_digit(),
        })
}

/// `15m`, `1h`, `90m` or `1h30m` as minutes.
fn parse_minutes(s: &str) -> Option<u32> {
    let mut total = 0u32;
    let mut num = String::new();
    let mut any = false;
    for c in s.chars() {
        if c.is_ascii_digit() {
            num.push(c);
        } else {
            let n: u32 = num.parse().ok()?;
            num.clear();
            total += match c.to_ascii_lowercase() {
                'h' => n.checked_mul(60)?,
                'm' => n,
                _ => return None,
            };
            any = true;
        }
    }
    (any && num.is_empty() && total > 0).then_some(total)
}

fn format_minutes(m: u32) -> String {
    if m >= 60 && m.is_multiple_of(60) {
        format!("{}h", m / 60)
    } else if m > 60 {
        format!("{}h{}m", m / 60, m % 60)
    } else {
        format!("{m}m")
    }
}

/// The parts of a task line's text.
struct Words {
    title: String,
    tags: Vec<String>,
    due: Option<String>,
    plan: Option<String>,
    status: Option<String>,
    est: Option<u32>,
    made: Option<String>,
    link: Option<String>,
}

fn split_words(text: &str) -> Words {
    let mut w = Words {
        title: String::new(),
        tags: Vec::new(),
        due: None,
        plan: None,
        status: None,
        est: None,
        made: None,
        link: None,
    };
    for c in WORD_RE.captures_iter(text) {
        let (key, value) = (&c[1], c[2].to_string());
        match key {
            "due" if is_date(&value) => w.due = Some(value),
            "plan" if is_date(&value) || value == "later" => w.plan = Some(value),
            "status" => w.status = Some(value.to_lowercase()),
            "est" => w.est = parse_minutes(&value),
            "made" if is_date(&value) => w.made = Some(value),
            _ => {}
        }
    }
    w.tags = TAG_RE
        .captures_iter(text)
        .map(|c| c[2].to_string())
        .collect();
    w.link = LINK_RE.find(text).map(|m| link_target(m.as_str()));
    let no_links = LINK_RE.replace_all(text, "");
    let text = no_links.as_ref();
    let no_words = WORD_RE.replace_all(text, "");
    let no_tags = TAG_RE.replace_all(&no_words, "$1");
    w.title = no_tags.split_whitespace().collect::<Vec<_>>().join(" ");
    w
}

/// The lines of a note that are ordinary text: not the properties block, not inside code.
fn live_lines(content: &str) -> Vec<bool> {
    let lines: Vec<&str> = content.split('\n').collect();
    let mut live = vec![true; lines.len()];
    let mut i = 0;
    if lines.first().is_some_and(|l| l.trim_end() == "---") {
        for (j, l) in lines.iter().enumerate().skip(1) {
            if l.trim_end() == "---" {
                for slot in live.iter_mut().take(j + 1) {
                    *slot = false;
                }
                i = j + 1;
                break;
            }
        }
    }
    // The agenda of a meeting note is a checklist for the meeting, not tasks.
    let meeting = crate::markdown::frontmatter::split(content).is_some_and(|f| {
        crate::markdown::frontmatter::tags(f.yaml)
            .iter()
            .any(|t| t == "meeting")
    });
    let mut in_agenda = false;
    let mut in_code = false;
    for (j, l) in lines.iter().enumerate().skip(i) {
        let t = l.trim_start();
        if t.starts_with("```") || t.starts_with("~~~") {
            in_code = !in_code;
            live[j] = false;
        } else if in_code {
            live[j] = false;
        } else if meeting {
            if l.starts_with('#') {
                in_agenda = l
                    .trim_start_matches('#')
                    .trim()
                    .eq_ignore_ascii_case("agenda");
            }
            if in_agenda {
                live[j] = false;
            }
        }
    }
    live
}

/// Reads the tasks of one note.
pub fn parse(path: &str, content: &str) -> Vec<Task> {
    let lines: Vec<&str> = content.split('\n').collect();
    let live = live_lines(content);
    let mut tasks: Vec<Task> = Vec::new();
    // The open task and its indent: later checklist lines that are indented more are its steps.
    let mut current: Option<(usize, usize)> = None; // (index in tasks, indent)
    for (n, raw) in lines.iter().enumerate() {
        if !live[n] {
            current = None;
            continue;
        }
        let line = raw.trim_end_matches('\r');
        if let Some(c) = TASK_RE.captures(line) {
            let indent = indent_of(&c[1]);
            let done = &c[2] != " ";
            if let Some((idx, task_indent)) = current {
                if indent > task_indent {
                    let t = &mut tasks[idx];
                    t.steps.push(TaskStep {
                        line: n as u32,
                        text: c[3].trim().to_string(),
                        done,
                        key: line_key(line),
                    });
                    t.end = n as u32;
                    continue;
                }
            }
            let w = split_words(&c[3]);
            tasks.push(Task {
                path: path.to_string(),
                line: n as u32,
                end: n as u32,
                key: line_key(line),
                title: w.title,
                done,
                tags: w.tags,
                due: w.due,
                plan: w.plan,
                status: w.status,
                est_minutes: w.est,
                steps: Vec::new(),
                log: Vec::new(),
                note: String::new(),
                made: w.made,
                link: w.link,
            });
            current = Some((tasks.len() - 1, indent));
            continue;
        }
        if let (Some((idx, task_indent)), Some(c)) = (
            current,
            LOG_ITEM_RE.captures(line).or_else(|| LOG_RE.captures(line)),
        ) {
            if indent_of(&c[1]) > task_indent {
                let t = &mut tasks[idx];
                t.log.push(TaskLog {
                    line: n as u32,
                    date: c[2].to_string(),
                    text: c[3].trim().to_string(),
                    key: line_key(line),
                });
                t.end = n as u32;
                continue;
            }
        }
        if let (Some((idx, task_indent)), Some(c)) = (current, NOTE_RE.captures(line)) {
            if indent_of(&c[1]) > task_indent {
                let t = &mut tasks[idx];
                if !t.note.is_empty() {
                    t.note.push('\n');
                }
                t.note.push_str(c[2].trim_end());
                t.end = n as u32;
                continue;
            }
        }
        // Indented plain text under the task is its note.
        if let Some((idx, task_indent)) = current {
            if !line.trim().is_empty() && indent_of(line) > task_indent && !MARKED_RE.is_match(line)
            {
                let t = &mut tasks[idx];
                if !t.note.is_empty() {
                    t.note.push('\n');
                }
                let text = line.trim();
                // A note line that would look like a list item or a quote is written with a `\`.
                let text = match text.strip_prefix('\\') {
                    Some(rest) if MARKED_RE.is_match(rest) => rest,
                    _ => text,
                };
                t.note.push_str(text);
                t.end = n as u32;
                continue;
            }
        }
        // A line that is not part of the block ends it (blank lines inside a block are kept).
        if !line.trim().is_empty() {
            if let Some((_, task_indent)) = current {
                if indent_of(line) <= task_indent {
                    current = None;
                }
            }
        }
    }
    tasks
}

fn conflict() -> AppError {
    AppError::Conflict("The note changed since the task list was read. Reload the list.".into())
}

/// Replaces one line, after checking that it is still the line that was read.
fn edit_line(
    content: &str,
    line: u32,
    key: &str,
    f: impl FnOnce(&str) -> String,
) -> AppResult<String> {
    let mut lines: Vec<String> = content.split('\n').map(str::to_string).collect();
    let i = line as usize;
    let Some(current) = lines.get(i) else {
        return Err(conflict());
    };
    let cr = current.ends_with('\r');
    let bare = current.trim_end_matches('\r');
    if line_key(bare) != key {
        return Err(conflict());
    }
    let mut new = f(bare);
    if cr {
        new.push('\r');
    }
    lines[i] = new;
    Ok(lines.join("\n"))
}

/// The target of a `[[wiki-link]]`: the part before an alias (`|`) or a heading (`#`).
fn link_target(link: &str) -> String {
    let inner = link.trim_start_matches("[[").trim_end_matches("]]");
    let name = inner.split(['|', '#']).next().unwrap_or(inner);
    name.trim().to_string()
}

/// A task line's text split into its title, its `[[links]]` and the words and tags that follow
/// the title (`#tag`, `due:` and so on).
fn line_parts(body: &str) -> (String, Vec<String>, Vec<String>) {
    let links: Vec<String> = LINK_RE
        .find_iter(body)
        .map(|m| m.as_str().to_string())
        .collect();
    let rest = LINK_RE.replace_all(body, " ");
    let is_kept = |t: &str| {
        (t.starts_with('#') && t.len() > 1)
            || ["due:", "plan:", "status:", "est:", "made:"]
                .iter()
                .any(|w| t.starts_with(w) && t.len() > w.len())
    };
    let kept = rest
        .split_whitespace()
        .filter(|t| is_kept(t))
        .map(str::to_string)
        .collect();
    let title = rest
        .split_whitespace()
        .filter(|t| !is_kept(t))
        .collect::<Vec<_>>()
        .join(" ");
    (title, links, kept)
}

/// Puts a task line back together: the title, then the links, then the words and tags.
fn compose_line(prefix: &str, title: &str, links: &[String], kept: &[String]) -> String {
    let mut new = format!("{prefix}{title}");
    for part in links.iter().chain(kept) {
        new.push(' ');
        new.push_str(part);
    }
    new
}

/// Changes the title of a task or a step. Its tags and `due:`, `plan:`, `status:` and `est:` words
/// stay where they are (after the new title).
pub fn set_title(content: &str, line: u32, key: &str, title: &str) -> AppResult<String> {
    let title = title.split_whitespace().collect::<Vec<_>>().join(" ");
    if title.is_empty() {
        return Err(AppError::InvalidPath("The title is empty".into()));
    }
    let mut empty = false;
    let out = edit_line(content, line, key, |l| {
        let Some(c) = TASK_RE.captures(l) else {
            empty = true;
            return l.to_string();
        };
        let body = c.get(3).map_or("", |m| m.as_str());
        let start = c.get(3).map_or(l.len(), |m| m.start());
        let (_, links, kept) = line_parts(body);
        compose_line(&l[..start], &title, &links, &kept)
    })?;
    if empty {
        return Err(conflict());
    }
    Ok(out)
}

/// Points a task at a note (`[[link]]` after its title), or removes the link when `link` is
/// `None`. A task points at one note: an earlier link is replaced.
pub fn set_link(content: &str, line: u32, key: &str, link: Option<&str>) -> AppResult<String> {
    let link = link.map(|l| {
        l.trim()
            .trim_start_matches("[[")
            .trim_end_matches("]]")
            .trim()
    });
    if link.is_some_and(|l| l.is_empty() || l.contains(['[', ']', '|'])) {
        return Err(AppError::InvalidPath("That is not a note name".into()));
    }
    let mut missing = false;
    let out = edit_line(content, line, key, |l| {
        let Some(c) = TASK_RE.captures(l) else {
            missing = true;
            return l.to_string();
        };
        let body = c.get(3).map_or("", |m| m.as_str());
        let start = c.get(3).map_or(l.len(), |m| m.start());
        let (title, _, kept) = line_parts(body);
        let links: Vec<String> = link.map(|n| format!("[[{n}]]")).into_iter().collect();
        compose_line(&l[..start], &title, &links, &kept)
    })?;
    if missing {
        return Err(conflict());
    }
    Ok(out)
}

/// Ticks or unticks a task or a step.
pub fn set_done(content: &str, line: u32, key: &str, done: bool) -> AppResult<String> {
    edit_line(content, line, key, |l| {
        let Some(c) = TASK_RE.captures(l) else {
            return l.to_string();
        };
        let start = c.get(2).map_or(0, |m| m.start());
        let mut out = String::with_capacity(l.len());
        out.push_str(&l[..start]);
        out.push(if done { 'x' } else { ' ' });
        out.push_str(&l[start + 1..]);
        out
    })
}

/// Changes the `due:` / `plan:` / `status:` / `est:` words of a task line.
pub fn set_meta(content: &str, line: u32, key: &str, patch: &MetaPatch) -> AppResult<String> {
    for v in [&patch.due, &patch.plan].into_iter().flatten().flatten() {
        if !is_date(v) && v != "later" {
            return Err(AppError::InvalidPath(format!("{v} is not a date")));
        }
    }
    edit_line(content, line, key, |l| {
        let mut text = l.to_string();
        let mut change = |word: &str, value: Option<Option<String>>| {
            let Some(value) = value else { return };
            let re = Regex::new(&format!(r"(^|\s)({word}):\S+")).expect("valid word regex");
            text = re.replace_all(&text, "").trim_end().to_string();
            if let Some(v) = value {
                text.push_str(&format!(" {word}:{v}"));
            }
        };
        change("due", patch.due.clone());
        change("plan", patch.plan.clone());
        change("status", patch.status.clone());
        change("est", patch.est_minutes.map(|m| m.map(format_minutes)));
        text
    })
}

fn block_end(content: &str, line: u32, key: &str) -> AppResult<(usize, usize, usize)> {
    let tasks = parse("", content);
    let lines: Vec<&str> = content.split('\n').collect();
    let task = tasks.iter().find(|t| t.line == line).ok_or_else(conflict)?;
    if task.key != key {
        return Err(conflict());
    }
    let indent = indent_of(lines[line as usize]);
    Ok((line as usize, task.end as usize, indent))
}

fn insert_after(content: &str, after: usize, indent: usize, text: String) -> String {
    let mut lines: Vec<String> = content.split('\n').map(str::to_string).collect();
    let cr = lines.get(after).is_some_and(|l| l.ends_with('\r'));
    let mut new = format!("{}{text}", " ".repeat(indent));
    if cr {
        new.push('\r');
    }
    lines.insert(after + 1, new);
    lines.join("\n")
}

/// Adds a step under a task: after its last step, or right under it.
pub fn add_step(content: &str, line: u32, key: &str, text: &str) -> AppResult<String> {
    let text = text.split_whitespace().collect::<Vec<_>>().join(" ");
    if text.is_empty() {
        return Err(AppError::InvalidPath("The step is empty".into()));
    }
    let (start, _end, indent) = block_end(content, line, key)?;
    let tasks = parse("", content);
    let task = tasks.iter().find(|t| t.line as usize == start);
    let lines: Vec<&str> = content.split('\n').collect();
    let after = task
        .and_then(|t| t.steps.last().map(|s| s.line as usize))
        .unwrap_or_else(|| note_end(&lines, start, indent));
    Ok(insert_after(
        content,
        after,
        indent + 2,
        format!("- [ ] {text}"),
    ))
}

/// Writes the older quote lines of the task that holds `line` in the new form: a dated `> …` log
/// line becomes a list item, an undated `> …` note line plain text. Called after Mimer changed the
/// task's log or note, so one task is never half in each form. Other lines are left alone.
fn modernize(content: &str, line: u32) -> String {
    let tasks = parse("", content);
    let Some(task) = tasks.iter().find(|t| t.line <= line && line <= t.end) else {
        return content.to_string();
    };
    let task_indent = indent_of(content.split('\n').nth(task.line as usize).unwrap_or(""));
    let mut lines: Vec<String> = content.split('\n').map(str::to_string).collect();
    for i in task.line as usize + 1..=task.end as usize {
        let Some(l) = lines.get(i) else { break };
        let cr = l.ends_with('\r');
        let bare = l.trim_end_matches('\r');
        let new = if let Some(c) = LOG_RE.captures(bare) {
            Some(format!("{}- {} {}", &c[1], &c[2], c[3].trim()))
        } else if let Some(c) = NOTE_RE.captures(bare) {
            (indent_of(&c[1]) > task_indent).then(|| {
                let text = c[2].trim();
                let escape = if MARKED_RE.is_match(text) { "\\" } else { "" };
                format!("{}{escape}{text}", &c[1])
            })
        } else {
            None
        };
        if let Some(mut n) = new {
            if cr {
                n.push('\r');
            }
            lines[i] = n;
        }
    }
    lines.join("\n")
}

/// Adds a dated line to the log of a task, at the end of its block.
pub fn add_log(content: &str, line: u32, key: &str, date: &str, text: &str) -> AppResult<String> {
    if !is_date(date) {
        return Err(AppError::InvalidPath(format!("{date} is not a date")));
    }
    let text = text.split_whitespace().collect::<Vec<_>>().join(" ");
    if text.is_empty() {
        return Err(AppError::InvalidPath("The note is empty".into()));
    }
    let (_start, end, indent) = block_end(content, line, key)?;
    let out = insert_after(content, end, indent + 2, format!("- {date} {text}"));
    Ok(modernize(&out, line))
}

/// Changes the date and text of one log line. Its place and indent stay.
pub fn edit_log(content: &str, line: u32, key: &str, date: &str, text: &str) -> AppResult<String> {
    if !is_date(date) {
        return Err(AppError::InvalidPath(format!("{date} is not a date")));
    }
    let text = text.split_whitespace().collect::<Vec<_>>().join(" ");
    if text.is_empty() {
        return Err(AppError::InvalidPath("The text is empty".into()));
    }
    let out = edit_line(content, line, key, |l| {
        let indent: String = l.chars().take_while(|c| c.is_whitespace()).collect();
        format!("{indent}- {date} {text}")
    })?;
    Ok(modernize(&out, line))
}

/// Removes one log line.
pub fn delete_log(content: &str, line: u32, key: &str) -> AppResult<String> {
    let mut lines: Vec<&str> = content.split('\n').collect();
    let i = line as usize;
    let Some(current) = lines.get(i) else {
        return Err(conflict());
    };
    let bare = current.trim_end_matches('\r');
    if line_key(bare) != key || !(LOG_RE.is_match(bare) || LOG_ITEM_RE.is_match(bare)) {
        return Err(conflict());
    }
    lines.remove(i);
    // The task starts above the removed line, so `line - 1` is still inside it.
    Ok(modernize(&lines.join("\n"), line.saturating_sub(1)))
}

/// Whether a line is part of a task's note: indented plain text, or (older files) an indented
/// quote line without a date.
fn is_note_line(line: &str, task_indent: usize) -> bool {
    let l = line.trim_end_matches('\r');
    if l.trim().is_empty() || indent_of(l) <= task_indent {
        return false;
    }
    if let Some(c) = NOTE_RE.captures(l) {
        return !LOG_RE.is_match(l) && indent_of(&c[1]) > task_indent;
    }
    !MARKED_RE.is_match(l)
}

/// The last line of the note right under the task at `start` (`start` when it has none).
fn note_end(lines: &[&str], start: usize, indent: usize) -> usize {
    let mut i = start;
    while lines.get(i + 1).is_some_and(|l| is_note_line(l, indent)) {
        i += 1;
    }
    i
}

/// Sets the note of a task: indented plain text lines right under the task line. An empty text
/// removes the note. A note in the older quote form is replaced.
pub fn set_note(content: &str, line: u32, key: &str, text: &str) -> AppResult<String> {
    let (start, end, indent) = block_end(content, line, key)?;
    let mut lines: Vec<String> = content.split('\n').map(str::to_string).collect();
    let cr = lines[start].ends_with('\r');
    let mut i = end;
    while i > start {
        if is_note_line(&lines[i], indent) {
            lines.remove(i);
        }
        i -= 1;
    }
    let pad = " ".repeat(indent + 2);
    let new: Vec<String> = text
        .lines()
        .map(str::trim)
        .filter(|l| !l.is_empty())
        .map(|l| {
            let escape = if MARKED_RE.is_match(l) { "\\" } else { "" };
            let mut s = format!("{pad}{escape}{l}");
            if cr {
                s.push('\r');
            }
            s
        })
        .collect();
    for (k, l) in new.into_iter().enumerate() {
        lines.insert(start + 1 + k, l);
    }
    Ok(modernize(&lines.join("\n"), line))
}

/// Moves a task (with its note, steps and log) or a step one place up or down, past the task or
/// step next to it. The lines between two tasks (blank lines) stay where they are. Nothing
/// changes at the top or bottom.
pub fn move_item(content: &str, line: u32, key: &str, up: bool) -> AppResult<String> {
    let lines: Vec<&str> = content.split('\n').collect();
    let current = lines.get(line as usize).ok_or_else(conflict)?;
    if line_key(current.trim_end_matches('\r')) != key {
        return Err(conflict());
    }
    let tasks = parse("", content);
    // Blocks as (first, last) line, in order: the tasks of the note, or the steps of one task.
    let blocks: Vec<(usize, usize)> = if let Some(_t) = tasks.iter().find(|t| t.line == line) {
        let indent = indent_of(current);
        tasks
            .iter()
            .filter(|t| indent_of(lines[t.line as usize]) == indent)
            .map(|t| (t.line as usize, t.end as usize))
            .collect()
    } else if let Some(t) = tasks
        .iter()
        .find(|t| t.steps.iter().any(|s| s.line == line))
    {
        t.steps
            .iter()
            .map(|s| (s.line as usize, s.line as usize))
            .collect()
    } else {
        return Err(conflict());
    };
    let Some(at) = blocks.iter().position(|b| b.0 == line as usize) else {
        return Err(conflict());
    };
    let other = if up {
        match at.checked_sub(1) {
            Some(o) => o,
            None => return Ok(content.to_string()),
        }
    } else if at + 1 < blocks.len() {
        at + 1
    } else {
        return Ok(content.to_string());
    };
    let (first, second) = if up {
        (blocks[other], blocks[at])
    } else {
        (blocks[at], blocks[other])
    };
    let mut out: Vec<&str> = Vec::with_capacity(lines.len());
    out.extend(&lines[..first.0]);
    out.extend(&lines[second.0..=second.1]);
    out.extend(&lines[first.1 + 1..second.0]);
    out.extend(&lines[first.0..=first.1]);
    out.extend(&lines[second.1 + 1..]);
    Ok(out.join("\n"))
}

/// Removes a task, with its steps and log, from the note.
pub fn delete(content: &str, line: u32, key: &str) -> AppResult<String> {
    let mut lines: Vec<&str> = content.split('\n').collect();
    // A step is one line; a task goes with everything under it.
    let is_step = parse("", content)
        .iter()
        .flat_map(|t| t.steps.iter())
        .any(|s| s.line == line);
    if is_step {
        let at = line as usize;
        let current = lines.get(at).ok_or_else(conflict)?;
        if line_key(current.trim_end_matches('\r')) != key {
            return Err(conflict());
        }
        lines.remove(at);
        return Ok(lines.join("\n"));
    }
    let (start, end, _) = block_end(content, line, key)?;
    lines.drain(start..=end);
    Ok(lines.join("\n"))
}

/// Adds a task at the end of a note (a new line, with a blank line before it after other text).
/// `made` (a date) is written as `made:YYYY-MM-DD` unless the text already has one.
pub fn append_task(content: &str, text: &str, made: Option<&str>) -> String {
    let mut text = text.split_whitespace().collect::<Vec<_>>().join(" ");
    if let Some(date) = made.filter(|d| is_date(d)) {
        if !text.split_whitespace().any(|w| w.starts_with("made:")) {
            text.push_str(&format!(" made:{date}"));
        }
    }
    let mut out = content.trim_end_matches('\n').to_string();
    if !out.is_empty() {
        out.push('\n');
        if !out
            .trim_end()
            .lines()
            .last()
            .is_some_and(|l| TASK_RE.is_match(l))
        {
            out.push('\n');
        }
    }
    out.push_str(&format!("- [ ] {text}\n"));
    out
}

/// Finds the task that starts at `line` after an edit.
pub fn task_at(path: &str, content: &str, line: u32) -> AppResult<Task> {
    parse(path, content)
        .into_iter()
        .find(|t| t.line == line)
        .ok_or_else(conflict)
}

#[cfg(test)]
mod tests {
    use super::*;

    const NOTE: &str = "---\ntags: [x]\n---\n# Møde med Acme\n\n- [ ] Renew the Acme licence #acme #licence due:2026-11-01 status:waiting est:1h30m\n  - [x] Send the price list\n  - [ ] Ask Peter about a discount\n  > 2026-10-14 Mette wants 40 users.\n  > 2026-10-16 Waiting for Peter.\n- [x] Book the room\n\nSome text.\n\n```\n- [ ] not a task\n```\n\n- Shopping\n  - [ ] milk\n";

    #[test]
    fn the_agenda_of_a_meeting_note_is_not_tasks() {
        let note = "---\ntags: [meeting]\n---\n# Weekly\n\n## Agenda\n\n- [ ] Budget\n- [x] Hiring\n\n## Notes\n\n- [ ] Call Mette\n";
        let t = parse("Meetings/Weekly.md", note);
        assert_eq!(t.len(), 1, "{t:?}");
        assert_eq!(t[0].title, "Call Mette");
        // The same text in a note that is not a meeting keeps its tasks.
        let plain = note.replace("tags: [meeting]", "tags: [other]");
        assert_eq!(parse("A.md", &plain).len(), 3);
    }

    #[test]
    fn a_task_points_at_a_note_with_a_link_that_is_not_part_of_the_title() {
        let n = "- [ ] Send the offer [[Offer to Acme|the offer]] #sales due:2026-11-01 made:2026-10-27\n  - [ ] Ask Peter\n";
        let t = &parse("n.md", n)[0];
        assert_eq!(t.title, "Send the offer");
        assert_eq!(t.link.as_deref(), Some("Offer to Acme"));
        assert_eq!(t.tags, ["sales"]);
        assert_eq!(t.due.as_deref(), Some("2026-11-01"));
        // The title can be changed without losing the link.
        let renamed = set_title(n, t.line, &t.key, "Send the new offer").unwrap();
        assert!(
            renamed.starts_with("- [ ] Send the new offer [[Offer to Acme|the offer]] #sales due:")
        );
        // A link is put on, replaced and taken off again; the rest of the line stays.
        let plain = "- [ ] Call Mette #office made:2026-10-27\n";
        let t = &parse("n.md", plain)[0];
        let on = set_link(plain, t.line, &t.key, Some("Mette")).unwrap();
        assert_eq!(on, "- [ ] Call Mette [[Mette]] #office made:2026-10-27\n");
        let t = &parse("n.md", &on)[0];
        assert_eq!(t.link.as_deref(), Some("Mette"));
        let other = set_link(&on, t.line, &t.key, Some("Mette Hansen")).unwrap();
        assert_eq!(
            other,
            "- [ ] Call Mette [[Mette Hansen]] #office made:2026-10-27\n"
        );
        let t = &parse("n.md", &other)[0];
        let off = set_link(&other, t.line, &t.key, None).unwrap();
        assert_eq!(off, plain);
        // A step is not given a link by mistake, and a name with brackets is refused.
        assert!(set_link(plain, t.line, "wrong", Some("x")).is_err());
        let t = &parse("n.md", plain)[0];
        assert!(set_link(plain, t.line, &t.key, Some("a]b")).is_err());
    }

    #[test]
    fn a_step_is_deleted_alone_and_only_with_its_own_key() {
        let t = &parse("", NOTE)[0];
        let step = &t.steps[1];
        let after = delete(NOTE, step.line, &step.key).unwrap();
        assert!(!after.contains("Ask Peter about a discount"));
        assert!(after.contains("Send the price list"));
        assert!(after.contains("Waiting for Peter"), "the log stays");
        assert!(delete(NOTE, step.line, "000000000000").is_err());
    }

    #[test]
    fn reads_title_words_steps_and_log() {
        let tasks = parse("Møder/Acme.md", NOTE);
        assert_eq!(tasks.len(), 3, "{tasks:#?}");
        let t = &tasks[0];
        assert_eq!(t.title, "Renew the Acme licence");
        assert_eq!(t.tags, vec!["acme", "licence"]);
        assert_eq!(t.due.as_deref(), Some("2026-11-01"));
        assert_eq!(t.status.as_deref(), Some("waiting"));
        assert_eq!(t.est_minutes, Some(90));
        assert!(!t.done);
        assert_eq!(t.line, 5);
        assert_eq!(t.steps.len(), 2);
        assert!(t.steps[0].done && !t.steps[1].done);
        assert_eq!(t.steps[1].text, "Ask Peter about a discount");
        assert_eq!(t.log.len(), 2);
        assert_eq!(t.log[1].date, "2026-10-16");
        assert_eq!(t.end, 9);
        assert!(tasks[1].done && tasks[1].title == "Book the room");
        // A checklist line under a plain bullet is a task of its own; code is skipped.
        assert_eq!(tasks[2].title, "milk");
    }

    #[test]
    fn a_checkbox_in_the_properties_or_code_is_not_a_task() {
        let n = "---\ntodo: - [ ] no\n---\n```\n- [ ] no\n```\n";
        assert!(parse("a.md", n).is_empty());
    }

    #[test]
    fn ticking_changes_only_the_box_and_checks_the_line() {
        let tasks = parse("a.md", NOTE);
        let t = &tasks[0];
        let out = set_done(NOTE, t.line, &t.key, true).unwrap();
        assert!(out.contains("- [x] Renew the Acme licence #acme"));
        assert_eq!(out.len(), NOTE.len());
        // A step too.
        let s = &t.steps[1];
        let out = set_done(NOTE, s.line, &s.key, true).unwrap();
        assert!(out.contains("  - [x] Ask Peter about a discount"));
        // The line changed since it was read: refused, nothing written.
        let changed = NOTE.replace("Renew the Acme", "Renew Acme");
        assert!(matches!(
            set_done(&changed, t.line, &t.key, true),
            Err(AppError::Conflict(_))
        ));
    }

    #[test]
    fn words_are_set_replaced_and_removed_in_place() {
        let t = &parse("a.md", NOTE)[0];
        let patch = MetaPatch {
            plan: Some(Some("2026-10-19".into())),
            status: Some(Some("doing".into())),
            due: Some(None),
            est_minutes: Some(Some(15)),
        };
        let out = set_meta(NOTE, t.line, &t.key, &patch).unwrap();
        let line = out.lines().nth(5).unwrap();
        assert_eq!(
            line,
            "- [ ] Renew the Acme licence #acme #licence plan:2026-10-19 status:doing est:15m",
            "{line}"
        );
        let again = &parse("a.md", &out)[0];
        assert_eq!(again.plan.as_deref(), Some("2026-10-19"));
        assert_eq!(again.due, None);
        assert_eq!(again.est_minutes, Some(15));
        assert_eq!(again.steps.len(), 2, "the block is intact");
        assert!(set_meta(
            NOTE,
            t.line,
            &t.key,
            &MetaPatch {
                due: Some(Some("tomorrow".into())),
                ..MetaPatch::default()
            }
        )
        .is_err());
    }

    #[test]
    fn a_log_line_can_be_changed_and_removed() {
        let n = "- [ ] A\n  > 2026-10-14 One\n  > 2026-10-15 Two\n- [ ] B\n";
        let t = &parse("n.md", n)[0];
        let l = &t.log[0];
        let out = edit_log(n, l.line, &l.key, "2026-10-13", "Fixed  text").unwrap();
        // A changed line is written in the new form, as a list item.
        assert!(out.contains("  - 2026-10-13 Fixed text\n"));
        assert_eq!(parse("n.md", &out)[0].log.len(), 2);
        // The task's other old log lines are written in the new form too.
        assert!(out.contains("  - 2026-10-15 Two\n"));
        let out = delete_log(n, l.line, &l.key).unwrap();
        assert_eq!(out, "- [ ] A\n  - 2026-10-15 Two\n- [ ] B\n");
        // A line that changed since it was read is not touched.
        assert!(delete_log(&out, l.line, &l.key).is_err());
        assert!(edit_log(n, l.line, &l.key, "tomorrow", "x").is_err());
    }

    #[test]
    fn a_task_note_is_read_written_and_kept_apart_from_the_log() {
        let n = "- [ ] A\n  > 2026-10-14 Log\n- [ ] B\n";
        let t = &parse("n.md", n)[0];
        let out = set_note(n, t.line, &t.key, "First line\n\nSecond").unwrap();
        let t = &parse("n.md", &out)[0];
        assert_eq!(t.note, "First line\nSecond");
        assert_eq!(t.log.len(), 1);
        assert!(out.starts_with("- [ ] A\n  First line\n  Second\n"));
        // Changing it replaces the old note and leaves steps and log alone.
        let out = set_note(&out, t.line, &t.key, "New").unwrap();
        let t = &parse("n.md", &out)[0];
        assert_eq!(t.note, "New");
        assert_eq!(t.log.len(), 1);
        // An empty text removes it; the old log line is now in the new form.
        let out = set_note(&out, t.line, &t.key, "  ").unwrap();
        assert_eq!(out, "- [ ] A\n  - 2026-10-14 Log\n- [ ] B\n");
        assert_eq!(parse("n.md", &out)[1].title, "B");
    }

    #[test]
    fn steps_and_log_lines_go_where_they_belong() {
        let t = &parse("a.md", NOTE)[0];
        let out = add_step(NOTE, t.line, &t.key, "Send the quote").unwrap();
        let lines: Vec<&str> = out.lines().collect();
        assert_eq!(lines[8], "  - [ ] Send the quote", "after the last step");
        // The older log form is still read and left as it is.
        assert_eq!(lines[9], "  > 2026-10-14 Mette wants 40 users.");
        let t2 = &parse("a.md", &out)[0];
        assert_eq!(t2.steps.len(), 3);
        let out = add_log(&out, t2.line, &t2.key, "2026-10-19", "Peter answered.").unwrap();
        let t3 = &parse("a.md", &out)[0];
        assert_eq!(t3.log.last().unwrap().text, "Peter answered.");
        assert_eq!(t3.log.len(), 3);
        assert_eq!(t3.steps.len(), 3);
        // A task without steps gets its first step right under it.
        let one = "- [ ] Alone\n\nText\n";
        let t = &parse("a.md", one)[0];
        let out = add_step(one, t.line, &t.key, "First").unwrap();
        assert_eq!(out, "- [ ] Alone\n  - [ ] First\n\nText\n");
        let out = add_log(&out, t.line, &t.key, "2026-10-19", "Started").unwrap();
        assert!(out.starts_with("- [ ] Alone\n  - [ ] First\n  - 2026-10-19 Started\n"));
    }

    #[test]
    fn the_new_form_reads_well_without_mimer() {
        let n = "- [ ] Book the movers #office made:2026-10-14\n  Ask for two quotes.\n  \\- not a step\n  - [ ] Call Movers A\n  - 2026-10-20 Movers B quoted\n- [ ] Next\n";
        let t = &parse("n.md", n)[0];
        assert_eq!(t.title, "Book the movers");
        assert_eq!(t.made.as_deref(), Some("2026-10-14"));
        assert_eq!(t.note, "Ask for two quotes.\n- not a step");
        assert_eq!(t.steps.len(), 1);
        assert_eq!(t.log.len(), 1);
        assert_eq!(t.log[0].text, "Movers B quoted");
        assert_eq!(parse("n.md", n)[1].title, "Next");
        // A note line that looks like a list item is escaped, so it reads back the same.
        let out = set_note(n, t.line, &t.key, "- buy boxes").unwrap();
        assert!(out.contains("\n  \\- buy boxes\n"), "{out}");
        assert_eq!(parse("n.md", &out)[0].note, "- buy boxes");
        // A first step goes after the note, not between the task and its note.
        let one = "- [ ] Alone\n  The note\n";
        let t = &parse("a.md", one)[0];
        let out = add_step(one, t.line, &t.key, "First").unwrap();
        assert_eq!(out, "- [ ] Alone\n  The note\n  - [ ] First\n");
        // The made date is added once, by Mimer.
        assert_eq!(
            append_task("", "Call", Some("2026-10-21")),
            "- [ ] Call made:2026-10-21\n"
        );
        assert_eq!(
            append_task("", "Call made:2026-01-01", Some("2026-10-21")),
            "- [ ] Call made:2026-01-01\n"
        );
    }

    #[test]
    fn a_task_in_the_old_form_is_written_in_the_new_form_when_its_log_changes() {
        let n = "- [ ] A\n  > A note\n  > 2026-10-14 One\n- [ ] B\n  > 2026-10-14 Other task\n";
        let t = &parse("n.md", n)[0];
        let out = add_log(n, t.line, &t.key, "2026-10-15", "Two").unwrap();
        assert_eq!(
            out,
            "- [ ] A\n  A note\n  - 2026-10-14 One\n  - 2026-10-15 Two\n- [ ] B\n  > 2026-10-14 Other task\n"
        );
        let t = &parse("n.md", &out)[0];
        assert_eq!(t.note, "A note");
        assert_eq!(t.log.len(), 2);
    }

    #[test]
    fn tasks_and_steps_move_up_and_down() {
        let n = "# E\n\n- [ ] A\n  note a\n  - [ ] a1\n  - [ ] a2\n- [ ] B\n  - 2026-10-20 log b\n\n- [ ] C\n";
        let ts = parse("n.md", n);
        let b = &ts[1];
        let out = move_item(n, b.line, &b.key, true).unwrap();
        assert_eq!(
            out,
            "# E\n\n- [ ] B\n  - 2026-10-20 log b\n- [ ] A\n  note a\n  - [ ] a1\n  - [ ] a2\n\n- [ ] C\n"
        );
        // Down past the blank line: the blank line stays between them.
        let out = move_item(n, b.line, &b.key, false).unwrap();
        assert_eq!(
            out,
            "# E\n\n- [ ] A\n  note a\n  - [ ] a1\n  - [ ] a2\n- [ ] C\n\n- [ ] B\n  - 2026-10-20 log b\n"
        );
        // A step moves among the steps of its task only.
        let a2 = &ts[0].steps[1];
        let out = move_item(n, a2.line, &a2.key, true).unwrap();
        assert!(out.contains("  - [ ] a2\n  - [ ] a1\n"), "{out}");
        assert_eq!(
            move_item(n, a2.line, &a2.key, false).unwrap(),
            n,
            "the last step stays"
        );
        assert_eq!(
            move_item(n, ts[0].line, &ts[0].key, true).unwrap(),
            n,
            "the first task stays"
        );
        assert!(move_item(n, b.line, "wrong", true).is_err());
    }

    #[test]
    fn windows_line_endings_are_kept() {
        let n = "- [ ] One\r\n  - [ ] Step\r\n";
        let t = &parse("a.md", n)[0];
        assert_eq!(t.title, "One");
        let out = add_log(n, t.line, &t.key, "2026-10-19", "Hi").unwrap();
        assert_eq!(out, "- [ ] One\r\n  - [ ] Step\r\n  - 2026-10-19 Hi\r\n");
        let out = set_done(n, t.line, &t.key, true).unwrap();
        assert_eq!(out, "- [x] One\r\n  - [ ] Step\r\n");
    }

    #[test]
    fn a_new_task_is_added_at_the_end() {
        assert_eq!(append_task("", "Call Mette", None), "- [ ] Call Mette\n");
        assert_eq!(
            append_task("# Tasks\n", "Call Mette", None),
            "# Tasks\n\n- [ ] Call Mette\n"
        );
        assert_eq!(
            append_task("- [ ] A\n", "B  due:2026-10-20", None),
            "- [ ] A\n- [ ] B due:2026-10-20\n"
        );
    }

    #[test]
    fn the_title_changes_and_the_words_and_tags_stay() {
        let t = &parse("x.md", NOTE)[0];
        let after = set_title(NOTE, t.line, &t.key, "  Renew   the licence ").unwrap();
        let n = &parse("x.md", &after)[0];
        assert_eq!(n.title, "Renew the licence");
        assert_eq!(n.tags, vec!["acme", "licence"]);
        assert_eq!(n.due.as_deref(), Some("2026-11-01"));
        assert_eq!(n.status.as_deref(), Some("waiting"));
        assert_eq!(n.steps.len(), 2);
        assert!(set_title(NOTE, t.line, &t.key, "  ").is_err());
        assert!(set_title(NOTE, t.line, "000000000000", "x").is_err());
        let made = "- [ ] Call made:2026-10-21\n  - [ ] Find the number\n";
        let c = &parse("x.md", made)[0];
        let after = set_title(made, c.line, &c.key, "Call Mette").unwrap();
        assert_eq!(parse("x.md", &after)[0].made.as_deref(), Some("2026-10-21"));
        let s = &c.steps[0];
        let after = set_title(made, s.line, &s.key, "Look up the number").unwrap();
        assert_eq!(parse("x.md", &after)[0].steps[0].text, "Look up the number");
    }

    #[test]
    fn a_task_is_deleted_with_its_steps_and_log_and_nothing_else() {
        let t = &parse("x.md", NOTE)[0];
        let after = delete(NOTE, t.line, &t.key).unwrap();
        assert!(!after.contains("Renew the Acme licence"));
        assert!(!after.contains("Ask Peter"));
        assert!(!after.contains("Mette wants 40 users"));
        assert!(
            after.contains("# Møde med Acme\n\n- [x] Book the room\n"),
            "{after}"
        );
        assert!(delete(NOTE, t.line, "000000000000").is_err());
    }

    #[test]
    fn minutes_are_read_and_written_in_the_short_form() {
        assert_eq!(parse_minutes("15m"), Some(15));
        assert_eq!(parse_minutes("1h"), Some(60));
        assert_eq!(parse_minutes("1h30m"), Some(90));
        assert_eq!(parse_minutes("x"), None);
        assert_eq!(parse_minutes("0m"), None);
        assert_eq!(format_minutes(90), "1h30m");
        assert_eq!(format_minutes(60), "1h");
        assert_eq!(format_minutes(15), "15m");
    }
}
