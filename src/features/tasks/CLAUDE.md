# Tasks

Tasks are `- [ ]` lines in notes; indented checklist lines are steps, indented text is the task's note, dated lines its log. Words in the line: `status:` (doing, waiting, dropped), `made:`, `due:`, `plan:`, `est:`, and `#tags`; the first `[[link]]` is the task's note. An epic is a note with the tag `epic`. Frontend: the task list (`TasksView`), the epic and task pages, Focus, the left panel; `src/stores/taskStore.ts`, `src/lib/taskLogic.ts`. Rust: `src-tauri/src/tasks/`, `commands/tasks.rs`, and Trace my work (`trace.rs`).

- There is no planning (no Today, no rescheduling): an outline of epics and steps with a made date.
- A note without the tag `epic` is not an epic; its tasks are under "Tasks in other notes".
- In a note tagged `meeting` the agenda is not tasks.
- Changes are made in the note's own line, so the file stays readable in any editor.
