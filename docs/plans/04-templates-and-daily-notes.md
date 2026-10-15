> **Status: implemented.** See docs/DECISIONS.md and docs/START-GUIDE.md. The text below is the original plan.

# Feature 4 – Templates and daily notes

Branch: `feat/templates`. Read [README.md](README.md) first.

## What the user gets

- **File → New note from template…** opens a picker: choose a template, type a name, the note is created from the template (variables like `{{date}}` filled in).
- **File → Open today's daily note** (shortcut `Mod+Shift+D`) creates `Daily/2026-10-13.md` (or opens it if it exists), using the daily template if one is set.
- **File → Save current note as template…** copies the open note into the template folder.
- **Settings → Vault** tab: daily notes folder, date format, daily template, attachments folder, default folder for new notes.

## Decisions (already made)

| Question                     | Decision                                                                                                                                                                                                                                                                                                                                 |
| ---------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Where do templates live?     | `.vault/templates/<name>.md` – inside `.vault/`, so they are hidden from the tree, search and AI tools, but are **committed** (versioned)                                                                                                                                                                                                |
| Variables                    | `{{title}}` note name without `.md` · `{{date}}` = `%Y-%m-%d` · `{{time}}` = `%H:%M` · `{{datetime}}` = `%Y-%m-%d %H:%M` · `{{weekday}}` = `%A` · `{{date:FORMAT}}` and `{{time:FORMAT}}` with any strftime format, e.g. `{{date:%d %B %Y}}`. Unknown variables are left exactly as typed. Time is the **local** time (`chrono::Local`). |
| Daily note name              | Format string stored in vault config (`dailyNoteFormat`, default `%Y-%m-%d`). The result must be a valid file name (no `/`), otherwise the command returns an error                                                                                                                                                                      |
| Config location              | `.vault/config.json` (`VaultConfig`). New fields have defaults so old vaults keep working; `schemaVersion` stays 1                                                                                                                                                                                                                       |
| Does creating a note commit? | No (same as today – autosave commits it). Saving/deleting a **template** commits                                                                                                                                                                                                                                                         |

New `VaultConfig` fields (camelCase in JSON/TypeScript):

| Field              | Default            |
| ------------------ | ------------------ |
| `dailyNotesFolder` | `"Daily"`          |
| `dailyNoteFormat`  | `"%Y-%m-%d"`       |
| `dailyTemplate`    | `""` (no template) |

---

## Tasks

### Task 4.1 – Extend `VaultConfig`

**Files:** `src-tauri/src/vault/mod.rs`

1. Add the three fields to `VaultConfig` (`pub daily_notes_folder: String`, `pub daily_note_format: String`, `pub daily_template: String`) and to `Default` with the values above. The struct already has `#[serde(default)]`, so old `config.json` files still load.
2. Add a test in `vault/ops.rs` tests (or a new test in `vault/mod.rs`): write an old-style config `{"schemaVersion":1,"attachmentsFolder":"files","newNoteFolder":""}` to `.vault/config.json`, call `v.config()`, assert `attachments_folder == "files"` and `daily_notes_folder == "Daily"`.

### Task 4.2 – Commit kinds

**Files:** `src-tauri/src/git/mod.rs`

Add `Template` and `VaultSettings` to `CommitKind`. Messages: `Template => with("Template")` (→ `Template: added Meeting`), `VaultSettings => "Vault settings updated"`. Extend the `commit_messages_match_the_spec` test.

### Task 4.3 – Template rendering (pure function first)

**Files:** create `src-tauri/src/templates/mod.rs` and `src-tauri/src/templates/render.rs`; add `pub mod templates;` to `lib.rs`.

`render.rs`:

```rust
use chrono::{DateTime, Local};
use regex::Regex;
use std::fmt::Write;
use std::sync::LazyLock;

static VAR_RE: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(r"\{\{\s*([a-z]+)(?::([^}]*?))?\s*\}\}").expect("valid template regex")
});

/// Formats `now` with a strftime pattern. Returns `None` if the pattern is invalid
/// (chrono's `to_string()` would panic, so we write into a String and check the result).
pub fn format_time(now: &DateTime<Local>, pattern: &str) -> Option<String> {
    let mut out = String::new();
    write!(out, "{}", now.format(pattern)).ok()?;
    Some(out)
}

/// Replaces `{{title}}`, `{{date}}`, `{{time}}`, `{{datetime}}`, `{{weekday}}`, `{{date:FMT}}`, `{{time:FMT}}`.
/// Unknown variables and invalid formats are left unchanged.
pub fn render(template: &str, title: &str, now: &DateTime<Local>) -> String { /* use VAR_RE.replace_all with a closure */ }
```

Closure logic: `match (name, arg) { ("title", None) => title, ("date", None) => "%Y-%m-%d", ("time", None) => "%H:%M", ("datetime", None) => "%Y-%m-%d %H:%M", ("weekday", None) => "%A", ("date"|"time", Some(fmt)) => format_time(now, fmt) , _ => keep original match }`. Return `caps[0].to_string()` for "keep original".

**Tests (inject a fixed time: `Local.with_ymd_and_hms(2026, 10, 13, 15, 4, 5).unwrap()`):**

- each variable;
- `{{ date }}` with spaces works;
- `{{date:%d %B %Y}}` → `13 October 2026`;
- `{{date:%Q}}` (invalid) and `{{unknown}}` are left unchanged;
- text without variables is unchanged; code like `{{ not closed` is unchanged.

### Task 4.4 – Template storage

**Files:** `src-tauri/src/templates/mod.rs`

```rust
#[derive(Debug, Clone, Serialize, TS)] #[serde(rename_all = "camelCase")] #[ts(export)]
pub struct TemplateInfo { pub name: String, pub path: String }   // path is vault-relative: ".vault/templates/Meeting.md"

pub const DIR: &str = ".vault/templates";
pub fn list(root: &Path) -> Vec<TemplateInfo>                       // *.md files in DIR, name = stem, sorted case-insensitively; [] if folder missing
pub fn read(root: &Path, name: &str) -> AppResult<String>           // validate name, resolve_internal, NotFound if missing
pub fn save_from_note(v: &OpenVault, note_path: &str, name: &str) -> AppResult<TemplateInfo>
pub fn delete(v: &OpenVault, name: &str) -> AppResult<()>
```

Rules:

- Every name goes through `fs_ops::validate_name` (rejects `/`, `..`, leading dot, etc.). Strip a trailing `.md` from the name before validating.
- Use `paths::resolve_internal(root, &format!("{DIR}/{name}.md"))` for every file access.
- `save_from_note`: read the note with `fs_ops::read_note` (it validates the note path), refuse if the template exists (`AppError::AlreadyExists`), `create_dir_all`, write with `fs_ops::write_note`-style atomic write (reuse by calling `fs_ops::write_note(&v.root, &format!("{DIR}/{name}.md"), &content)` – it uses `resolve`, which **rejects `.vault`**, so instead write with `std::fs::write` to the path from `resolve_internal`), then `v.commit(CommitReason::new(CommitKind::Template, Some(format!("added {name}"))), Some(&[path]))`.
- `delete`: remove file, commit `removed {name}`.

**Tests (`open_for_test`):** list is sorted; `save_from_note` creates the file and **one commit** with the right message; saving the same name twice fails; names like `"../evil"`, `"a/b"`, `".hidden"` are rejected for `read`, `save_from_note`, `delete`; deleting commits and removes the file.

### Task 4.5 – Create from template and daily note

**Files:** `src-tauri/src/templates/mod.rs` (functions) – they use `vault::ops`.

```rust
/// Creates `<folder>/<name>.md` from a template (or empty if `template` is None). Returns the new path.
pub fn create_note_from_template(v: &OpenVault, folder: &str, name: &str, template: Option<&str>, now: &DateTime<Local>) -> AppResult<String>
/// Creates (or just returns the path of) the daily note for `date` (None = today).
pub fn open_daily_note(v: &OpenVault, date: Option<NaiveDate>, now: &DateTime<Local>) -> AppResult<String>
```

`create_note_from_template`:

1. `let name = fs_ops::validate_name(name.trim_end_matches(".md"))?;`
2. Target path `join(folder, name + ".md")`; `paths::resolve(&v.root, &target, None)?`; if it exists → `AlreadyExists`.
3. Content = `template.map(|t| render(&read(&v.root, t)?, &name, now)).unwrap_or_default()`.
4. `ops::create_folder`-style `create_dir_all` for the folder (use `fs_ops::create_note(&v.root, folder, Some(&name))` to create the empty file, then `ops::write_note(v, &target, &content)` to fill it – this also indexes it).
5. `v.refresh_files()`; return `target`.

`open_daily_note`:

1. `let cfg = v.config();` the date is `date.unwrap_or(now.date_naive())`.
2. Build a `DateTime<Local>` for that date at the current time-of-day for rendering (`Local.from_local_datetime(&date.and_time(now.time())).single().unwrap_or(*now)` – this is allowed because it is not a panic; use `unwrap_or`).
3. Name = `format_time(&dt, &cfg.daily_note_format)`; `None` → `AppError::Settings("Invalid daily note format")`; then `validate_name`.
4. Path = `join(cfg.daily_notes_folder, name + ".md")`. If it exists on disk return it. Otherwise call `create_note_from_template(v, folder, name, template_opt, &dt)` where `template_opt` is `Some(cfg.daily_template)` if non-empty **and** the template exists (otherwise `None` – a deleted template must not break daily notes).

**Tests:**

- create from template renders `{{title}}` and `{{date}}`; fails with `AlreadyExists` when the note exists; creates missing folders.
- daily note: created once; second call returns the same path and does **not** overwrite edited content; uses the template; a missing template falls back to an empty note; an invalid format (`%Q`) errors; a format that produces `/` errors.

### Task 4.6 – Vault config command

**Files:** `src-tauri/src/vault/mod.rs`, `commands/vault.rs`

Add `OpenVault::set_config(&self, cfg: VaultConfig) -> AppResult<VaultConfig>`:

- validate `attachments_folder` and `daily_notes_folder` with `paths::resolve_dir` (empty `daily_notes_folder` is allowed = root; `attachments_folder` must be non-empty);
- validate `new_note_folder` the same way (empty allowed);
- validate `daily_note_format` by formatting "now" with `format_time` (must be `Some` and a valid file name);
- write `.vault/config.json` (pretty JSON, `resolve_internal`), then `self.commit(CommitReason::new(CommitKind::VaultSettings, None), Some(&[".vault/config.json".to_string()]))`.

Commands: `update_vault_config(config: VaultConfig) -> VaultConfig`, plus the template commands in a new `commands/templates.rs`:
`list_templates() -> Vec<TemplateInfo>`, `create_note_from_template(folder, name, template: Option<String>) -> String`, `open_daily_note() -> String`, `save_template_from_note(note_path, name) -> TemplateInfo`, `delete_template(name)`. Use `chrono::Local::now()` inside the command. Register them all in `lib.rs`.

**Test:** `set_config` rejects `../x` and a bad format, accepts a good config and creates exactly one commit.

### Task 4.7 – Frontend API and store

**Files:** `src/lib/api.ts`, `src/stores/vaultStore.ts`

1. Wrappers: `listTemplates`, `createNoteFromTemplate(folder, name, template | null)`, `openDailyNote()`, `saveTemplateFromNote(notePath, name)`, `deleteTemplate(name)`, `updateVaultConfig(config)` (import `TemplateInfo`, `VaultConfig`).
2. In `vaultStore` add actions:
   - `createNoteFromTemplate(folder, name, template)` → calls api, `refreshTree()`, `openNote(path)`, returns path or null (errors via `reportError`).
   - `openDailyNote()` → same pattern.
   - `updateConfig(config)` → calls api, then `set({ vault: { ...vault, config: returned } })`.

### Task 4.8 – Template picker dialog

**Files:** create `src/features/templates/TemplatePicker.tsx`; `src/stores/uiStore.ts` (add `templatePickerOpen: boolean` + `setTemplatePickerOpen`); `src/App.tsx` (render `<TemplatePicker />`).

Dialog content: a list of radio-style buttons: "Blank note" first, then each template; a name input (default "Untitled"); buttons Cancel / Create. Folder = `currentFolder(useVaultStore.getState())` (exported from `vaultStore`) falling back to `vault.config.newNoteFolder`. Load `api.listTemplates()` when it opens. If creation fails with `AlreadyExists`, show the message under the input and keep the dialog open.

**Test:** mock api; open dialog; templates are listed; choose one, type a name, click Create → `api.createNoteFromTemplate` called with `(folder, name, templateName)`; blank note passes `null`.

### Task 4.9 – Menu items and shortcut

**Files:** `src/components/layout/Header.tsx`, `src/App.tsx`, `src/features/fileTree/FileTree.tsx`

File menu additions (keep the order: New note, **New note from template…**, **Open today's daily note** `Mod+Shift+D`, Quick open…, …, **Save current note as template…**). "Save current note as template…" is disabled when no note is open; it flushes pending writes (`flushPendingWrites()`), asks for a name with `PromptDialog` (default = note title), calls `api.saveTemplateFromNote`, toast "Template saved". Add `"Mod+Shift+d"` to the `bindings` in `App.tsx`. In the file tree context menu, for `.md` files add "Save as template…" with the same flow (put the shared logic in `src/lib/actions.ts` as `saveNoteAsTemplate(path, name)`).

### Task 4.10 – Settings → Vault tab

**Files:** `src/features/settings/SettingsDialog.tsx` + create `src/features/settings/VaultSettingsTab.tsx`

1. Add a tab `{ id: "vault", label: "Vault" }`.
2. `VaultSettingsTab` edits a local copy of `vault.config` (only visible when a vault is open; otherwise show "Open a vault to change its settings") and has its own **Save vault settings** button calling `vaultStore.updateConfig`. (Global settings and vault config are saved separately on purpose – they live in different files.)
3. Fields: Daily notes folder (text input), Date format (select with presets `%Y-%m-%d` "2026-10-13", `%d-%m-%Y` "13-10-2026", `%d %b %Y` "13 Oct 2026", plus "Custom…" revealing a text input; show a live preview using a tiny TypeScript formatter limited to `%Y %m %d %b %B %A %a %H %M`), Daily template (select: "None" + `api.listTemplates()`), Attachments folder, Folder for new notes.
4. Show server-side validation errors with the existing toast (`reportError`).

### Task 4.11 – Docs, manual tests, changelog

Update `CHANGELOG.md`, README (features, shortcut table: `Mod+Shift+D`), `docs/DECISIONS.md` (the decision table + the extra commands + new commit kinds), and the manual test lists.

---

## Tests summary (automated)

Rust: config backward compatibility; render (all variables, spaces, invalid format, unknown var); template list/save/delete/name validation/one commit; create from template; daily note (idempotent, template, missing template, invalid format); `set_config` validation + commit; commit messages.
Frontend: TemplatePicker; (optional) VaultSettingsTab save calls `updateVaultConfig`.

## Manual tests to add (README section "14. Templates and daily notes")

- [ ] Open a note, **File → Save current note as template…**, name it "Meeting". `git log` shows `Template: added Meeting`. The file is **not** visible in the file tree.
- [ ] Put `# {{title}}` and `Date: {{date:%d %B %Y}}` in the template. **New note from template…** → pick Meeting, name "Kickoff": the new note contains `# Kickoff` and today's date written out.
- [ ] Creating a note with a name that already exists shows an error and keeps the dialog open.
- [ ] `Ctrl/Cmd+Shift+D` creates `Daily/<today>.md` and opens it; pressing it again opens the same note without changing it (type something, press again – your text is still there).
- [ ] Set a daily template in **Settings → Vault**, delete today's note, press the shortcut: the new note uses the template. Remove the template from `.vault/templates/` by hand: the shortcut still works (empty note).
- [ ] Change the date format to `%d-%m-%Y` and the folder to `Journal`: next daily note lands there. A format of `%Y/%m/%d` is rejected with an error.
- [ ] Settings → Vault: a folder like `../outside` is rejected.

## Pitfalls

- `chrono` is already a dependency; `Local::now()` needs the default `clock` feature (enabled).
- `fs_ops::write_note` uses `paths::resolve`, which refuses `.vault/…`. For files inside `.vault/` use `resolve_internal` and plain `std::fs`.
- Unit tests must not depend on the real clock – always pass `now` into the functions.
- Do **not** show templates in the file tree or search: they are in a hidden folder on purpose.
