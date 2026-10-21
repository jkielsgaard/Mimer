//! A trace of the day's work in today's daily note, under the heading `## Worked on`: which notes
//! were written in and which tasks were made, worked on and finished. It is off unless the user
//! turns it on. Each thing is written once a day, however often it is touched, and the lines are
//! plain Markdown that the user can change or remove.

use crate::state::AppState;
use crate::tasks::epics::link_target;
use crate::templates;
use crate::vault::{ops, OpenVault};
use chrono::Local;
use std::collections::HashSet;
use std::sync::Mutex;

/// The heading the lines are kept under.
pub const HEADING: &str = "## Worked on";

/// Something that happened and may be traced.
#[derive(Debug, Clone, Copy)]
pub enum Event<'a> {
    /// A note was written in.
    NoteWritten { path: &'a str },
    /// A task was made.
    TaskNew { title: &'a str, path: &'a str },
    /// A task got a log line, a step, a note or a new status.
    TaskWorked { title: &'a str, path: &'a str },
    /// A task was ticked off.
    TaskDone { title: &'a str, path: &'a str },
}

/// What has been traced today in this vault. A key that is here is never written again, so a line
/// the user removed does not come back while Mimer is running.
#[derive(Debug, Default)]
pub struct Seen {
    scope: String,
    keys: HashSet<String>,
}

/// The shared memory of [`Seen`].
pub type SeenCell = Mutex<Seen>;

fn one_line(s: &str) -> String {
    s.split_whitespace().collect::<Vec<_>>().join(" ")
}

/// The key of a task event: the same title in another note is another task.
fn task_key(kind: &str, title: &str, path: &str) -> String {
    format!(
        "{kind}:{}|{}",
        one_line(title).to_lowercase(),
        path.to_lowercase()
    )
}

/// A link back to the note the task is in (its epic task), for the end of a line.
fn epic_link(path: &str) -> String {
    if path.is_empty() {
        String::new()
    } else {
        format!(" in [[{}]]", link_target(path))
    }
}

/// The key and the line for an event.
fn describe(ev: &Event) -> (String, String) {
    match ev {
        Event::NoteWritten { path } => (
            format!("note:{}", path.to_lowercase()),
            format!("- Wrote in [[{}]]", link_target(path)),
        ),
        Event::TaskNew { title, path } => (
            task_key("new", title, path),
            format!("- New task: {}{}", one_line(title), epic_link(path)),
        ),
        Event::TaskWorked { title, path } => (
            task_key("worked", title, path),
            format!("- Worked on task: {}{}", one_line(title), epic_link(path)),
        ),
        Event::TaskDone { title, path } => (
            task_key("done", title, path),
            format!("- Done: {}{}", one_line(title), epic_link(path)),
        ),
    }
}

/// Adds `line` under the heading `## Worked on` (made at the end when the note has none). Returns
/// `None` when the note already has that line.
pub fn add_line(content: &str, line: &str) -> Option<String> {
    if content.lines().any(|l| l.trim() == line) {
        return None;
    }
    let mut lines: Vec<String> = content.split('\n').map(str::to_string).collect();
    let Some(h) = lines.iter().position(|l| l.trim_end() == HEADING) else {
        let mut out = content.trim_end_matches('\n').to_string();
        if !out.is_empty() {
            out.push_str("\n\n");
        }
        out.push_str(&format!("{HEADING}\n\n{line}\n"));
        return Some(out);
    };
    let end = lines[h + 1..]
        .iter()
        .position(|l| l.starts_with('#'))
        .map_or(lines.len(), |i| h + 1 + i);
    match (h + 1..end).rev().find(|&i| !lines[i].trim().is_empty()) {
        Some(last) => lines.insert(last + 1, line.to_string()),
        None => {
            lines.insert(h + 1, String::new());
            lines.insert(h + 2, line.to_string());
        }
    }
    Some(lines.join("\n"))
}

/// Whether a note is one the trace leaves out: the daily notes themselves, the epic notes (their
/// tasks are traced as tasks), the ideas and anything hidden.
fn left_out(v: &OpenVault, path: &str) -> bool {
    let daily = v.config().daily_notes_folder.trim_matches('/').to_string();
    path.split('/').any(|p| p.starts_with('.'))
        || (!daily.is_empty() && path.starts_with(&format!("{daily}/")))
        || crate::tasks::epics::is_epic_path(path)
        || path == "Ideas.md"
}

/// Writes an event into today's daily note, when the trace is on. It never fails the work that
/// caused it: a problem is only logged.
pub fn record(state: &AppState, v: &OpenVault, ev: &Event) {
    if !state.settings_snapshot().editor.trace_work {
        return;
    }
    if let Event::NoteWritten { path } = ev {
        if left_out(v, path) {
            return;
        }
    }
    let (key, line) = describe(ev);
    let now = Local::now();
    {
        let Ok(mut seen) = state.trace.lock() else {
            return;
        };
        let scope = format!("{}|{}", v.root.display(), now.format("%Y-%m-%d"));
        if seen.scope != scope {
            seen.scope = scope;
            seen.keys.clear();
        }
        // A task made today has no separate "worked on" line.
        if let Event::TaskWorked { title, path } = ev {
            if seen.keys.contains(&task_key("new", title, path)) {
                return;
            }
        }
        if !seen.keys.insert(key) {
            return;
        }
    }
    if let Err(e) = write_line(v, &line, &now) {
        tracing::warn!("Could not trace the work in the daily note: {e}");
    }
}

fn write_line(
    v: &OpenVault,
    line: &str,
    now: &chrono::DateTime<Local>,
) -> crate::error::AppResult<()> {
    let path = templates::open_daily_note(v, None, now)?;
    let note = crate::vault::fs_ops::read_note(&v.root, &path)?;
    if let Some(new) = add_line(&note.content, line) {
        ops::write_note(v, &path, &new)?;
        v.refresh_files();
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn the_heading_is_made_when_the_note_has_none() {
        assert_eq!(
            add_line("# Wed\n\nText\n", "- A").unwrap(),
            "# Wed\n\nText\n\n## Worked on\n\n- A\n"
        );
        assert_eq!(add_line("", "- A").unwrap(), "## Worked on\n\n- A\n");
    }

    #[test]
    fn lines_go_at_the_end_of_the_section_and_a_line_is_never_doubled() {
        let n = "# Wed\n\n## Worked on\n\n- A\n\n## Notes\n\nMine\n";
        let out = add_line(n, "- B").unwrap();
        assert_eq!(
            out,
            "# Wed\n\n## Worked on\n\n- A\n- B\n\n## Notes\n\nMine\n"
        );
        assert!(add_line(&out, "- B").is_none());
        // Text the user wrote in the section stays where it is.
        let n = "## Worked on\n\n- A\nmy own words\n";
        assert_eq!(
            add_line(n, "- B").unwrap(),
            "## Worked on\n\n- A\nmy own words\n- B\n"
        );
        // An empty section gets a blank line after the heading.
        assert_eq!(
            add_line("## Worked on\n## Notes\n", "- A").unwrap(),
            "## Worked on\n\n- A\n## Notes\n"
        );
    }

    #[test]
    fn a_line_is_written_in_a_new_daily_note_and_not_twice() {
        let d = tempfile::tempdir().unwrap();
        let v = crate::vault::open_for_test(d.path());
        let now = Local::now();
        write_line(&v, "- Worked on task: A", &now).unwrap();
        write_line(&v, "- Worked on task: A", &now).unwrap();
        write_line(&v, "- Done: A", &now).unwrap();
        let path = templates::open_daily_note(&v, None, &now).unwrap();
        let text = crate::vault::fs_ops::read_note(&v.root, &path)
            .unwrap()
            .content;
        assert_eq!(text.matches("- Worked on task: A").count(), 1, "{text}");
        assert!(text.contains("## Worked on"), "{text}");
        assert!(text.find("- Worked on task: A") < text.find("- Done: A"));
        assert!(left_out(&v, &path), "the daily note is not traced");
        assert!(left_out(&v, "Tasks/Inbox.md"));
        assert!(!left_out(&v, "Work/VPN.md"));
    }

    #[test]
    fn events_are_described_once_whatever_the_case() {
        let a = describe(&Event::TaskWorked {
            title: "Call  Mette",
            path: "Tasks/VPN guide.md",
        });
        let b = describe(&Event::TaskWorked {
            title: "call mette",
            path: "Tasks/VPN guide.md",
        });
        assert_eq!(a.0, b.0);
        assert_eq!(a.1, "- Worked on task: Call Mette in [[Tasks/VPN guide]]");
        let other = describe(&Event::TaskWorked {
            title: "call mette",
            path: "Tasks/Other.md",
        });
        assert_ne!(a.0, other.0);
        let done = describe(&Event::TaskDone {
            title: "Call Mette",
            path: "Tasks/VPN guide.md",
        });
        assert_eq!(done.1, "- Done: Call Mette in [[Tasks/VPN guide]]");
        let n = describe(&Event::NoteWritten {
            path: "Work/VPN guide.md",
        });
        assert_eq!(n.1, "- Wrote in [[Work/VPN guide]]");
    }
}
