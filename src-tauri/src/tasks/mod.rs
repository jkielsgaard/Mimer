//! Tasks that live in notes. A task is a Markdown checklist line (`- [ ] Title #tag due:2026-11-01`);
//! indented checklist lines under it are its steps, and indented quote lines that start with a
//! date (`> 2026-10-14 What happened`) are its log. Everything is plain Markdown, so a note
//! with tasks works in any other editor. This module reads those lines and edits them in place.

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
static TAG_RE: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(r"(^|\s)#([\p{L}\p{N}_/-]*\p{L}[\p{L}\p{N}_/-]*)").expect("valid tag regex")
});
static WORD_RE: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r"(?:^|\s)(due|plan|status|est):(\S+)").expect("valid word regex"));

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
}

fn split_words(text: &str) -> Words {
    let mut w = Words {
        title: String::new(),
        tags: Vec::new(),
        due: None,
        plan: None,
        status: None,
        est: None,
    };
    for c in WORD_RE.captures_iter(text) {
        let (key, value) = (&c[1], c[2].to_string());
        match key {
            "due" if is_date(&value) => w.due = Some(value),
            "plan" if is_date(&value) || value == "later" => w.plan = Some(value),
            "status" => w.status = Some(value.to_lowercase()),
            "est" => w.est = parse_minutes(&value),
            _ => {}
        }
    }
    w.tags = TAG_RE
        .captures_iter(text)
        .map(|c| c[2].to_string())
        .collect();
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
    let mut in_code = false;
    for (j, l) in lines.iter().enumerate().skip(i) {
        let t = l.trim_start();
        if t.starts_with("```") || t.starts_with("~~~") {
            in_code = !in_code;
            live[j] = false;
        } else if in_code {
            live[j] = false;
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
            });
            current = Some((tasks.len() - 1, indent));
            continue;
        }
        if let (Some((idx, task_indent)), Some(c)) = (current, LOG_RE.captures(line)) {
            if indent_of(&c[1]) > task_indent {
                let t = &mut tasks[idx];
                t.log.push(TaskLog {
                    line: n as u32,
                    date: c[2].to_string(),
                    text: c[3].trim().to_string(),
                });
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
        let kept: Vec<&str> = body
            .split_whitespace()
            .filter(|t| {
                (t.starts_with('#') && t.len() > 1)
                    || ["due:", "plan:", "status:", "est:"]
                        .iter()
                        .any(|w| t.starts_with(w) && t.len() > w.len())
            })
            .collect();
        let mut new = format!("{}{title}", &l[..start]);
        for k in kept {
            new.push(' ');
            new.push_str(k);
        }
        new
    })?;
    if empty {
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
    let after = task
        .and_then(|t| t.steps.last().map(|s| s.line as usize))
        .unwrap_or(start);
    Ok(insert_after(
        content,
        after,
        indent + 2,
        format!("- [ ] {text}"),
    ))
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
    Ok(insert_after(
        content,
        end,
        indent + 2,
        format!("> {date} {text}"),
    ))
}

/// Removes a task, with its steps and log, from the note.
pub fn delete(content: &str, line: u32, key: &str) -> AppResult<String> {
    let (start, end, _) = block_end(content, line, key)?;
    let mut lines: Vec<&str> = content.split('\n').collect();
    lines.drain(start..=end);
    Ok(lines.join("\n"))
}

/// Adds a task at the end of a note (a new line, with a blank line before it after other text).
pub fn append_task(content: &str, text: &str) -> String {
    let text = text.split_whitespace().collect::<Vec<_>>().join(" ");
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
    fn steps_and_log_lines_go_where_they_belong() {
        let t = &parse("a.md", NOTE)[0];
        let out = add_step(NOTE, t.line, &t.key, "Send the quote").unwrap();
        let lines: Vec<&str> = out.lines().collect();
        assert_eq!(lines[8], "  - [ ] Send the quote", "after the last step");
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
        assert!(out.starts_with("- [ ] Alone\n  - [ ] First\n  > 2026-10-19 Started\n"));
    }

    #[test]
    fn windows_line_endings_are_kept() {
        let n = "- [ ] One\r\n  - [ ] Step\r\n";
        let t = &parse("a.md", n)[0];
        assert_eq!(t.title, "One");
        let out = add_log(n, t.line, &t.key, "2026-10-19", "Hi").unwrap();
        assert_eq!(out, "- [ ] One\r\n  - [ ] Step\r\n  > 2026-10-19 Hi\r\n");
        let out = set_done(n, t.line, &t.key, true).unwrap();
        assert_eq!(out, "- [x] One\r\n  - [ ] Step\r\n");
    }

    #[test]
    fn a_new_task_is_added_at_the_end() {
        assert_eq!(append_task("", "Call Mette"), "- [ ] Call Mette\n");
        assert_eq!(
            append_task("# Tasks\n", "Call Mette"),
            "# Tasks\n\n- [ ] Call Mette\n"
        );
        assert_eq!(
            append_task("- [ ] A\n", "B  due:2026-10-20"),
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
