use crate::error::AppError;
use crate::git::{CommitKind, CommitReason};
use crate::state::AppState;
use crate::tasks::ideas::{self, Idea};
use crate::tasks::{self, MetaPatch, Task};
use crate::vault::{fs_ops, ops, tree, OpenVault};
use tauri::State;

/// The most tasks one list holds.
const MAX_TASKS: usize = 5_000;

/// The note that tasks added without a note go into.
const TASKS_NOTE: &str = "Tasks.md";

/// The note that holds the ideas.
const IDEAS_NOTE: &str = "Ideas.md";

fn check_path(path: &str) -> Result<(), AppError> {
    if !tree::is_markdown(path) || path.split('/').any(|p| p.starts_with('.')) {
        return Err(AppError::InvalidPath(format!("{path} is not a note")));
    }
    Ok(())
}

/// The tasks of one note, or none when it cannot be read.
fn tasks_of(v: &OpenVault, path: &str) -> Vec<Task> {
    fs_ops::read_note(&v.root, path)
        .map(|n| tasks::parse(path, &n.content))
        .unwrap_or_default()
}

/// Reads a note, changes it with `f` and writes it back. Returns the note's tasks.
fn edit_note(
    v: &OpenVault,
    path: &str,
    f: impl FnOnce(&str) -> Result<String, AppError>,
) -> Result<Vec<Task>, AppError> {
    check_path(path)?;
    let note = fs_ops::read_note(&v.root, path)?;
    let new = f(&note.content)?;
    if new != note.content {
        ops::write_note(v, path, &new)?;
    }
    Ok(tasks::parse(path, &new))
}

/// Every task in the vault, from every note.
pub(crate) fn all_tasks(v: &OpenVault) -> Vec<Task> {
    let mut out = Vec::new();
    for f in v.file_list().iter().filter(|f| tree::is_markdown(f)) {
        let Ok(note) = fs_ops::read_note(&v.root, f) else {
            continue;
        };
        if !(note.content.contains("[ ]")
            || note.content.contains("[x]")
            || note.content.contains("[X]"))
        {
            continue;
        }
        out.extend(tasks::parse(f, &note.content));
        if out.len() >= MAX_TASKS {
            out.truncate(MAX_TASKS);
            break;
        }
    }
    out
}

/// Every task in the vault, from every note.
#[tauri::command]
pub async fn list_tasks(state: State<'_, AppState>) -> Result<Vec<Task>, AppError> {
    let v = state.current_vault()?;
    Ok(all_tasks(&v))
}

/// Adds a task to the note `Tasks` in the root of the vault (made when it is missing).
/// A note given with it goes into the log of the task, one dated line for each line of the note.
pub(crate) fn add_to_tasks_note(
    v: &OpenVault,
    text: &str,
    note: &str,
    date: &str,
    steps: &[String],
) -> Result<Vec<Task>, AppError> {
    if text.trim().is_empty() {
        return Err(AppError::InvalidPath("The task is empty".into()));
    }
    let existing = fs_ops::read_note(&v.root, TASKS_NOTE)
        .map(|n| n.content)
        .unwrap_or_else(|_| "# Tasks\n".to_string());
    let mut new = tasks::append_task(&existing, text);
    for step in steps.iter().filter(|s| !s.trim().is_empty()) {
        if let Some(t) = tasks::parse(TASKS_NOTE, &new).into_iter().next_back() {
            new = tasks::add_step(&new, t.line, &t.key, step)?;
        }
    }
    if !note.trim().is_empty() {
        let added = tasks::parse(TASKS_NOTE, &new).into_iter().next_back();
        if let Some(t) = added {
            for l in note.lines().filter(|l| !l.trim().is_empty()) {
                new = tasks::add_log(&new, t.line, &t.key, date, l)?;
            }
        }
    }
    ops::write_note(v, TASKS_NOTE, &new)?;
    v.refresh_files();
    Ok(tasks_of(v, TASKS_NOTE))
}

/// Ticks or unticks a task or a step.
#[tauri::command]
pub async fn task_set_done(
    state: State<'_, AppState>,
    path: String,
    line: u32,
    key: String,
    done: bool,
) -> Result<Vec<Task>, AppError> {
    let v = state.current_vault()?;
    edit_note(&v, &path, |c| tasks::set_done(c, line, &key, done))
}

/// Changes the date, plan, status or estimate of a task.
#[tauri::command]
pub async fn task_set_meta(
    state: State<'_, AppState>,
    path: String,
    line: u32,
    key: String,
    patch: MetaPatch,
) -> Result<Vec<Task>, AppError> {
    let v = state.current_vault()?;
    edit_note(&v, &path, |c| tasks::set_meta(c, line, &key, &patch))
}

/// Changes the title of a task or a step.
#[tauri::command]
pub async fn task_set_title(
    state: State<'_, AppState>,
    path: String,
    line: u32,
    key: String,
    title: String,
) -> Result<Vec<Task>, AppError> {
    let v = state.current_vault()?;
    edit_note(&v, &path, |c| tasks::set_title(c, line, &key, &title))
}

/// Adds a step under a task.
#[tauri::command]
pub async fn task_add_step(
    state: State<'_, AppState>,
    path: String,
    line: u32,
    key: String,
    text: String,
) -> Result<Vec<Task>, AppError> {
    let v = state.current_vault()?;
    edit_note(&v, &path, |c| tasks::add_step(c, line, &key, &text))
}

/// Adds a dated line to the log of a task.
#[tauri::command]
pub async fn task_add_log(
    state: State<'_, AppState>,
    path: String,
    line: u32,
    key: String,
    date: String,
    text: String,
) -> Result<Vec<Task>, AppError> {
    let v = state.current_vault()?;
    edit_note(&v, &path, |c| tasks::add_log(c, line, &key, &date, &text))
}

/// Deletes a task with its steps and log. The note is committed first, so the task can be brought
/// back from its history.
pub(crate) fn delete_task(
    v: &OpenVault,
    path: &str,
    line: u32,
    key: &str,
) -> Result<Vec<Task>, AppError> {
    check_path(path)?;
    let title = tasks_of(v, path)
        .into_iter()
        .find(|t| t.line == line)
        .map(|t| t.title)
        .unwrap_or_default();
    v.commit(
        CommitReason::new(
            CommitKind::SnapshotBeforeDelete,
            Some(format!("task \"{title}\" in {path}")),
        ),
        Some(&[path.to_string()]),
    )?;
    edit_note(v, path, |c| tasks::delete(c, line, key))
}

/// Deletes a task. It can be brought back from the note's history.
#[tauri::command]
pub async fn task_delete(
    state: State<'_, AppState>,
    path: String,
    line: u32,
    key: String,
) -> Result<Vec<Task>, AppError> {
    let v = state.current_vault()?;
    delete_task(&v, &path, line, &key)
}

/// Adds checklist lines (tasks) at the end of a note and returns that note's tasks. Tasks the
/// note already has are not added again.
pub(crate) fn add_to_note(
    v: &OpenVault,
    path: &str,
    texts: &[String],
) -> Result<Vec<Task>, AppError> {
    edit_note(v, path, |content| {
        let have: Vec<String> = tasks::parse(path, content)
            .iter()
            .map(|t| t.title.to_lowercase())
            .collect();
        let mut out = content.to_string();
        for text in texts {
            let words = tasks::parse("", &format!("- [ ] {text}\n"));
            let title = words
                .first()
                .map(|t| t.title.to_lowercase())
                .unwrap_or_default();
            if title.is_empty() || have.contains(&title) {
                continue;
            }
            out = tasks::append_task(&out, text);
        }
        Ok(out)
    })
}

/// Adds tasks to a note, for example the ones the AI found in it.
#[tauri::command]
pub async fn task_add_to_note(
    state: State<'_, AppState>,
    path: String,
    texts: Vec<String>,
) -> Result<Vec<Task>, AppError> {
    let v = state.current_vault()?;
    add_to_note(&v, &path, &texts)
}

/// Adds a task to the note `Tasks` in the root of the vault and returns that note's tasks.
#[tauri::command]
pub async fn task_add(
    state: State<'_, AppState>,
    text: String,
    note: Option<String>,
    date: Option<String>,
    steps: Option<Vec<String>>,
) -> Result<Vec<Task>, AppError> {
    let v = state.current_vault()?;
    add_to_tasks_note(
        &v,
        &text,
        note.as_deref().unwrap_or(""),
        date.as_deref()
            .unwrap_or(&chrono::Local::now().format("%Y-%m-%d").to_string()),
        steps.as_deref().unwrap_or(&[]),
    )
}

/// The ideas of the vault, newest first.
pub(crate) fn all_ideas(v: &OpenVault) -> Vec<Idea> {
    let mut list = fs_ops::read_note(&v.root, IDEAS_NOTE)
        .map(|n| ideas::parse(&n.content))
        .unwrap_or_default();
    list.reverse();
    list
}

/// Adds an idea (dated `date`) to the note `Ideas`, made when it is missing.
pub(crate) fn add_idea_to_note(
    v: &OpenVault,
    date: &str,
    text: &str,
    note: &str,
) -> Result<Vec<Idea>, AppError> {
    let existing = fs_ops::read_note(&v.root, IDEAS_NOTE)
        .map(|n| n.content)
        .unwrap_or_default();
    let new = ideas::append(&existing, date, text, note)?;
    ops::write_note(v, IDEAS_NOTE, &new)?;
    v.refresh_files();
    Ok(all_ideas(v))
}

pub(crate) fn set_idea_status(
    v: &OpenVault,
    line: u32,
    key: &str,
    status: Option<&str>,
) -> Result<Vec<Idea>, AppError> {
    let note = fs_ops::read_note(&v.root, IDEAS_NOTE)?;
    let new = ideas::set_status(&note.content, line, key, status)?;
    ops::write_note(v, IDEAS_NOTE, &new)?;
    Ok(all_ideas(v))
}

pub(crate) fn edit_idea_in_note(
    v: &OpenVault,
    line: u32,
    key: &str,
    text: &str,
    note: &str,
) -> Result<Vec<Idea>, AppError> {
    let content = fs_ops::read_note(&v.root, IDEAS_NOTE)?;
    let new = ideas::edit(&content.content, line, key, text, note)?;
    ops::write_note(v, IDEAS_NOTE, &new)?;
    Ok(all_ideas(v))
}

/// Deletes an idea and its note, after committing the note so it can be brought back.
pub(crate) fn delete_idea(v: &OpenVault, line: u32, key: &str) -> Result<Vec<Idea>, AppError> {
    let content = fs_ops::read_note(&v.root, IDEAS_NOTE)?;
    let text = ideas::parse(&content.content)
        .into_iter()
        .find(|i| i.line == line)
        .map(|i| i.text)
        .unwrap_or_default();
    v.commit(
        CommitReason::new(
            CommitKind::SnapshotBeforeDelete,
            Some(format!("idea \"{text}\"")),
        ),
        Some(&[IDEAS_NOTE.to_string()]),
    )?;
    let new = ideas::delete(&content.content, line, key)?;
    ops::write_note(v, IDEAS_NOTE, &new)?;
    Ok(all_ideas(v))
}

/// Deletes an idea. It can be brought back from the history of the note `Ideas`.
#[tauri::command]
pub async fn idea_delete(
    state: State<'_, AppState>,
    line: u32,
    key: String,
) -> Result<Vec<Idea>, AppError> {
    let v = state.current_vault()?;
    delete_idea(&v, line, &key)
}

/// Every idea, newest first.
#[tauri::command]
pub async fn list_ideas(state: State<'_, AppState>) -> Result<Vec<Idea>, AppError> {
    let v = state.current_vault()?;
    Ok(all_ideas(&v))
}

/// Writes an idea down.
#[tauri::command]
pub async fn idea_add(
    state: State<'_, AppState>,
    date: String,
    text: String,
    note: Option<String>,
) -> Result<Vec<Idea>, AppError> {
    let v = state.current_vault()?;
    add_idea_to_note(&v, &date, &text, note.as_deref().unwrap_or(""))
}

/// Changes the text and the small note of an idea.
#[tauri::command]
pub async fn idea_edit(
    state: State<'_, AppState>,
    line: u32,
    key: String,
    text: String,
    note: String,
) -> Result<Vec<Idea>, AppError> {
    let v = state.current_vault()?;
    edit_idea_in_note(&v, line, &key, &text, &note)
}

/// Marks an idea as used (turned into something) or archived; none makes it open again.
#[tauri::command]
pub async fn idea_set_status(
    state: State<'_, AppState>,
    line: u32,
    key: String,
    status: Option<String>,
) -> Result<Vec<Idea>, AppError> {
    let v = state.current_vault()?;
    set_idea_status(&v, line, &key, status.as_deref())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::vault::open_for_test;

    #[test]
    fn tasks_are_collected_from_every_note_and_changed_in_place() {
        let d = tempfile::tempdir().unwrap();
        let v = open_for_test(d.path());
        std::fs::create_dir_all(d.path().join("Møder")).unwrap();
        std::fs::write(
            d.path().join("Møder/Acme.md"),
            "# Acme\n\n- [ ] Renew the licence due:2026-11-01\n  - [ ] Ask Peter\n",
        )
        .unwrap();
        std::fs::write(d.path().join("Plain.md"), "no tasks here\n").unwrap();
        v.refresh_files();
        let all = all_tasks(&v);
        assert_eq!(all.len(), 1);
        let t = &all[0];
        assert_eq!(t.path, "Møder/Acme.md");

        let after = edit_note(&v, &t.path, |c| {
            tasks::set_done(c, t.steps[0].line, &t.steps[0].key, true)
        })
        .unwrap();
        assert!(after[0].steps[0].done);
        assert!(std::fs::read_to_string(d.path().join("Møder/Acme.md"))
            .unwrap()
            .contains("  - [x] Ask Peter"));
        // A stale key is refused and the file stays as it is.
        let before = std::fs::read_to_string(d.path().join("Møder/Acme.md")).unwrap();
        let stale = edit_note(&v, &t.path, |c| {
            tasks::set_done(c, t.line, "000000000000", true)
        });
        assert!(matches!(stale, Err(AppError::Conflict(_))));
        assert_eq!(
            std::fs::read_to_string(d.path().join("Møder/Acme.md")).unwrap(),
            before
        );
        // Only notes can be edited.
        assert!(edit_note(&v, ".vault/x.md", |c| Ok(c.to_string())).is_err());
        assert!(edit_note(&v, "../x.md", |c| Ok(c.to_string())).is_err());
    }

    #[test]
    fn tasks_found_by_the_ai_are_added_to_the_note_once() {
        let d = tempfile::tempdir().unwrap();
        let v = open_for_test(d.path());
        std::fs::write(
            d.path().join("Meeting.md"),
            "# Meeting\n\n- [ ] Ask Peter\n",
        )
        .unwrap();
        v.refresh_files();
        let after = add_to_note(
            &v,
            "Meeting.md",
            &[
                "Send the quote due:2026-10-23".into(),
                "ask peter".into(),
                "  ".into(),
            ],
        )
        .unwrap();
        assert_eq!(after.len(), 2, "{after:#?}");
        assert_eq!(after[1].title, "Send the quote");
        assert_eq!(after[1].due.as_deref(), Some("2026-10-23"));
        let text = std::fs::read_to_string(d.path().join("Meeting.md")).unwrap();
        assert_eq!(
            text,
            "# Meeting\n\n- [ ] Ask Peter\n- [ ] Send the quote due:2026-10-23\n"
        );
        assert!(add_to_note(&v, "../x.md", &["a".into()]).is_err());
    }

    #[test]
    fn a_task_added_without_a_note_goes_into_tasks_md() {
        let d = tempfile::tempdir().unwrap();
        let v = open_for_test(d.path());
        let list =
            add_to_tasks_note(&v, "Call Mette due:2026-10-20", "", "2026-10-19", &[]).unwrap();
        assert_eq!(list.len(), 1);
        assert_eq!(list[0].title, "Call Mette");
        let list = add_to_tasks_note(
            &v,
            "Order headsets",
            "Ask Mette\n\nThe grey ones",
            "2026-10-19",
            &["Find the model".into(), "Order".into()],
        )
        .unwrap();
        assert_eq!(list.len(), 2);
        let log: Vec<&str> = list[1].log.iter().map(|l| l.text.as_str()).collect();
        assert_eq!(log, ["Ask Mette", "The grey ones"]);
        let steps: Vec<&str> = list[1].steps.iter().map(|s| s.text.as_str()).collect();
        assert_eq!(steps, ["Find the model", "Order"]);
        let text = std::fs::read_to_string(d.path().join("Tasks.md")).unwrap();
        assert!(text.starts_with("# Tasks\n\n- [ ] Call Mette"), "{text}");
        assert!(add_to_tasks_note(&v, "  ", "", "2026-10-19", &[]).is_err());
        let after = delete_task(&v, "Tasks.md", list[1].line, &list[1].key).unwrap();
        assert_eq!(after.len(), 1);
        assert!(!std::fs::read_to_string(d.path().join("Tasks.md"))
            .unwrap()
            .contains("Order headsets"));
        assert_eq!(all_tasks(&v).len(), 1);
    }

    #[test]
    fn ideas_are_written_and_marked_in_the_ideas_note() {
        let d = tempfile::tempdir().unwrap();
        let v = open_for_test(d.path());
        assert!(all_ideas(&v).is_empty());
        add_idea_to_note(&v, "2026-10-18", "First idea", "").unwrap();
        let list = add_idea_to_note(&v, "2026-10-19", "Second idea #work", "A note").unwrap();
        assert_eq!(
            list.iter().map(|i| i.text.as_str()).collect::<Vec<_>>(),
            ["Second idea", "First idea"]
        );
        let first = &list[0];
        let after = set_idea_status(&v, first.line, &first.key, Some("used")).unwrap();
        assert_eq!(after[0].status.as_deref(), Some("used"));
        let text = std::fs::read_to_string(d.path().join("Ideas.md")).unwrap();
        assert!(
            text.contains("- 2026-10-19 Second idea #work status:used"),
            "{text}"
        );
        assert_eq!(after[0].note, "A note");
        let edited =
            edit_idea_in_note(&v, after[0].line, &after[0].key, "Second #work", "Changed").unwrap();
        assert_eq!(edited[0].note, "Changed");
        assert_eq!(edited[0].status.as_deref(), Some("used"));
        // Deleting an idea commits the note first, so it is in the history.
        let gone = delete_idea(&v, edited[1].line, &edited[1].key).unwrap();
        assert_eq!(gone.len(), 1);
        // The ideas never show up as tasks.
        assert!(all_tasks(&v).is_empty());
    }
}
