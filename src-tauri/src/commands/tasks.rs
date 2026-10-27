use crate::error::AppError;
use crate::git::{CommitKind, CommitReason};
use crate::state::AppState;
use crate::tasks::epics::{self, Epic};
use crate::tasks::ideas::{self, Idea};
use crate::tasks::{self, MetaPatch, Task};
use crate::trace;
use crate::vault::{fs_ops, ops, tree, OpenVault};
use tauri::State;

/// The most tasks one list holds.
const MAX_TASKS: usize = 5_000;

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

/// The task whose block holds `line` (the task itself or one of its steps and log lines).
fn task_containing(tasks: &[Task], line: u32) -> Option<&Task> {
    tasks.iter().find(|t| t.line <= line && line <= t.end)
}

/// Today's date, written as `made:` on the tasks Mimer adds.
fn today() -> String {
    chrono::Local::now().format("%Y-%m-%d").to_string()
}

/// Traces work on the task at `line` in today's daily note (when the trace is on).
fn trace_worked(state: &AppState, v: &OpenVault, tasks: &[Task], line: u32) {
    if let Some(t) = task_containing(tasks, line) {
        trace::record(
            state,
            v,
            &trace::Event::TaskWorked {
                title: &t.title,
                path: &t.path,
            },
        );
    }
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

/// Adds a task to the epic note `path` (made when it is missing and is in `Tasks/`).
/// A note given with it becomes the note of the task, and `steps` go under it as indented
/// checklist lines.
pub(crate) fn add_task_to(
    v: &OpenVault,
    path: &str,
    text: &str,
    note: &str,
    steps: &[String],
) -> Result<Vec<Task>, AppError> {
    if text.trim().is_empty() {
        return Err(AppError::InvalidPath("The task is empty".into()));
    }
    check_path(path)?;
    let existing = match fs_ops::read_note(&v.root, path) {
        Ok(n) => n.content,
        Err(_) if epics::is_epic_path(path) => {
            std::fs::create_dir_all(v.root.join(epics::EPICS_DIR))?;
            let title = if path == epics::INBOX {
                "Inbox".to_string()
            } else {
                path.rsplit('/')
                    .next()
                    .unwrap_or(path)
                    .trim_end_matches(".md")
                    .to_string()
            };
            epics::new_epic_text(&title, None)?
        }
        Err(e) => return Err(e),
    };
    let mut new = tasks::append_task(&existing, text, Some(&today()));
    for step in steps.iter().filter(|s| !s.trim().is_empty()) {
        if let Some(t) = tasks::parse(path, &new).into_iter().next_back() {
            new = tasks::add_step(&new, t.line, &t.key, step)?;
        }
    }
    if !note.trim().is_empty() {
        let added = tasks::parse(path, &new).into_iter().next_back();
        if let Some(t) = added {
            new = tasks::set_note(&new, t.line, &t.key, note)?;
        }
    }
    ops::write_note(v, path, &new)?;
    v.refresh_files();
    Ok(tasks_of(v, path))
}

/// The epic of a note: the note itself when it is in `Tasks/`, else the epic made for it (made
/// now when there is none yet).
pub(crate) fn epic_for_note(v: &OpenVault, note: &str) -> Result<Epic, AppError> {
    check_path(note)?;
    if epics::is_epic_path(note) {
        let n = fs_ops::read_note(&v.root, note)?;
        return Ok(epics::read_epic(note, &n.content));
    }
    let target = epics::link_target(note);
    for e in all_epics(v) {
        if e.source.as_deref() == Some(target.as_str()) {
            return Ok(e);
        }
    }
    let base = epics::file_name_for(
        note.rsplit('/')
            .next()
            .unwrap_or(note)
            .trim_end_matches(".md"),
    );
    create_epic_note(v, &base, Some(&target))
}

/// Makes an epic note in `Tasks/` with a name that is free.
fn create_epic_note(v: &OpenVault, title: &str, source: Option<&str>) -> Result<Epic, AppError> {
    let text = epics::new_epic_text(title, source)?;
    let base = epics::file_name_for(title);
    std::fs::create_dir_all(v.root.join(epics::EPICS_DIR))?;
    let path = fs_ops::create_note(&v.root, epics::EPICS_DIR, Some(&base)).or_else(|_| {
        (2..100)
            .find_map(|i| {
                fs_ops::create_note(&v.root, epics::EPICS_DIR, Some(&format!("{base} {i}"))).ok()
            })
            .ok_or_else(|| AppError::AlreadyExists(format!("{base} already exists")))
    })?;
    ops::write_note(v, &path, &text)?;
    v.refresh_files();
    Ok(epics::read_epic(&path, &text))
}

/// Every epic: a note with the tag `epic`, wherever it is. A note in `Tasks/` without the tag is
/// only a note.
pub(crate) fn all_epics(v: &OpenVault) -> Vec<Epic> {
    let tagged = v
        .with_index(|c| crate::search::notes_with_tag(c, epics::EPIC_TAG))
        .unwrap_or_default();
    let files = v.file_list();
    let mut out: Vec<Epic> = files
        .iter()
        .filter(|f| epics::is_epic_path(f) || tagged.contains(f))
        .filter_map(|f| {
            let n = fs_ops::read_note(&v.root, f).ok()?;
            // The note itself is asked, so a tag just written counts before the index has it.
            crate::markdown::tags::extract_tags(&n.content)
                .iter()
                .any(|t| t == epics::EPIC_TAG)
                .then(|| epics::read_epic(f, &n.content))
        })
        .collect();
    out.sort_by_key(|a| a.title.to_lowercase());
    out
}

/// The epic notes, for the task list.
#[tauri::command]
pub async fn list_epics(state: State<'_, AppState>) -> Result<Vec<Epic>, AppError> {
    let v = state.current_vault()?;
    Ok(all_epics(&v))
}

/// Makes a new, empty epic task: a note in `Tasks/`.
#[tauri::command]
pub async fn epic_create(state: State<'_, AppState>, title: String) -> Result<Epic, AppError> {
    let v = state.current_vault()?;
    create_epic_note(&v, &title, None)
}

/// The epic task of a note. A task written in an ordinary note lives in an epic of its own.
#[tauri::command]
pub async fn epic_for_note_cmd(state: State<'_, AppState>, note: String) -> Result<Epic, AppError> {
    let v = state.current_vault()?;
    epic_for_note(&v, &note)
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
    let list = edit_note(&v, &path, |c| tasks::set_done(c, line, &key, done))?;
    if done {
        match task_containing(&list, line) {
            Some(t) if t.line == line => {
                trace::record(
                    &state,
                    &v,
                    &trace::Event::TaskDone {
                        title: &t.title,
                        path: &t.path,
                    },
                );
            }
            _ => trace_worked(&state, &v, &list, line),
        }
    }
    Ok(list)
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
    let list = edit_note(&v, &path, |c| tasks::set_meta(c, line, &key, &patch))?;
    if patch.status.is_some() {
        trace_worked(&state, &v, &list, line);
    }
    Ok(list)
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

/// Points a task at a note, or takes the link off (`link` is `None`).
#[tauri::command]
pub async fn task_set_link(
    state: State<'_, AppState>,
    path: String,
    line: u32,
    key: String,
    link: Option<String>,
) -> Result<Vec<Task>, AppError> {
    let v = state.current_vault()?;
    edit_note(&v, &path, |c| {
        tasks::set_link(c, line, &key, link.as_deref())
    })
}

/// Moves a task or a step one place up or down in its note.
#[tauri::command]
pub async fn task_move(
    state: State<'_, AppState>,
    path: String,
    line: u32,
    key: String,
    up: bool,
) -> Result<Vec<Task>, AppError> {
    let v = state.current_vault()?;
    edit_note(&v, &path, |c| tasks::move_item(c, line, &key, up))
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
    let list = edit_note(&v, &path, |c| tasks::add_step(c, line, &key, &text))?;
    trace_worked(&state, &v, &list, line);
    Ok(list)
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
    let list = edit_note(&v, &path, |c| tasks::add_log(c, line, &key, &date, &text))?;
    trace_worked(&state, &v, &list, line);
    Ok(list)
}

/// Changes the date and text of one log line of a task.
#[tauri::command]
pub async fn task_edit_log(
    state: State<'_, AppState>,
    path: String,
    line: u32,
    key: String,
    date: String,
    text: String,
) -> Result<Vec<Task>, AppError> {
    let v = state.current_vault()?;
    edit_note(&v, &path, |c| tasks::edit_log(c, line, &key, &date, &text))
}

/// Deletes one log line of a task. The note is committed first, so it can be brought back.
#[tauri::command]
pub async fn task_delete_log(
    state: State<'_, AppState>,
    path: String,
    line: u32,
    key: String,
) -> Result<Vec<Task>, AppError> {
    let v = state.current_vault()?;
    check_path(&path)?;
    v.commit(
        CommitReason::new(
            CommitKind::SnapshotBeforeDelete,
            Some(format!("log line in {path}")),
        ),
        Some(std::slice::from_ref(&path)),
    )?;
    edit_note(&v, &path, |c| tasks::delete_log(c, line, &key))
}

/// Sets the note of a task (empty text removes it).
#[tauri::command]
pub async fn task_set_note(
    state: State<'_, AppState>,
    path: String,
    line: u32,
    key: String,
    text: String,
) -> Result<Vec<Task>, AppError> {
    let v = state.current_vault()?;
    let list = edit_note(&v, &path, |c| tasks::set_note(c, line, &key, &text))?;
    trace_worked(&state, &v, &list, line);
    Ok(list)
}

/// Sets the description of an epic task: the text under its heading.
#[tauri::command]
pub async fn epic_set_description(
    state: State<'_, AppState>,
    path: String,
    text: String,
) -> Result<Epic, AppError> {
    let v = state.current_vault()?;
    check_path(&path)?;
    if !epics::is_epic_path(&path) {
        return Err(AppError::InvalidPath(format!("{path} is not an epic task")));
    }
    let note = fs_ops::read_note(&v.root, &path)?;
    let new = epics::set_description(&note.content, &text);
    if new != note.content {
        ops::write_note(&v, &path, &new)?;
    }
    Ok(epics::read_epic(&path, &new))
}

/// Makes a note with tasks an epic by giving it the tag `epic`; nothing else in it changes.
#[tauri::command]
pub async fn epic_adopt(state: State<'_, AppState>, path: String) -> Result<Epic, AppError> {
    let v = state.current_vault()?;
    check_path(&path)?;
    let note = fs_ops::read_note(&v.root, &path)?;
    let new = crate::markdown::note_tags::add_tag(&note.content, epics::EPIC_TAG);
    if new != note.content {
        ops::write_note(&v, &path, &new)?;
    }
    Ok(epics::read_epic(&path, &new))
}

/// The tags in the properties of a note (lower case).
#[tauri::command]
pub async fn note_tags(state: State<'_, AppState>, path: String) -> Result<Vec<String>, AppError> {
    let v = state.current_vault()?;
    check_path(&path)?;
    let note = fs_ops::read_note(&v.root, &path)?;
    Ok(crate::markdown::note_tags::front_matter_tags(&note.content))
}

/// Puts a tag on a note or takes it off, in the properties. Nothing else in the note changes.
/// Returns the tags the note has afterwards.
#[tauri::command]
pub async fn note_set_tag(
    state: State<'_, AppState>,
    path: String,
    tag: String,
    on: bool,
) -> Result<Vec<String>, AppError> {
    use crate::markdown::note_tags;
    let v = state.current_vault()?;
    check_path(&path)?;
    let tag = tag.trim().to_lowercase();
    if tag.is_empty()
        || !tag
            .chars()
            .all(|c| c.is_alphanumeric() || matches!(c, '-' | '_'))
    {
        return Err(AppError::InvalidPath(format!("“{tag}” is not a tag")));
    }
    let note = fs_ops::read_note(&v.root, &path)?;
    let new = if on {
        note_tags::add_tag(&note.content, &tag)
    } else {
        note_tags::remove_tag(&note.content, &tag)
    };
    if new != note.content {
        ops::write_note(&v, &path, &new)?;
    }
    Ok(note_tags::front_matter_tags(&new))
}

/// Changes the title of an epic task (its heading). The note keeps its file name.
#[tauri::command]
pub async fn epic_set_title(
    state: State<'_, AppState>,
    path: String,
    title: String,
) -> Result<Epic, AppError> {
    let v = state.current_vault()?;
    check_path(&path)?;
    if !epics::is_epic_path(&path) {
        return Err(AppError::InvalidPath(format!("{path} is not an epic task")));
    }
    let note = fs_ops::read_note(&v.root, &path)?;
    let new = epics::set_title(&note.content, &title)?;
    if new != note.content {
        ops::write_note(&v, &path, &new)?;
    }
    Ok(epics::read_epic(&path, &new))
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
        .map_or_else(|| "a step".to_string(), |t| t.title);
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
        let made = today();
        for text in texts {
            let words = tasks::parse("", &format!("- [ ] {text}\n"));
            let title = words
                .first()
                .map(|t| t.title.to_lowercase())
                .unwrap_or_default();
            if title.is_empty() || have.contains(&title) {
                continue;
            }
            out = tasks::append_task(&out, text, Some(&made));
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

/// Adds a task to an epic (the Inbox when none is given) and returns that note's tasks.
#[tauri::command]
pub async fn task_add(
    state: State<'_, AppState>,
    text: String,
    note: Option<String>,
    steps: Option<Vec<String>>,
    path: Option<String>,
) -> Result<Vec<Task>, AppError> {
    let v = state.current_vault()?;
    let target = path.as_deref().unwrap_or(epics::INBOX);
    let list = add_task_to(
        &v,
        target,
        &text,
        note.as_deref().unwrap_or(""),
        steps.as_deref().unwrap_or(&[]),
    )?;
    if let Some(t) = tasks::parse("", &format!("- [ ] {text}\n")).first() {
        trace::record(
            &state,
            &v,
            &trace::Event::TaskNew {
                title: &t.title,
                path: target,
            },
        );
    }
    Ok(list)
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
        let made = today();
        assert_eq!(
            text,
            format!(
                "# Meeting\n\n- [ ] Ask Peter\n- [ ] Send the quote due:2026-10-23 made:{made}\n"
            )
        );
        assert!(add_to_note(&v, "../x.md", &["a".into()]).is_err());
    }

    #[test]
    fn a_quick_task_goes_into_the_inbox_epic() {
        let d = tempfile::tempdir().unwrap();
        let v = open_for_test(d.path());
        let list = add_task_to(&v, epics::INBOX, "Call Mette due:2026-10-20", "", &[]).unwrap();
        assert_eq!(list.len(), 1);
        assert_eq!(list[0].title, "Call Mette");
        let list = add_task_to(
            &v,
            epics::INBOX,
            "Order headsets",
            "Ask Mette\n\nThe grey ones",
            &["Find the model".into(), "Order".into()],
        )
        .unwrap();
        assert_eq!(list.len(), 2);
        assert_eq!(list[1].note, "Ask Mette\nThe grey ones");
        assert_eq!(list[1].made.as_deref(), Some(today().as_str()));
        assert!(list[1].log.is_empty());
        let steps: Vec<&str> = list[1].steps.iter().map(|s| s.text.as_str()).collect();
        assert_eq!(steps, ["Find the model", "Order"]);
        let text = std::fs::read_to_string(d.path().join("Tasks/Inbox.md")).unwrap();
        assert!(
            text.starts_with("---\ntags: [epic]\n---\n# Inbox\n\n- [ ] Call Mette"),
            "{text}"
        );
        assert!(add_task_to(&v, epics::INBOX, "  ", "", &[]).is_err());
        let after = delete_task(&v, epics::INBOX, list[1].line, &list[1].key).unwrap();
        assert_eq!(after.len(), 1);
        assert!(!std::fs::read_to_string(d.path().join("Tasks/Inbox.md"))
            .unwrap()
            .contains("Order headsets"));
        assert_eq!(all_tasks(&v).len(), 1);
    }

    #[test]
    fn a_task_in_an_ordinary_note_gets_an_epic_that_points_back_and_is_reused() {
        let d = tempfile::tempdir().unwrap();
        let v = open_for_test(d.path());
        std::fs::create_dir_all(d.path().join("IT")).unwrap();
        std::fs::write(d.path().join("IT/VPN guide.md"), "# VPN guide\n\nText.\n").unwrap();
        v.refresh_files();
        let e = epic_for_note(&v, "IT/VPN guide.md").unwrap();
        assert_eq!(e.path, "Tasks/VPN guide.md");
        assert_eq!(e.source.as_deref(), Some("IT/VPN guide"));
        add_task_to(&v, &e.path, "Write the steps", "", &[]).unwrap();
        // The note itself is not changed.
        assert_eq!(
            std::fs::read_to_string(d.path().join("IT/VPN guide.md")).unwrap(),
            "# VPN guide\n\nText.\n"
        );
        // Asking again gives the same epic; an epic is its own epic.
        assert_eq!(epic_for_note(&v, "IT/VPN guide.md").unwrap(), e);
        assert_eq!(epic_for_note(&v, &e.path).unwrap().path, e.path);
        assert_eq!(all_epics(&v).len(), 1);
        assert_eq!(all_tasks(&v).len(), 1);
        // Another note with the same name gets its own epic.
        std::fs::create_dir_all(d.path().join("Other")).unwrap();
        std::fs::write(d.path().join("Other/VPN guide.md"), "x").unwrap();
        v.refresh_files();
        let e2 = epic_for_note(&v, "Other/VPN guide.md").unwrap();
        assert_ne!(e2.path, e.path);
        assert_eq!(all_epics(&v).len(), 2);
    }

    #[test]
    fn a_new_epic_is_a_note_in_tasks_and_names_do_not_collide() {
        let d = tempfile::tempdir().unwrap();
        let v = open_for_test(d.path());
        let a = create_epic_note(&v, "Office move", None).unwrap();
        let b = create_epic_note(&v, "Office move", None).unwrap();
        assert_eq!(a.path, "Tasks/Office move.md");
        assert_eq!(b.path, "Tasks/Office move 2.md");
        assert_eq!(a.title, "Office move");
        assert!(create_epic_note(&v, "  ", None).is_err());
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
