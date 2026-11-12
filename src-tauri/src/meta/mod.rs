//! `.vault/meta.json`: what Mimer keeps track of itself, and that is not the text of a note: which
//! notes are pinned to the start page, and for a task what it waits for (a few words, or another
//! task) and the history of its status changes. The notes stay plain Markdown without it.
//!
//! The file is plain JSON, written atomically, with its keys in a fixed order, and committed with
//! the vault (like `order.json`), so it follows the notes into the history and the backup. A file
//! that is missing means "nothing yet"; a file that cannot be read is never overwritten (the change
//! is refused with a message), so a damaged file cannot be replaced by an empty one.
//!
//! A task is named by `note path without .md#title` (the same words the frontend uses), so a
//! change of its title, or of the note's path, in Mimer moves its entry with it. A change made in
//! another program leaves the entry behind; the task then simply has nothing waiting.

pub mod migrate;

use crate::error::{AppError, AppResult};
use crate::tasks::Task;
use crate::vault::{fs_ops, paths};
use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;
use std::path::Path;
use std::sync::Mutex;
use ts_rs::TS;

/// Where the file is, inside the vault.
pub const FILE: &str = ".vault/meta.json";

/// Most pinned notes and most history lines per task that are kept (a limit against a runaway file).
const MAX_PINNED: usize = 1_000;
const MAX_HISTORY: usize = 200;

/// One change of a task, written by Mimer: "Status: doing", "Waiting for: the customer".
#[derive(Debug, Clone, PartialEq, Eq, Default, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase", default)]
#[ts(export)]
pub struct TaskHistory {
    /// `YYYY-MM-DD`.
    pub date: String,
    pub text: String,
}

/// What Mimer keeps about one task.
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct TaskMeta {
    /// Who or what the task waits for, in the person's words.
    pub waiting_for: Option<String>,
    /// The task it waits for, as `note path without .md#title`.
    pub after: Option<String>,
    pub history: Vec<TaskHistory>,
}

impl TaskMeta {
    fn is_empty(&self) -> bool {
        self.waiting_for.is_none() && self.after.is_none() && self.history.is_empty()
    }
}

/// The whole file.
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct Meta {
    pub schema_version: u32,
    /// The pinned notes, by path.
    pub pinned: Vec<String>,
    /// The tasks that have something kept, by `task_ref`.
    pub tasks: BTreeMap<String, TaskMeta>,
}

/// The words that name a task: the note's path without `.md`, `#`, and the title.
pub fn task_ref(path: &str, title: &str) -> String {
    let base = path
        .strip_suffix(".md")
        .or_else(|| path.strip_suffix(".MD"))
        .unwrap_or(path);
    format!("{base}#{title}")
}

/// Serialises read-change-write of the file, so two changes at once cannot lose one.
static LOCK: Mutex<()> = Mutex::new(());

/// Reads the file. `Ok(default)` when it is missing, an error when it is there but unreadable.
fn read_strict(root: &Path) -> AppResult<Meta> {
    let abs = paths::resolve_internal(root, FILE)?;
    match std::fs::read_to_string(&abs) {
        Ok(text) => serde_json::from_str(&text).map_err(|e| {
            AppError::Settings(format!(
                "The file {FILE} cannot be read ({e}). Mimer leaves it as it is. Fix it, or take it away (History has the earlier version)."
            ))
        }),
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(Meta::default()),
        Err(e) => Err(e.into()),
    }
}

/// Reads the file for showing: anything wrong counts as "nothing yet".
pub fn load(root: &Path) -> Meta {
    read_strict(root).unwrap_or_default()
}

fn write(root: &Path, mut meta: Meta) -> AppResult<()> {
    meta.schema_version = 1;
    meta.pinned.sort();
    meta.pinned.dedup();
    meta.pinned.truncate(MAX_PINNED);
    meta.tasks.retain(|_, t| !t.is_empty());
    for t in meta.tasks.values_mut() {
        let extra = t.history.len().saturating_sub(MAX_HISTORY);
        t.history.drain(..extra);
    }
    let abs = paths::resolve_internal(root, FILE)?;
    if meta.pinned.is_empty() && meta.tasks.is_empty() && !abs.exists() {
        return Ok(()); // nothing to keep, and no file yet: do not make one
    }
    fs_ops::write_atomic(&abs, serde_json::to_string_pretty(&meta)?.as_bytes())
}

/// Changes the file: reads it, runs `f` and writes it back when `f` changed something (`true`).
/// Returns whether it was written.
pub fn change(root: &Path, f: impl FnOnce(&mut Meta) -> bool) -> AppResult<bool> {
    let _guard = LOCK
        .lock()
        .map_err(|_| AppError::Io("Meta lock poisoned".into()))?;
    let mut meta = read_strict(root)?;
    if !f(&mut meta) {
        return Ok(false);
    }
    write(root, meta)?;
    Ok(true)
}

/// Puts what Mimer keeps about each task on the tasks read from the notes. What the note's own
/// line says (the old words `for:` and `after:`) counts until the file has an answer.
pub fn overlay(meta: &Meta, tasks: &mut [Task]) {
    if meta.tasks.is_empty() {
        return;
    }
    for t in tasks {
        if let Some(m) = meta.tasks.get(&task_ref(&t.path, &t.title)) {
            if m.waiting_for.is_some() {
                t.waiting_for.clone_from(&m.waiting_for);
            }
            if m.after.is_some() {
                t.after.clone_from(&m.after);
            }
            t.history.clone_from(&m.history);
        }
    }
}

/// The tasks with what the file keeps put on them.
pub fn overlaid(root: &Path, mut tasks: Vec<Task>) -> Vec<Task> {
    overlay(&load(root), &mut tasks);
    tasks
}

/// Sets what a task waits for and the task it waits for. `None` leaves a value alone,
/// `Some(None)` takes it away.
pub fn set_waiting(
    root: &Path,
    path: &str,
    title: &str,
    waiting_for: Option<Option<String>>,
    after: Option<Option<String>>,
) -> AppResult<()> {
    let key = task_ref(path, title);
    change(root, |m| {
        let (changed, empty) = {
            let e = m.tasks.entry(key.clone()).or_default();
            let before = (e.waiting_for.clone(), e.after.clone());
            if let Some(v) = waiting_for {
                e.waiting_for = v.filter(|s| !s.trim().is_empty());
            }
            if let Some(v) = after {
                e.after = v.filter(|s| !s.trim().is_empty());
            }
            (
                before != (e.waiting_for.clone(), e.after.clone()),
                e.is_empty(),
            )
        };
        if empty {
            m.tasks.remove(&key);
        }
        changed
    })
    .map(|_| ())
}

/// Adds a line to the history of a task ("Status: doing").
pub fn add_history(root: &Path, path: &str, title: &str, date: &str, text: &str) -> AppResult<()> {
    let text = text.split_whitespace().collect::<Vec<_>>().join(" ");
    if text.is_empty() {
        return Err(AppError::InvalidPath("The history line is empty".into()));
    }
    let key = task_ref(path, title);
    change(root, |m| {
        m.tasks.entry(key).or_default().history.push(TaskHistory {
            date: date.to_string(),
            text,
        });
        true
    })
    .map(|_| ())
}

/// A task got a new title: its entry moves with it, and so do the tasks that wait for it.
pub fn rename_task(root: &Path, path: &str, old_title: &str, new_title: &str) -> AppResult<()> {
    let (old, new) = (task_ref(path, old_title), task_ref(path, new_title));
    if old == new {
        return Ok(());
    }
    change(root, |m| {
        let mut changed = false;
        if let Some(e) = m.tasks.remove(&old) {
            m.tasks.insert(new.clone(), e);
            changed = true;
        }
        for e in m.tasks.values_mut() {
            if e.after.as_deref() == Some(old.as_str()) {
                e.after = Some(new.clone());
                changed = true;
            }
        }
        changed
    })
    .map(|_| ())
}

/// A task was deleted: what is kept about it goes too.
pub fn forget_task(root: &Path, path: &str, title: &str) -> AppResult<()> {
    let key = task_ref(path, title);
    change(root, |m| m.tasks.remove(&key).is_some()).map(|_| ())
}

/// `path` after `from` was moved to `to` (a note or a folder), or `None` when it is not affected.
fn moved(path: &str, from: &str, to: &str) -> Option<String> {
    if path == from {
        return Some(to.to_string());
    }
    path.strip_prefix(from)
        .and_then(|rest| rest.strip_prefix('/'))
        .map(|rest| format!("{to}/{rest}"))
}

/// The same for a task name (`note path without .md#title`).
fn moved_ref(task: &str, from: &str, to: &str) -> Option<String> {
    let strip = |p: &str| p.strip_suffix(".md").unwrap_or(p).to_string();
    if from.ends_with(".md") {
        let (f, t) = (strip(from), strip(to));
        task.strip_prefix(&format!("{f}#"))
            .map(|rest| format!("{t}#{rest}"))
    } else {
        task.strip_prefix(&format!("{from}/"))
            .map(|rest| format!("{to}/{rest}"))
    }
}

/// A note or a folder was moved in Mimer: the pins and the tasks in it follow. Returns whether the
/// file changed. A file that cannot be read is left alone (the move goes on).
pub fn rename_path(root: &Path, from: &str, to: &str) -> bool {
    change(root, |m| {
        let mut changed = false;
        for p in &mut m.pinned {
            if let Some(n) = moved(p, from, to) {
                *p = n;
                changed = true;
            }
        }
        let old = std::mem::take(&mut m.tasks);
        for (k, mut e) in old {
            if let Some(a) = e.after.as_deref().and_then(|a| moved_ref(a, from, to)) {
                e.after = Some(a);
                changed = true;
            }
            let key = match moved_ref(&k, from, to) {
                Some(n) => {
                    changed = true;
                    n
                }
                None => k,
            };
            m.tasks.insert(key, e);
        }
        changed
    })
    .unwrap_or(false)
}

/// Pins a note to the start page, or unpins it.
pub fn set_pinned(root: &Path, path: &str, on: bool) -> AppResult<()> {
    change(root, |m| {
        let had = m.pinned.iter().any(|p| p == path);
        match (on, had) {
            (true, false) => {
                m.pinned.push(path.to_string());
                true
            }
            (false, true) => {
                m.pinned.retain(|p| p != path);
                true
            }
            _ => false,
        }
    })
    .map(|_| ())
}

/// Whether a note is pinned.
pub fn is_pinned(root: &Path, path: &str) -> bool {
    load(root).pinned.iter().any(|p| p == path)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn vault() -> tempfile::TempDir {
        let d = tempfile::tempdir().unwrap();
        std::fs::create_dir_all(d.path().join(".vault")).unwrap();
        d
    }

    fn file(d: &tempfile::TempDir) -> String {
        std::fs::read_to_string(d.path().join(FILE)).unwrap_or_default()
    }

    #[test]
    fn a_task_is_named_by_its_note_without_md_and_its_title() {
        assert_eq!(
            task_ref("IT/Network.md", "Test setup"),
            "IT/Network#Test setup"
        );
        assert_eq!(task_ref("Plain", "T"), "Plain#T");
    }

    #[test]
    fn nothing_is_written_until_there_is_something_to_keep() {
        let d = vault();
        assert!(!change(d.path(), |_| false).unwrap());
        set_pinned(d.path(), "A.md", false).unwrap();
        set_waiting(d.path(), "A.md", "T", None, None).unwrap();
        assert!(!d.path().join(FILE).exists());
        set_pinned(d.path(), "A.md", true).unwrap();
        assert!(file(&d).contains("\"A.md\""));
        assert!(is_pinned(d.path(), "A.md"));
        set_pinned(d.path(), "A.md", false).unwrap();
        assert!(!is_pinned(d.path(), "A.md"));
    }

    #[test]
    fn what_a_task_waits_for_is_kept_and_put_on_the_task() {
        let d = vault();
        set_waiting(
            d.path(),
            "IT/N.md",
            "Upgrade",
            Some(Some("the customer: reply".into())),
            Some(Some("IT/N#Test".into())),
        )
        .unwrap();
        add_history(
            d.path(),
            "IT/N.md",
            "Upgrade",
            "2026-11-10",
            "Status:   waiting",
        )
        .unwrap();
        let mut tasks = crate::tasks::parse("IT/N.md", "- [ ] Upgrade\n- [ ] Other\n");
        overlay(&load(d.path()), &mut tasks);
        assert_eq!(tasks[0].waiting_for.as_deref(), Some("the customer: reply"));
        assert_eq!(tasks[0].after.as_deref(), Some("IT/N#Test"));
        assert_eq!(tasks[0].history[0].text, "Status: waiting");
        assert!(tasks[1].waiting_for.is_none() && tasks[1].history.is_empty());
        // Taking them away leaves the history, and then nothing at all.
        set_waiting(d.path(), "IT/N.md", "Upgrade", Some(None), Some(None)).unwrap();
        assert!(load(d.path()).tasks["IT/N#Upgrade"].waiting_for.is_none());
        forget_task(d.path(), "IT/N.md", "Upgrade").unwrap();
        assert!(load(d.path()).tasks.is_empty());
    }

    #[test]
    fn what_a_note_still_says_counts_until_the_file_has_an_answer() {
        let d = vault();
        let mut tasks = crate::tasks::parse("A.md", "- [ ] Old for:\"a thing\" after:\"B#C\"\n");
        overlay(&load(d.path()), &mut tasks);
        assert_eq!(tasks[0].waiting_for.as_deref(), Some("a thing"));
        set_waiting(d.path(), "A.md", "Old", Some(Some("new".into())), None).unwrap();
        overlay(&load(d.path()), &mut tasks);
        assert_eq!(tasks[0].waiting_for.as_deref(), Some("new"));
        assert_eq!(tasks[0].after.as_deref(), Some("B#C"));
    }

    #[test]
    fn a_new_title_moves_the_entry_and_the_tasks_that_wait_for_it() {
        let d = vault();
        set_waiting(d.path(), "A.md", "Test", Some(Some("x".into())), None).unwrap();
        set_waiting(
            d.path(),
            "A.md",
            "Upgrade",
            None,
            Some(Some("A#Test".into())),
        )
        .unwrap();
        rename_task(d.path(), "A.md", "Test", "Lab").unwrap();
        let m = load(d.path());
        assert!(m.tasks.contains_key("A#Lab") && !m.tasks.contains_key("A#Test"));
        assert_eq!(m.tasks["A#Upgrade"].after.as_deref(), Some("A#Lab"));
    }

    #[test]
    fn a_moved_note_or_folder_takes_its_pins_and_tasks_with_it() {
        let d = vault();
        set_pinned(d.path(), "Work/A.md", true).unwrap();
        set_pinned(d.path(), "Work/Sub/B.md", true).unwrap();
        set_pinned(d.path(), "Other.md", true).unwrap();
        set_waiting(
            d.path(),
            "Work/A.md",
            "T",
            Some(Some("w".into())),
            Some(Some("Work/Sub/B#U".into())),
        )
        .unwrap();
        assert!(rename_path(d.path(), "Work", "Jobs"));
        let m = load(d.path());
        assert_eq!(m.pinned, vec!["Jobs/A.md", "Jobs/Sub/B.md", "Other.md"]);
        assert_eq!(m.tasks["Jobs/A#T"].after.as_deref(), Some("Jobs/Sub/B#U"));
        assert!(rename_path(d.path(), "Jobs/A.md", "Jobs/C.md"));
        assert!(load(d.path()).tasks.contains_key("Jobs/C#T"));
        assert!(!rename_path(d.path(), "Nothing.md", "Else.md"));
    }

    #[test]
    fn a_file_that_cannot_be_read_is_never_overwritten() {
        let d = vault();
        std::fs::write(d.path().join(FILE), "{ not json").unwrap();
        assert!(load(d.path()).pinned.is_empty());
        let err = set_pinned(d.path(), "A.md", true).unwrap_err().to_string();
        assert!(err.contains("cannot be read"), "{err}");
        assert_eq!(file(&d), "{ not json");
    }

    #[test]
    fn the_file_has_its_keys_in_a_fixed_order_and_keeps_at_most_so_much() {
        let d = vault();
        set_pinned(d.path(), "B.md", true).unwrap();
        set_pinned(d.path(), "A.md", true).unwrap();
        assert_eq!(load(d.path()).pinned, vec!["A.md", "B.md"]);
        for i in 0..(MAX_HISTORY + 5) {
            add_history(d.path(), "A.md", "T", "2026-11-10", &format!("line {i}")).unwrap();
        }
        let h = &load(d.path()).tasks["A#T"].history;
        assert_eq!(h.len(), MAX_HISTORY);
        assert_eq!(h.last().unwrap().text, format!("line {}", MAX_HISTORY + 4));
    }
}
