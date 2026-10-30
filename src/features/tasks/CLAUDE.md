# Tasks

Tasks are `- [ ]` lines in notes; indented checklist lines are steps, indented text is the task's note, dated lines its log. Words in the line: `status:` (doing, waiting, dropped), `made:`, `due:`, `plan:`, `est:`, and `#tags`; the first `[[link]]` is the task's note. An epic is a note with the tag `epic`. Frontend: the task list (`TasksView`), the epic and task pages, Focus, the left panel; `src/stores/taskStore.ts`, `src/lib/taskLogic.ts`. Rust: `src-tauri/src/tasks/`, `commands/tasks.rs`, and Trace my work (`trace.rs`).

- There is no planning (no Today, no rescheduling): an outline of epics and steps with a made date.
- A note without the tag `epic` is not an epic; its tasks are under "Tasks in other notes".
- In a note tagged `meeting` the agenda is not tasks.
- Focus: the timer (on or off, and its length) is a per-computer choice in `uiStore` (`focusTimer`, `focusMinutes`); Ultra focus is local to `FocusMode` and shows one `FocusTask`.
- A log line is one line in the file, so its box is a `singleLine` `MarkdownField` (bold and italic work, a new line cannot be written). A task's note is several lines; a list inside it is written with a `\` before the marker, which Mimer adds and removes itself.
- Changes are made in the note's own line, so the file stays readable in any editor.
