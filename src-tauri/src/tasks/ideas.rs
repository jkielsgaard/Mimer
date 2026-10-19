//! Ideas: dated lines in the note `Ideas` (`- 2026-10-19 Use Mimer for the weekly status #work`),
//! with an optional small note under the line, indented by two spaces. They are plain Markdown
//! like tasks, but they are not checkboxes, so they never show up as tasks. An idea can be turned
//! into something (a task or a note) or archived; that is written in the line as `status:used` or
//! `status:archived`.

use super::line_key;
use crate::error::{AppError, AppResult};
use regex::Regex;
use serde::Serialize;
use std::sync::LazyLock;
use ts_rs::TS;

/// One idea.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct Idea {
    /// 0-based line in the note.
    pub line: u32,
    pub key: String,
    /// `YYYY-MM-DD`.
    pub date: String,
    pub text: String,
    pub tags: Vec<String>,
    /// `used` (turned into something) or `archived`; none = open.
    pub status: Option<String>,
    /// The small note under the idea (empty when there is none).
    pub note: String,
}

static IDEA_RE: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(r"^[-*+]\s+(\d{4}-\d{2}-\d{2})\s+(.+)$").expect("valid idea regex")
});
static STATUS_RE: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r"(?:^|\s)status:(\S+)").expect("valid status regex"));
static TAG_RE: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(r"(^|\s)#([\p{L}\p{N}_/-]*\p{L}[\p{L}\p{N}_/-]*)").expect("valid tag regex")
});

/// A line that belongs to the note of the idea above it: indented.
fn is_note_line(line: &str) -> bool {
    line.starts_with("  ") || line.starts_with('\t')
}

/// Without the indent.
fn unindent(line: &str) -> &str {
    line.strip_prefix("  ")
        .or_else(|| line.strip_prefix('\t'))
        .unwrap_or(line)
}

/// How many indented lines follow `line` in `lines`.
fn note_len(lines: &[String], line: usize) -> usize {
    lines[line + 1..]
        .iter()
        .take_while(|l| is_note_line(l.trim_end_matches('\r')))
        .count()
}

/// Reads the ideas of the note.
pub fn parse(content: &str) -> Vec<Idea> {
    let lines: Vec<&str> = content
        .split('\n')
        .map(|l| l.trim_end_matches('\r'))
        .collect();
    let mut out = Vec::new();
    let mut in_code = false;
    let mut n = 0;
    while n < lines.len() {
        let line = lines[n];
        n += 1;
        if line.trim_start().starts_with("```") {
            in_code = !in_code;
            continue;
        }
        if in_code {
            continue;
        }
        let Some(c) = IDEA_RE.captures(line) else {
            continue;
        };
        let mut note_lines = Vec::new();
        while n < lines.len() && is_note_line(lines[n]) {
            note_lines.push(unindent(lines[n]));
            n += 1;
        }
        let body = &c[2];
        let status = STATUS_RE
            .captures(body)
            .map(|s| s[1].to_lowercase())
            // Ideas used to be "kept" too; that is just an open idea now.
            .filter(|s| s != "kept");
        let tags = TAG_RE
            .captures_iter(body)
            .map(|t| t[2].to_string())
            .collect();
        let no_status = STATUS_RE.replace_all(body, "");
        let no_tags = TAG_RE.replace_all(&no_status, "$1");
        out.push(Idea {
            line: (n - 1 - note_lines.len()) as u32,
            key: line_key(line),
            date: c[1].to_string(),
            text: no_tags.split_whitespace().collect::<Vec<_>>().join(" "),
            tags,
            status,
            note: note_lines.join("\n").trim().to_string(),
        });
    }
    out
}

/// The lines of a note, indented under the idea. Blank lines inside it are kept.
fn note_block(note: &str) -> Vec<String> {
    if note.trim().is_empty() {
        return Vec::new();
    }
    note.trim()
        .split('\n')
        .map(|l| l.trim_end())
        .map(|l| {
            if l.is_empty() {
                "  ".to_string()
            } else {
                format!("  {l}")
            }
        })
        .collect()
}

fn one_line(text: &str) -> AppResult<String> {
    let text = STATUS_RE
        .replace_all(&text.split_whitespace().collect::<Vec<_>>().join(" "), "")
        .trim()
        .to_string();
    if text.is_empty() {
        return Err(AppError::InvalidPath("The idea is empty".into()));
    }
    Ok(text)
}

/// Adds an idea, with a small note when given, at the end of the note.
pub fn append(content: &str, date: &str, text: &str, note: &str) -> AppResult<String> {
    let text = one_line(text)?;
    let mut out = content.trim_end_matches('\n').to_string();
    if out.is_empty() {
        out.push_str("# Ideas\n\n");
    } else {
        out.push('\n');
        let last = out.lines().last().unwrap_or("");
        if !IDEA_RE.is_match(last) && !is_note_line(last) {
            out.push('\n');
        }
    }
    out.push_str(&format!("- {date} {text}\n"));
    for l in note_block(note) {
        out.push_str(&l);
        out.push('\n');
    }
    Ok(out)
}

/// The line of an idea, checked against what was read, and the number of its note lines.
fn find(lines: &[String], line: u32, key: &str) -> AppResult<usize> {
    let stale = || {
        AppError::Conflict("The note changed since the idea list was read. Reload the list.".into())
    };
    let at = line as usize;
    let bare = lines.get(at).ok_or_else(stale)?.trim_end_matches('\r');
    if line_key(bare) != key || !IDEA_RE.is_match(bare) {
        return Err(stale());
    }
    Ok(at)
}

/// Sets or removes the status of an idea, after checking that the line is still the one read.
pub fn set_status(content: &str, line: u32, key: &str, status: Option<&str>) -> AppResult<String> {
    if let Some(s) = status {
        if !matches!(s, "used" | "archived") {
            return Err(AppError::InvalidPath(format!("{s} is not a status")));
        }
    }
    let mut lines: Vec<String> = content.split('\n').map(str::to_string).collect();
    let at = find(&lines, line, key)?;
    let cr = lines[at].ends_with('\r');
    let bare = lines[at].trim_end_matches('\r');
    let mut text = STATUS_RE.replace_all(bare, "").trim_end().to_string();
    if let Some(s) = status {
        text.push_str(&format!(" status:{s}"));
    }
    if cr {
        text.push('\r');
    }
    lines[at] = text;
    Ok(lines.join("\n"))
}

/// Changes the text (with its #tags) and the small note of an idea. Its date and status stay.
pub fn edit(content: &str, line: u32, key: &str, text: &str, note: &str) -> AppResult<String> {
    let text = one_line(text)?;
    let mut lines: Vec<String> = content.split('\n').map(str::to_string).collect();
    let at = find(&lines, line, key)?;
    let cr = lines[at].ends_with('\r');
    let bare = lines[at].trim_end_matches('\r').to_string();
    let date = IDEA_RE
        .captures(&bare)
        .map(|c| c[1].to_string())
        .unwrap_or_default();
    let status = STATUS_RE
        .captures(&bare)
        .map(|s| s[1].to_lowercase())
        .filter(|s| matches!(s.as_str(), "used" | "archived"));
    let mut title = format!("- {date} {text}");
    if let Some(s) = status {
        title.push_str(&format!(" status:{s}"));
    }
    let end = at + 1 + note_len(&lines, at);
    let mut block = vec![title];
    block.extend(note_block(note));
    if cr {
        for l in &mut block {
            l.push('\r');
        }
    }
    lines.splice(at..end, block);
    Ok(lines.join("\n"))
}

/// Removes an idea and its note.
pub fn delete(content: &str, line: u32, key: &str) -> AppResult<String> {
    let mut lines: Vec<String> = content.split('\n').map(str::to_string).collect();
    let at = find(&lines, line, key)?;
    let end = at + 1 + note_len(&lines, at);
    lines.drain(at..end);
    Ok(lines.join("\n"))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn ideas_are_read_from_dated_bullets_and_never_from_checkboxes_or_code() {
        let note = "# Ideas\n\n- 2026-10-19 Use Mimer for the status #work\n- 2026-10-18 Cheat sheet for VLANs status:kept\n- [ ] A task, not an idea\n- No date here\n\n```\n- 2026-10-17 in code\n```\n";
        let ideas = parse(note);
        assert_eq!(ideas.len(), 2, "{ideas:#?}");
        assert_eq!(ideas[0].text, "Use Mimer for the status");
        assert_eq!(ideas[0].tags, vec!["work"]);
        assert_eq!(ideas[0].status, None);
        assert_eq!(ideas[1].status, None, "an old kept idea is just open");
        assert_eq!(ideas[1].text, "Cheat sheet for VLANs");
        assert_eq!(ideas[0].line, 2);
    }

    #[test]
    fn an_idea_is_appended_and_a_new_note_gets_a_heading() {
        assert_eq!(
            append("", "2026-10-19", "  Call  the bank ", "").unwrap(),
            "# Ideas\n\n- 2026-10-19 Call the bank\n"
        );
        assert_eq!(
            append("# Ideas\n\n- 2026-10-18 A\n", "2026-10-19", "B", "").unwrap(),
            "# Ideas\n\n- 2026-10-18 A\n- 2026-10-19 B\n"
        );
        assert!(append("", "2026-10-19", "  ", "").is_err());
    }

    #[test]
    fn the_status_is_set_changed_and_removed_in_place() {
        let note = "- 2026-10-19 A #x\n- 2026-10-18 B\n";
        let a = &parse(note)[0];
        let used = set_status(note, a.line, &a.key, Some("used")).unwrap();
        assert_eq!(used, "- 2026-10-19 A #x status:used\n- 2026-10-18 B\n");
        let a2 = &parse(&used)[0];
        let archived = set_status(&used, a2.line, &a2.key, Some("archived")).unwrap();
        assert!(archived.starts_with("- 2026-10-19 A #x status:archived\n"));
        let a3 = &parse(&archived)[0];
        let new = set_status(&archived, a3.line, &a3.key, None).unwrap();
        assert_eq!(new, note);
        assert!(set_status(note, a.line, "000000000000", Some("used")).is_err());
        assert!(set_status(note, a.line, &a.key, Some("done")).is_err());
        assert!(set_status(note, a.line, &a.key, Some("kept")).is_err());
    }

    #[test]
    fn an_idea_has_a_small_note_that_can_be_changed_and_never_swallows_the_next_idea() {
        let note = append(
            "",
            "2026-10-19",
            "Cheat sheet #drift",
            "VLAN 10 office\n\nUplink missing",
        )
        .unwrap();
        assert_eq!(
            note,
            "# Ideas\n\n- 2026-10-19 Cheat sheet #drift\n  VLAN 10 office\n  \n  Uplink missing\n"
        );
        let note = append(&note, "2026-10-20", "Second", "").unwrap();
        let list = parse(&note);
        assert_eq!(list.len(), 2, "{list:#?}");
        assert_eq!(list[0].note, "VLAN 10 office\n\nUplink missing");
        assert_eq!(list[0].text, "Cheat sheet");
        assert_eq!(list[1].note, "");
        assert_eq!(list[1].line, 6);

        let edited = edit(
            &note,
            list[0].line,
            &list[0].key,
            "Cheat sheet for VLANs #drift",
            "Only the uplink",
        )
        .unwrap();
        let list = parse(&edited);
        assert_eq!(list[0].text, "Cheat sheet for VLANs");
        assert_eq!(list[0].note, "Only the uplink");
        assert_eq!(list[1].text, "Second");
        // The date and the status stay, and the note can be removed.
        let used = set_status(&edited, list[0].line, &list[0].key, Some("used")).unwrap();
        let l = parse(&used);
        let cleared = edit(&used, l[0].line, &l[0].key, "New title", "").unwrap();
        assert!(
            cleared.contains("- 2026-10-19 New title status:used\n- 2026-10-20 Second"),
            "{cleared}"
        );
        // A stale line is refused.
        assert!(edit(&used, l[0].line, "000000000000", "x", "").is_err());
        assert!(edit(&used, l[0].line, &l[0].key, "  ", "").is_err());
    }

    #[test]
    fn an_idea_is_deleted_with_its_note() {
        let note = "- 2026-10-19 A\n  note\n  more\n- 2026-10-18 B\n";
        let a = &parse(note)[0];
        assert_eq!(delete(note, a.line, &a.key).unwrap(), "- 2026-10-18 B\n");
        assert!(delete(note, a.line, "000000000000").is_err());
    }

    #[test]
    fn windows_line_endings_are_kept_when_an_idea_is_edited() {
        let note = "- 2026-10-19 A\r\n  old\r\n- 2026-10-18 B\r\n";
        let a = &parse(note)[0];
        assert_eq!(a.note, "old");
        let new = edit(note, a.line, &a.key, "A2", "new").unwrap();
        assert_eq!(new, "- 2026-10-19 A2\r\n  new\r\n- 2026-10-18 B\r\n");
    }
}
