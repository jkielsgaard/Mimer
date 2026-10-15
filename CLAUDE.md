# CLAUDE.md — Mimer v1 Specification

This file is the complete specification for version 1 of Mimer. It is written so that Claude Code or a junior developer can build v1 without asking technical questions. All technical decisions are made here. If something is genuinely not covered, choose the simplest option consistent with the **Core principles** and document the decision in `docs/DECISIONS.md`.

---

## 1. Project overview

Mimer is a cross-platform desktop application for managing Markdown notes and documentation, similar to Obsidian, with a built-in AI assistant. The AI helps write, restructure, correct and find information in notes.

- Local AI via **LM Studio** is the default.
- Cloud AI providers are optional.
- All notes are plain `.md` files in normal folders.
- All changes are versioned in a built-in local Git repository.

### 1.1 Core principles (in priority order)

1. **Never lose user data.** Every change must be recoverable through Git history. Never use destructive Git operations.
2. **The user is in control.** The AI only proposes changes. Nothing the AI produces is written to disk without explicit user approval.
3. **Local first.** Local AI is the default. Cloud AI is opt-in and can be blocked per project. The block is enforced in the backend.
4. **Plain files.** A vault must remain fully usable without Mimer (any Markdown editor, any Git client).
5. **Simple over clever.** Prefer readable, conventional code over abstractions.

### 1.2 Target users and platforms

| Platform             | Role                      | Requirement                                               |
| -------------------- | ------------------------- | --------------------------------------------------------- |
| Linux (Fedora-based) | Development and testing   | `pnpm tauri dev` must work                                |
| Windows 10/11        | Primary production target | NSIS installer `.exe`, per-user install (no admin rights) |
| macOS                | Secondary target          | `.dmg`, unsigned is acceptable in v1                      |

It is a native desktop app, **not** a web app.

---

## 2. Tech stack (fixed — do not substitute)

### 2.1 Backend (Rust)

| Concern          | Choice                                                                                                    |
| ---------------- | --------------------------------------------------------------------------------------------------------- |
| App framework    | Tauri 2.x (latest stable)                                                                                 |
| Rust edition     | 2021, stable toolchain via `rustup`                                                                       |
| Async runtime    | `tokio` (provided by Tauri)                                                                               |
| Errors           | `thiserror`                                                                                               |
| Serialization    | `serde`, `serde_json`                                                                                     |
| Logging          | `tracing`, `tracing-subscriber` (log file in app log dir)                                                 |
| Git              | `git2` (libgit2, vendored — no system Git required)                                                       |
| Search index     | `rusqlite` with `bundled` feature (SQLite FTS5)                                                           |
| Markdown parsing | `pulldown-cmark` (for links/tags extraction, skipping code blocks)                                        |
| YAML frontmatter | `yaml-rust2`                                                                                              |
| File watching    | `notify` + `notify-debouncer-full`                                                                        |
| HTTP client      | `reqwest` with features `json`, `stream`, `rustls-tls` (no native-tls)                                    |
| SSE parsing      | `eventsource-stream`                                                                                      |
| Secrets          | `keyring` (OS keychain / Windows Credential Manager)                                                      |
| IDs              | `uuid` (v4)                                                                                               |
| Time             | `chrono`                                                                                                  |
| TS type export   | `ts-rs` (exports Rust types to `src/bindings/`)                                                           |
| Tauri plugins    | `tauri-plugin-dialog`, `tauri-plugin-opener`, `tauri-plugin-window-state`, `tauri-plugin-single-instance` |

### 2.2 Frontend (TypeScript)

| Concern                   | Choice                                                                                                                                |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| Runtime / package manager | Node.js 22 LTS, `pnpm`                                                                                                                |
| Build tool                | Vite (latest stable)                                                                                                                  |
| UI library                | React 19                                                                                                                              |
| Language                  | TypeScript 5.x, `strict: true`                                                                                                        |
| Styling                   | Tailwind CSS v4 (`@tailwindcss/vite`)                                                                                                 |
| Components                | shadcn/ui (Radix-based), icons from `lucide-react`                                                                                    |
| State management          | Zustand 5                                                                                                                             |
| Editor                    | CodeMirror 6: `@codemirror/state`, `view`, `commands`, `language`, `search`, `autocomplete`, `lang-markdown`, `@lezer/markdown` (GFM) |
| Diff view                 | `@codemirror/merge` (unified view)                                                                                                    |
| Markdown in chat          | `react-markdown` + `remark-gfm`                                                                                                       |
| Panels                    | `react-resizable-panels`                                                                                                              |
| Testing                   | Vitest + React Testing Library + jsdom                                                                                                |
| Lint/format               | ESLint 9 (flat config) + `typescript-eslint` (`strictTypeChecked`) + `eslint-plugin-react-hooks` + Prettier                           |

Do not add other dependencies without recording the reason in `docs/DECISIONS.md`.

---

## 3. Coding standards

### 3.1 Rust

- Follow the **Rust API Guidelines** (https://rust-lang.github.io/api-guidelines/) and standard Rust naming (`snake_case` functions/modules, `PascalCase` types, `SCREAMING_SNAKE_CASE` constants).
- Format with `rustfmt` (default config). Lint with `cargo clippy --all-targets -- -D warnings`.
- No `unwrap()` / `expect()` / `panic!` outside tests and `main` setup. Use `Result<T, AppError>`.
- Tauri commands (`src-tauri/src/commands/`) are **thin**: validate input, call a service module, map the result. Business logic lives in service modules and is unit-tested without Tauri.
- All public functions in service modules have a `///` doc comment.
- All paths crossing the IPC boundary are **vault-relative**, use forward slashes (`/`), and are validated by `vault::paths::resolve()` (see §8.2).

### 3.2 TypeScript / React

- Follow the official **React** rules (https://react.dev/reference/rules) and the `typescript-eslint` `strictTypeChecked` rule set.
- Prettier default config (double quotes, semicolons, 2-space indent, trailing commas, print width 100).
- Function components and hooks only. No class components.
- No `any`. No non-null assertions (`!`) except where justified with a comment.
- File naming: components `PascalCase.tsx`, hooks `useCamelCase.ts`, other modules `camelCase.ts`.
- One component per file. Co-locate tests: `Foo.tsx` + `Foo.test.tsx`.
- **All** backend calls go through typed wrappers in `src/lib/api.ts`. Components never call `invoke` directly.
- Types shared with Rust are imported from `src/bindings/` (generated by `ts-rs`, never hand-edited).
- UI text in English. Use sentence case in buttons and labels ("Make project", not "Make Project").

### 3.3 Repository conventions

- Commit messages: **Conventional Commits** (https://www.conventionalcommits.org) — `feat:`, `fix:`, `refactor:`, `test:`, `docs:`, `chore:`, `ci:`.
- Versioning: **Semantic Versioning**. v1 releases start at `0.1.0`; `1.0.0` when all milestones in §14 pass.
- Changelog: `CHANGELOG.md` in **Keep a Changelog** format.
- Branches: `main` is always buildable. Work in `feat/<short-name>` branches.
- Licence: Apache-2.0 (`LICENSE` and `NOTICE`; changed from MIT before the first release, see `docs/DECISIONS.md`).

---

## 4. Development environment

### 4.1 Linux (Fedora / Bazzite)

On an immutable Fedora-based system (e.g. Bazzite), develop inside a Fedora `distrobox` or `toolbox` container.

```bash
sudo dnf install -y webkit2gtk4.1-devel openssl-devel curl wget file \
  libappindicator-gtk3-devel librsvg2-devel libxdo-devel
sudo dnf group install -y "development-tools"
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
# Node 22 LTS via fnm or nvm, then:
corepack enable && corepack prepare pnpm@latest --activate
```

Debian/Ubuntu equivalent: `libwebkit2gtk-4.1-dev build-essential curl wget file libxdo-dev libssl-dev libayatana-appindicator3-dev librsvg2-dev`.

### 4.2 LM Studio for testing

- Install LM Studio, load a model with tool-calling support (e.g. a Qwen or Llama instruct model).
- Start the local server (Developer tab). Default URL: `http://localhost:1234/v1`.
- If Mimer runs inside a container, ensure the container can reach host `localhost:1234` (distrobox shares the host network by default).

### 4.3 Commands

| Task                       | Command                                                                          |
| -------------------------- | -------------------------------------------------------------------------------- |
| Install deps               | `pnpm install`                                                                   |
| Run app (dev)              | `pnpm tauri dev`                                                                 |
| Build (current OS)         | `pnpm tauri build`                                                               |
| Frontend tests             | `pnpm test`                                                                      |
| Frontend lint              | `pnpm lint`                                                                      |
| Format check               | `pnpm format:check`                                                              |
| Type check                 | `pnpm typecheck`                                                                 |
| Rust tests                 | `cargo test --manifest-path src-tauri/Cargo.toml`                                |
| Rust lint                  | `cargo clippy --manifest-path src-tauri/Cargo.toml --all-targets -- -D warnings` |
| Rust format                | `cargo fmt --manifest-path src-tauri/Cargo.toml --check`                         |
| Regenerate TS bindings     | `cargo test --manifest-path src-tauri/Cargo.toml export_bindings`                |
| Full check (CI-equivalent) | `pnpm check` (runs all of the above except build)                                |

Define these as scripts in `package.json`.

---

## 5. Repository structure

```
mdvault/
├── CLAUDE.md
├── README.md
├── CHANGELOG.md
├── LICENSE
├── docs/
│   └── DECISIONS.md
├── .github/workflows/
│   ├── ci.yml
│   └── release.yml
├── package.json
├── pnpm-lock.yaml
├── tsconfig.json
├── vite.config.ts
├── eslint.config.js
├── .prettierrc
├── index.html
├── src/
│   ├── main.tsx
│   ├── App.tsx
│   ├── bindings/                 # generated by ts-rs — do not edit
│   ├── lib/
│   │   ├── api.ts                # typed wrappers around invoke()
│   │   ├── events.ts             # typed wrappers around listen()
│   │   ├── shortcuts.ts
│   │   └── utils.ts
│   ├── stores/
│   │   ├── vaultStore.ts         # open vault, file tree, active note
│   │   ├── editorStore.ts        # dirty state, save status
│   │   ├── chatStore.ts
│   │   ├── proposalStore.ts      # pending AI changes awaiting approval
│   │   └── settingsStore.ts
│   ├── components/
│   │   ├── ui/                   # shadcn/ui components
│   │   └── layout/               # AppShell, StatusBar, Sidebar
│   └── features/
│       ├── welcome/              # open/create vault screen
│       ├── fileTree/
│       ├── editor/
│       │   ├── Editor.tsx
│       │   └── extensions/       # livePreview.ts, wikiLinks.ts, tags.ts, images.ts, pasteImage.ts
│       ├── quickOpen/
│       ├── search/
│       ├── backlinks/
│       ├── history/
│       ├── chat/
│       ├── inlineAi/
│       ├── proposals/            # diff review + approval UI
│       ├── projects/
│       └── settings/
└── src-tauri/
    ├── Cargo.toml
    ├── tauri.conf.json
    ├── capabilities/default.json
    ├── icons/
    └── src/
        ├── main.rs
        ├── lib.rs                # builder, plugins, state, command registration
        ├── error.rs              # AppError
        ├── state.rs              # AppState
        ├── commands/             # thin Tauri command handlers, one file per area
        ├── settings/             # global settings load/save, keychain
        ├── vault/
        │   ├── mod.rs
        │   ├── paths.rs          # path validation and scoping
        │   ├── fs_ops.rs         # read/write/create/rename/move/delete
        │   ├── tree.rs
        │   ├── watcher.rs
        │   └── attachments.rs
        ├── markdown/             # frontmatter, wiki-links, tags extraction
        ├── links/                # link resolution + rename rewriting
        ├── git/
        │   ├── mod.rs
        │   ├── repo.rs           # init, commit, status
        │   ├── history.rs        # file history, deleted files, restore
        │   └── autosave.rs       # commit triggers and idle timer
        ├── search/               # SQLite FTS5 index
        ├── projects/
        └── ai/
            ├── mod.rs
            ├── providers/        # lmstudio.rs, openai_compat.rs, anthropic.rs, types.rs
            ├── router.rs         # picks provider, enforces local-only
            ├── prompt.rs         # system prompt assembly
            ├── tools.rs          # tool definitions + execution
            ├── agent.rs          # tool loop
            ├── inline.rs         # inline command prompts
            └── proposals.rs      # proposal store + apply
```

---

## 6. Data storage

### 6.1 Vault layout

```
MyVault/
├── .git/
├── .gitignore                    # created by Mimer
├── .vault/
│   ├── config.json               # vault settings (committed)
│   ├── index.db                  # search index (gitignored)
│   └── projects/
│       └── <uuid>.json           # project settings (committed)
├── attachments/
└── <user folders and notes>
```

Created `.gitignore` content (append if file exists, never overwrite):

```
.vault/index.db
.vault/index.db-*
.vault/cache/
```

Ignored by the file tree, search index and AI tools: any file or folder starting with `.`, plus `node_modules/`.

### 6.2 Vault config — `.vault/config.json`

```json
{
  "schemaVersion": 1,
  "attachmentsFolder": "attachments",
  "newNoteFolder": ""
}
```

### 6.3 Project file — `.vault/projects/<uuid>.json`

```json
{
  "schemaVersion": 1,
  "id": "3f6c1e2a-...",
  "name": "Security docs",
  "folder": "Work/Security",
  "instructions": "You help write ISO 27001 documentation...",
  "providerId": null,
  "localOnly": true,
  "createdAt": "2026-10-13T15:00:00Z",
  "updatedAt": "2026-10-13T15:00:00Z"
}
```

- `folder` is vault-relative. `providerId: null` means "use global default".
- When a project folder is renamed or moved inside Mimer, update `folder` and commit both changes together.

### 6.4 Global settings — `<app_config_dir>/settings.json`

Stored outside any vault (Tauri `app_config_dir()`), shared by all vaults.

```json
{
  "schemaVersion": 1,
  "recentVaults": ["/home/jesper/Notes"],
  "lastVault": "/home/jesper/Notes",
  "theme": "system",
  "editor": { "fontSize": 15, "lineWidth": 760, "spellcheck": true },
  "git": { "authorName": "Mimer", "authorEmail": "mdvault@localhost", "idleCommitMinutes": 5 },
  "ai": {
    "defaultProviderId": "lmstudio-default",
    "globalInstructions": "",
    "providers": [
      {
        "id": "lmstudio-default",
        "kind": "lmstudio",
        "name": "LM Studio",
        "baseUrl": "http://localhost:1234/v1",
        "model": "",
        "location": "local",
        "supportsTools": true,
        "contextTokens": 16000
      }
    ]
  }
}
```

- Provider `kind`: `"lmstudio" | "openai_compatible" | "anthropic"`.
- Provider `location`: `"local" | "cloud"`. `lmstudio` is always `local`. `anthropic` is always `cloud`. For `openai_compatible`, default to `local` only if the base URL host is `localhost`, `127.0.0.1` or `::1`; otherwise `cloud`. The user may not mark a non-loopback host as local.
- API keys are **never** stored in `settings.json`. Store them in the OS keychain with service `mdvault` and account `provider:<providerId>`.
- Unknown `schemaVersion` → show an error, do not overwrite the file.

---

## 7. Backend architecture

### 7.1 Error type

```rust
#[derive(Debug, thiserror::Error, serde::Serialize, ts_rs::TS)]
#[serde(tag = "code", content = "message")]
pub enum AppError {
    NotFound(String),
    InvalidPath(String),
    OutsideScope(String),
    AlreadyExists(String),
    Io(String),
    Git(String),
    Search(String),
    Provider(String),
    ProviderBlocked(String),   // cloud provider used in local-only project
    ToolsUnsupported(String),
    Settings(String),
    Conflict(String),
}
```

Frontend shows `message` in a toast; `code` drives behaviour.

### 7.2 Application state

`AppState` (managed by Tauri) holds:

- `settings: RwLock<Settings>`
- `vault: RwLock<Option<OpenVault>>` where `OpenVault` contains the root path, Git repo handle (wrapped in `Mutex`), search index connection (`Mutex<Connection>`), watcher handle, loaded projects, autosave state.
- `proposals: Mutex<HashMap<Uuid, ProposalSet>>`
- `ai_tasks: Mutex<HashMap<Uuid, CancellationToken>>` (use `tokio_util::sync::CancellationToken`)

### 7.3 Tauri commands

All commands are `async`, return `Result<T, AppError>`, and take vault-relative paths.

**Vault**

- `open_vault(path: String) -> VaultInfo` — opens folder; inits Git repo, `.vault/`, `.gitignore` if missing; builds index; starts watcher; commits any uncommitted changes as `Recovered uncommitted changes`.
- `create_vault(parent: String, name: String) -> VaultInfo`
- `close_vault() -> ()` — flushes autosave commit, stops watcher.
- `get_tree() -> Vec<TreeNode>`
- `read_note(path) -> NoteContent { path, content, mtime }`
- `write_note(path, content) -> ()` — writes to disk only (no commit).
- `create_note(folder, name?) -> String` — returns new path; default name `Untitled.md`, then `Untitled 1.md`, etc.
- `create_folder(parent, name) -> String`
- `rename_path(from, to, update_links: bool) -> RenameResult { changedFiles: Vec<String> }`
- `delete_path(path) -> ()` — commits snapshot first, then deletes, then commits `Delete <path>`.
- `save_attachment(note_path, file_name, bytes: Vec<u8>) -> String` — returns relative link path.

**Git / history**

- `commit_now(reason: CommitReason, paths: Option<Vec<String>>) -> Option<String>` — returns commit SHA or `None` if nothing changed.
- `file_history(path) -> Vec<CommitEntry>`
- `file_at_commit(path, sha) -> String`
- `restore_file(path, sha) -> ()`
- `deleted_files() -> Vec<DeletedFile>`
- `restore_deleted(path, sha) -> ()`

**Search / links**

- `search(query: SearchQuery) -> Vec<SearchHit>`
- `backlinks(path) -> Vec<Backlink>`
- `all_tags() -> Vec<TagCount>`
- `link_targets(prefix) -> Vec<String>` (for `[[` autocomplete)
- `resolve_link(from_path, target) -> Option<String>`

**Projects**

- `list_projects() -> Vec<Project>`
- `create_project(folder, name, instructions, provider_id, local_only) -> Project`
- `update_project(project: Project) -> Project`
- `delete_project(id) -> ()` — removes the project file only, never the folder.
- `project_for_path(path) -> Option<Project>`

**Settings / providers**

- `get_settings() -> Settings`
- `update_settings(settings: Settings) -> ()`
- `set_api_key(provider_id, key) -> ()` / `has_api_key(provider_id) -> bool` / `delete_api_key(provider_id)`
- `list_models(provider_id) -> Vec<String>`
- `test_provider(provider_id) -> ProviderTestResult`

**AI**

- `ai_chat(request: ChatRequest, channel: Channel<ChatEvent>) -> Uuid` — streams events; returns task id.
- `ai_inline(request: InlineRequest, channel: Channel<ChatEvent>) -> Uuid`
- `ai_cancel(task_id) -> ()`
- `get_proposals(set_id) -> ProposalSet`
- `apply_proposals(set_id, accepted_ids: Vec<Uuid>) -> ApplyResult`
- `discard_proposals(set_id) -> ()`

### 7.4 Events (backend → frontend)

| Event                   | Payload                                                           | When                                |
| ----------------------- | ----------------------------------------------------------------- | ----------------------------------- |
| `vault://file-changed`  | `{ paths: string[], kind: "created" \| "modified" \| "removed" }` | External change detected by watcher |
| `vault://index-updated` | `{}`                                                              | Search index rebuild finished       |
| `git://committed`       | `{ sha, message }`                                                | Any commit                          |

AI streaming uses Tauri `Channel<ChatEvent>`, not global events:

```rust
#[serde(tag = "type")]
pub enum ChatEvent {
    TextDelta { text: String },
    ToolCall { name: String, summary: String },     // shown as "Searching notes…"
    ProposalsReady { set_id: Uuid },
    Done,
    Error { error: AppError },
}
```

---

## 8. Feature specifications

### 8.1 Welcome and vault handling

- On start: if `lastVault` exists and is accessible → open it. Otherwise show the Welcome screen with "Open folder as vault", "Create new vault", and the recent vaults list.
- Single instance: a second launch focuses the existing window.
- Window size/position persisted with `tauri-plugin-window-state`.

### 8.2 Path safety (critical)

`vault::paths::resolve(root, relative, scope: Option<&str>) -> Result<PathBuf>` must:

1. Reject absolute paths, empty paths, `..` components, and backslashes.
2. Join with root and canonicalize (for non-existing files, canonicalize the parent).
3. Verify the result starts with the canonical vault root, and with the scope folder if a scope is given. Otherwise return `OutsideScope`.
4. Reject paths inside `.git/`. Allow `.vault/` only for internal callers, never for AI tools.

Every file operation must use this function. Unit tests must cover traversal attempts, symlinks pointing outside the vault, and scope violations.

### 8.3 File tree

- Shows folders first, then files, alphabetically (case-insensitive).
- Only `.md` files and image/attachment files are shown; `.md` extension is hidden in the tree.
- Project folders show a distinct icon.
- Context menu: New note, New folder, Rename, Delete, Make project / Project settings, Show history, Reveal in file manager.
- Drag and drop to move files/folders (triggers link update dialog, see §8.6).
- Delete asks for confirmation and states that it can be restored from history.

### 8.4 Editor — live preview

Implement live preview as CodeMirror 6 `ViewPlugin`s producing decorations from the Lezer Markdown syntax tree (GFM enabled):

- Headings, bold, italic, strikethrough, inline code, links: render styled; **hide the syntax markers** (`#`, `**`, `_`, `` ` ``, `[]()`) except on lines that contain the cursor or selection.
- Lists and task lists: render checkboxes as clickable widgets (`- [ ]` / `- [x]`).
- Blockquotes and fenced code blocks: styled block background; code blocks keep raw text with monospace font.
- Tables: shown as raw Markdown with monospace alignment in v1 (no table widget).
- Horizontal rules: rendered as a line widget when cursor is not on the line.
- Images (`![alt](path)` and `![[file.png]]`): replace with an image widget below the line when cursor is not on it. Load via `convertFileSrc()`; on vault open, the backend adds the vault root to the asset protocol scope (`app.asset_protocol_scope().allow_directory(root, true)`).
- Wiki-links: styled as links; Ctrl/Cmd+click opens the target. Unresolved links shown in a muted style; clicking creates the note.
- Tags: styled as pills; click runs a tag search.
- Frontmatter block at top of file: collapsed into a small "Properties" widget when cursor is outside it.

Saving:

- Edits are written to disk with a **debounce of 1000 ms** (`write_note`).
- Status bar shows `Saved` / `Saving…` / `Unsaved changes`.
- Git commits are handled separately (§8.8).

External changes:

- If the open note changes on disk and the editor has no unsaved edits → reload silently.
- If it has unsaved edits → show a banner: "This note changed on disk. Keep my version / Load disk version". Before either action, commit a snapshot so both versions are recoverable.

### 8.5 Wiki-links, backlinks and tags

- Syntax: `[[Target]]`, `[[Target|Alias]]`, `[[Target#Heading]]`, `[[Target#Heading|Alias]]`, embeds `![[file]]`.
- Regex (applied only outside code blocks/inline code): `!?\[\[([^\[\]|#]+)(#[^\[\]|]+)?(\|[^\[\]]+)?\]\]`
- Resolution of `Target`:
  1. If it contains `/`, treat as a vault-relative path (append `.md` if no extension).
  2. Otherwise match file name without extension, case-insensitive.
  3. On multiple matches, choose the one with the shortest path; tie → alphabetical.
- Autocomplete: typing `[[` opens a list of note names (fuzzy match on name and path).
- Backlinks panel: lists notes linking to the current note with a one-line context snippet.
- Tags: inline `#tag` (letters, digits, `_`, `-`, `/`; must not be only digits; not inside code or headings markers) and frontmatter `tags: [a, b]` or list form. Tags are case-insensitive for search.

### 8.6 Rename and move

- When a note is renamed or moved, find all notes linking to it. If any exist, show dialog: "Update N links in M notes?" (default Yes).
- Rewrite links preserving heading and alias parts. Use the shortest unambiguous form (name only if unique, otherwise path).
- Commit everything in one commit: `Rename <old> → <new>`.

### 8.7 Attachments

- Paste or drag-drop an image into the editor → `save_attachment` stores it in the attachments folder as `pasted-YYYYMMDD-HHMMSS.<ext>` (or original file name for drag-drop, de-duplicated with `-1`, `-2`).
- Insert standard Markdown with a path relative to the note: `![](../attachments/pasted-20261013-150000.png)`. Encode spaces as `%20`.
- Non-image files (PDF, etc.) are inserted as `[file name.pdf](relative/path)`. Ctrl/Cmd+click opens with the OS default app (`tauri-plugin-opener`).

### 8.8 Git version history (critical)

Each vault is a local Git repository on branch `main`. No remote in v1.

**Commit triggers**

| Trigger                                             | Message format                            | Scope                     |
| --------------------------------------------------- | ----------------------------------------- | ------------------------- |
| Manual save (Ctrl/Cmd+S)                            | `Save: <path>`                            | current note              |
| Switching to another note                           | `Autosave: <path>`                        | previous note, if changed |
| App/window close                                    | `Autosave on close`                       | all changes               |
| Idle timer (default 5 min with uncommitted changes) | `Autosave`                                | all changes               |
| Before applying AI changes                          | `Snapshot before AI: <summary>`           | all changes               |
| After applying AI changes                           | `AI: <summary>`                           | affected files            |
| Before overwriting on external-change conflict      | `Snapshot before reload: <path>`          | that file                 |
| Rename/move                                         | `Rename <old> → <new>`                    | affected files            |
| Delete                                              | `Delete <path>` (after a snapshot commit) | affected files            |
| Restore                                             | `Restore <path> to <short-sha>`           | that file                 |
| Project create/update                               | `Project: <name> updated`                 | project file              |
| Vault open with dirty tree                          | `Recovered uncommitted changes`           | all changes               |

Rules:

- Before every commit, flush any pending debounced editor write (frontend calls `write_note` first).
- Never create empty commits.
- Never rewrite history, reset, force, or delete branches.
- On window close: intercept `CloseRequested`, prevent default, flush save, commit, then close. Max 5 seconds; then close anyway (data is already on disk).
- Author from settings (`Mimer <mdvault@localhost>` by default).

**History UI (right panel → History tab, or Ctrl/Cmd+Shift+H)**

- List of commits touching the current note: relative date, message, short SHA. Follow renames using libgit2 diff with `find_similar`.
- Selecting an entry shows a unified diff (old version vs current) using `@codemirror/merge`.
- Button "Restore this version" → snapshot commit, write old content, commit.

**Recover deleted notes (command palette / File menu)**

- Walk history and list files that existed in a past commit but not in `HEAD`, with the last commit containing them.
- Restore writes the last content back and commits.

### 8.9 Search

**Index schema (SQLite, `.vault/index.db`)**

```sql
CREATE TABLE notes (path TEXT PRIMARY KEY, title TEXT, mtime INTEGER);
CREATE VIRTUAL TABLE notes_fts USING fts5(
  path UNINDEXED, title, body, tags,
  tokenize = 'unicode61 remove_diacritics 2'
);
CREATE TABLE links (src TEXT, target_raw TEXT, target_path TEXT);
CREATE TABLE tags (path TEXT, tag TEXT);
CREATE INDEX links_target ON links(target_path);
CREATE INDEX tags_tag ON tags(tag);
```

- `title` = first `# ` heading, else file name.
- On vault open: incremental update by comparing `mtime`; remove deleted files. Run in a background task; emit `vault://index-updated`.
- Update on every `write_note`, rename, delete, and watcher event.
- If the DB is corrupt or schema changes: delete and rebuild.

**Query**

- User text is split into terms; each term is quoted for FTS5 (escape `"`), the last term gets `*` for prefix matching. Terms are ANDed.
- Filters: `tag:<name>` and `path:<folder>` tokens in the query are parsed out and applied as SQL filters.
- Results ranked by `bm25()` with title weight 5, body 1, tags 3. Return path, title and `snippet()` with highlighted matches. Limit 50.
- Search panel (Ctrl/Cmd+Shift+F) with live results (debounce 200 ms).
- Quick open (Ctrl/Cmd+P): fuzzy file-name match (frontend, over the tree).

### 8.10 Projects

- A project is a folder. Right-click folder → "Make project" opens the Project settings dialog.
- **Nesting is not allowed** in v1: "Make project" is disabled if the folder is inside a project or contains a project.
- The **active project** is the project whose folder contains the currently open note. If no note is open, use the folder selected in the tree.
- Dialog fields: Name, Instructions (multi-line textarea, Markdown), AI provider (dropdown: "Use global default (<name>)" + configured providers), "Local AI only" checkbox.
- On creating a project when the **global default provider is cloud**: show a prompt "This project will use <cloud provider>. Lock it to local AI instead?" with buttons "Lock to local AI" / "Use global default".
- **AI-assisted instructions**: the dialog has an "Ask AI" button with a text input (e.g. "Make these instructions stricter about formatting"). The AI returns a proposed new instruction text, shown as a diff inside the dialog. User clicks Accept (replaces the field) or Reject. Saving the dialog still requires clicking Save. This call uses the project's own provider rules (respects local-only).

### 8.11 AI — providers

**LM Studio** (`kind: lmstudio`) and **OpenAI-compatible** (`kind: openai_compatible`)

- `GET {baseUrl}/models` → list models.
- `POST {baseUrl}/chat/completions` with `stream: true`, `messages`, `tools` (if `supportsTools`), `temperature: 0.3` for edits, `0.7` for chat.
- Parse SSE `data:` lines; handle `delta.content` and `delta.tool_calls` (accumulate by index); end on `[DONE]`.
- Header `Authorization: Bearer <key>` only if a key is stored.

**Anthropic** (`kind: anthropic`)

- `POST https://api.anthropic.com/v1/messages` with headers `x-api-key`, `anthropic-version: 2023-06-01`, `content-type: application/json`.
- `stream: true`, `max_tokens: 4096`, `system` as a separate field, tools in Anthropic format (`name`, `description`, `input_schema`).
- Parse SSE events `content_block_start`, `content_block_delta` (`text_delta`, `input_json_delta`), `message_stop`.
- Model chosen in settings via text field with suggestions from `GET /v1/models`.

Internally, convert all providers to one common message/tool format (`ai::providers::types`).

**Timeouts**: connect 10 s; no total timeout on streams; cancel via `ai_cancel`.

**Router and local-only enforcement** (`ai::router`)

1. Determine the provider: project `providerId` → else global default.
2. If the active project has `localOnly: true` and the provider `location` is `cloud` → return `ProviderBlocked`. This check is the **only** path to a provider and must be unit-tested.
3. The UI shows the active provider/model and a lock icon for local-only projects in the chat header and status bar.

**Tool support**: if `supportsTools` is false, chat and inline commands still work, but the agent and search tools are disabled, and the chat shows "This model does not support tools. Vault search and file changes are unavailable."

### 8.12 AI — system prompt assembly (`ai::prompt`)

Order:

1. Base prompt (below)
2. Global instructions (if any) under heading `## User's global instructions`
3. Project instructions (if any) under `## Project instructions (<name>)`
4. Context section: active note path and content (if "Include current note" is on), selected text (if any)

Base prompt:

```
You are the writing assistant inside Mimer, a Markdown note-taking app.
You help the user write, restructure, correct and find information in their notes.
Rules:
- Notes are Markdown. Preserve existing frontmatter, wiki-links ([[...]]) and tags unless asked to change them.
- Never invent facts about the user's notes. Use the search_notes and read_note tools to look things up.
- You cannot write files directly. To change files, use the propose_* tools. The user reviews every change.
- When proposing an edit, provide the complete new file content.
- Keep answers concise. Answer in the language the user writes in.
- You may only access files inside: <scope>.
```

`<scope>` is the project folder or `the whole vault`.

**Context budget**: estimate tokens as `chars / 4`. Keep the prompt within 75% of the provider's `contextTokens`. Truncate in this order: older chat messages (keep last 2 exchanges minimum), then tool results (truncate each to 6,000 chars), then current note (truncate middle, mark `[...truncated...]`).

### 8.13 AI — chat panel

- Right panel tab "Assistant" (Ctrl/Cmd+L to focus).
- Header shows: active project (or "Vault"), provider + model, lock icon if local-only.
- Toggle "Include current note" (default on).
- Messages render Markdown. Tool activity is shown as small status lines ("Searched notes for 'firewall'", "Read Work/Policy.md").
- Stop button cancels the running task.
- Chat history is kept in memory per vault session; "New chat" clears it. Not persisted in v1.
- If the AI calls `propose_*` tools, a "Review N proposed changes" card appears in the chat when the turn finishes (see §8.15).

### 8.14 AI — inline commands

- Select text, press Ctrl/Cmd+K (or right-click → AI) to open a small command popup at the selection.
- Commands: **Fix spelling and grammar**, **Rewrite clearer**, **Shorten**, **Expand**, **Restructure as list**, **Custom…** (free-text instruction).
- No tools are used. The prompt asks the model to return **only** the replacement text, no explanations, no code fences.
- Strip a single surrounding code fence if the model adds one anyway.
- Result is shown as an inline diff popup (old vs new) with **Accept** (Enter), **Retry**, **Reject** (Esc).
- On Accept: snapshot commit, replace selection in editor, write, commit `AI: <command> in <path>`.

### 8.15 AI — agent and proposals

**Tools** (OpenAI JSON schema shown; converted for Anthropic):

| Tool             | Parameters                                              | Behaviour                                   |
| ---------------- | ------------------------------------------------------- | ------------------------------------------- |
| `search_notes`   | `query: string`, `tag?: string`, `folder?: string`      | Returns up to 10 hits: path, title, snippet |
| `read_note`      | `path: string`                                          | Returns content (truncated to 12,000 chars) |
| `list_folder`    | `path: string` (`""` = scope root)                      | Returns child folders and notes             |
| `propose_edit`   | `path: string`, `new_content: string`, `reason: string` | Queues a full-content edit                  |
| `propose_create` | `path: string`, `content: string`, `reason: string`     | Queues a new note                           |
| `propose_move`   | `from: string`, `to: string`, `reason: string`          | Queues a rename/move                        |
| `propose_delete` | `path: string`, `reason: string`                        | Queues a delete                             |

- All paths are validated with `paths::resolve` against the active scope. Out-of-scope → tool returns an error message to the model (not a crash).
- `propose_*` tools never touch the disk. They add a `Proposal` to the current `ProposalSet` and return `"Queued for user review."`.
- Agent loop: send → execute tool calls → append results → repeat. Max **15** iterations, then stop with a message.
- One `ProposalSet` per chat turn. Multiple proposals for the same path are merged (last edit wins).

**Review UI (proposals feature)**

- Opens as a modal/panel listing every affected file with: action badge (Edit/Create/Move/Delete), path, reason, and an expandable unified diff.
- Each file has an **Accept / Reject** toggle (default: Accept). There is **no per-line approval**.
- Buttons: "Apply selected", "Reject all".
- Apply: (1) flush editor writes, (2) snapshot commit, (3) apply accepted proposals in order: moves, edits, creates, deletes, (4) update search index, (5) one commit `AI: <short summary>` (summary = first proposal reason, truncated to 60 chars, plus `(+N more)`).
- If a target file changed on disk after the proposal was made (compare content hash stored in the proposal), mark it "Changed since proposal" and require the user to re-confirm that file.
- If the open note is affected, reload it in the editor after apply.

### 8.16 Settings dialog

Tabs:

- **General**: theme (System/Light/Dark), editor font size, line width, spellcheck.
- **AI providers**: list, add/edit/remove. Fields: name, kind, base URL, model (dropdown from `list_models` + free text), location (read-only where fixed), supports tools, context tokens, API key (password field; saved to keychain; shows "Key stored" when set). "Test connection" button.
- **AI**: default provider, global instructions (textarea).
- **Version history**: author name/email, idle commit minutes (1–60).

---

## 9. UI layout and shortcuts

```
┌───────────────────────────────────────────────────────────────┐
│ Title bar (vault name — active note)                          │
├──────────────┬──────────────────────────────┬─────────────────┤
│ File tree    │ Editor (tabs not in v1;      │ Right panel:    │
│ / Search     │ one note at a time)          │ Assistant |     │
│ (toggle)     │                              │ Backlinks |     │
│              │                              │ History         │
├──────────────┴──────────────────────────────┴─────────────────┤
│ Status bar: save status · project · provider/model · lock     │
└───────────────────────────────────────────────────────────────┘
```

All three columns are resizable and collapsible; sizes persist in `localStorage` (wrapped in try/catch).

Use `Mod` = Ctrl on Windows/Linux, Cmd on macOS.

| Shortcut      | Action                         |
| ------------- | ------------------------------ |
| Mod+S         | Save and commit current note   |
| Mod+N         | New note in current folder     |
| Mod+P         | Quick open                     |
| Mod+Shift+F   | Search panel                   |
| Mod+K         | Inline AI command on selection |
| Mod+L         | Focus assistant chat           |
| Mod+Shift+H   | History of current note        |
| Mod+,         | Settings                       |
| Mod+B / Mod+I | Bold / italic                  |
| Esc           | Close popup/dialog             |

A command palette is out of scope; actions are in menus and context menus.

---

## 10. Performance targets

- Vault with 5,000 notes: open and index in < 5 s (first time), < 1 s (incremental).
- Search results in < 100 ms.
- Typing latency unaffected by indexing (index work runs off the UI thread).
- App cold start < 2 s on a typical laptop.

---

## 11. Testing requirements

### 11.1 Rust unit tests (required)

- `paths::resolve`: traversal (`../`), absolute paths, backslashes, symlink escape, scope enforcement, `.git` rejection.
- Wiki-link parsing and resolution (all syntax variants, ambiguous names, code-block exclusion).
- Tag extraction (inline, frontmatter, exclusions).
- Link rewriting on rename (alias and heading preserved).
- Git: commit creates no empty commits; history follows rename; deleted-file listing; restore.
- Search: index, update, delete, prefix match, tag/path filter, special characters in query.
- Router: `ProviderBlocked` for cloud provider in local-only project; allowed for local provider.
- Proposals: merging, apply order, content-hash change detection, out-of-scope rejection.
- SSE parsing for OpenAI-compatible and Anthropic (use recorded fixture strings in `src-tauri/tests/fixtures/`).

Use `tempfile` for test vaults.

### 11.2 Frontend tests (required)

- Live-preview decoration logic (markers hidden off-cursor, shown on cursor line).
- Wiki-link autocomplete filtering.
- Proposal review: per-file toggle and apply payload.
- Inline command result: fence stripping.
- Stores: save status transitions.

Mock `src/lib/api.ts` in tests.

### 11.3 Manual test checklist (`docs/MANUAL_TESTS.md`)

Create and maintain a checklist covering every milestone's acceptance criteria, to run on Linux before each release and on Windows for release candidates.

---

## 12. CI/CD

### 12.1 `ci.yml` (on push and pull request)

- `ubuntu-22.04`: install Linux deps, Node 22, pnpm, Rust stable; run `pnpm check`.

### 12.2 `release.yml` (on tag `v*`)

- Matrix: `windows-latest`, `macos-latest`, `ubuntu-22.04`.
- Use `tauri-apps/tauri-action` to build and attach artifacts to a draft GitHub Release.
- Windows: NSIS installer with `bundle.windows.nsis.installMode = "currentUser"` (no admin rights needed on the work laptop). WebView2: `downloadBootstrapper` (default).
- macOS: universal `.dmg`, unsigned.
- Linux: `.AppImage` and `.rpm`.

### 12.3 `tauri.conf.json` essentials

- `identifier`: `dk.mdvault.app`
- `productName`: `Mimer`
- Window: 1280×800 default, min 900×600.
- CSP: `default-src 'self'; img-src 'self' asset: http://asset.localhost data: blob:; style-src 'self' 'unsafe-inline'; connect-src ipc: http://ipc.localhost`
- Asset protocol enabled; scope set dynamically per vault (§8.4).
- Capabilities: only the plugins and commands listed in this spec. Network calls to AI providers happen **in Rust**, never from the webview.

---

## 13. Out of scope for v1

- Semantic search / embeddings / RAG
- Graph view
- Git remote / sync / push
- Multiple editor tabs or split panes
- Plugins / themes beyond light/dark
- Persisted chat history
- Table editing widget
- Export to PDF/HTML
- Command palette
- Mobile apps
- Real-time collaboration
- Code signing

---

## 14. Milestones and acceptance criteria

Implement in this order. Each milestone ends with: all checks green (`pnpm check`), tests added, `CHANGELOG.md` updated, manual checklist updated, and a Conventional Commit.

### M1 — Skeleton

- Tauri 2 + React + TS + Tailwind + shadcn/ui scaffolded per §5.
- ESLint, Prettier, Vitest, clippy, rustfmt, `ts-rs` export configured; `pnpm check` passes.
- CI workflow runs.
- **Accept**: `pnpm tauri dev` shows the empty app shell with three resizable columns and status bar.

### M2 — Vault and file tree

- Welcome screen, open/create vault, recent vaults, settings file.
- File tree with create/rename/move/delete (no link updating yet), path safety (§8.2).
- Watcher updates the tree on external changes.
- **Accept**: open a folder, create nested folders and notes, see changes made in another editor appear.

### M3 — Editor

- CodeMirror 6 live preview (§8.4), debounced disk writes, save status, external-change handling.
- **Accept**: typing `**bold**` renders bold and hides markers when the cursor leaves the line; edits survive app restart.

### M4 — Git history

- Repo init, all commit triggers (§8.8), close handling, idle commit.
- History panel with diff and restore; recover deleted notes.
- **Accept**: delete a note, restore it from "Recover deleted notes"; restore an older version of a note; no empty commits in `git log`.

### M5 — Links, tags, attachments

- Wiki-links with autocomplete and navigation, backlinks panel, tags, rename with link update (§8.6), paste/drag-drop attachments (§8.7).
- **Accept**: renaming a linked note updates links in other notes in one commit; pasted screenshot appears inline.

### M6 — Search

- FTS5 index (§8.9), search panel with filters, quick open.
- **Accept**: search finds notes by word prefix, `tag:` and `path:` filters work, results in < 100 ms on a 1,000-note test vault (generate with a script in `scripts/`).

### M7 — Settings and LM Studio chat

- Settings dialog (§8.16), keychain storage, LM Studio provider, model listing, test connection.
- Chat panel with streaming, include-current-note, stop button (§8.13), prompt assembly (§8.12).
- **Accept**: chat with a local LM Studio model about the open note, streamed token by token; Stop works.

### M8 — Inline commands

- Mod+K popup, all commands, diff popup, accept/retry/reject, snapshot + commit (§8.14).
- **Accept**: "Fix spelling and grammar" on a selected paragraph shows a diff; Accept replaces text and creates a commit.

### M9 — Projects

- Make project, dialog, no nesting, active project detection, local-only prompt, AI-assisted instruction editing with diff (§8.10).
- Router enforcement (§8.11).
- **Accept**: a local-only project refuses a cloud provider with a clear message; project instructions visibly change AI behaviour; AI-proposed instructions require Accept.

### M10 — Agent and proposals

- Tools (§8.15), agent loop, proposal review UI with per-file approval, apply flow with snapshot and commit, change detection.
- **Accept**: ask "Split this note into one note per heading and link them from an index note" → review shows creates + edit; accept some, reject others; only accepted changes are applied; everything is revertible via history.

### M11 — Cloud providers

- OpenAI-compatible (cloud) and Anthropic providers, API keys in keychain.
- **Accept**: switch global default to a cloud provider; creating a project prompts for local lock; chat and agent work with the cloud provider.

### M12 — Packaging and release

- `release.yml`, icons, NSIS per-user installer, README with install and usage instructions.
- **Accept**: tag `v0.1.0` produces a Windows installer that installs without admin rights and runs on Windows 11 with LM Studio on the same machine.

---

## 15. Definition of done (every task)

- Code follows §3 and passes `pnpm check`.
- New logic has tests (§11).
- No data-loss path introduced: every write that replaces user content is preceded by a commit or is itself committed.
- No AI path writes to disk without user approval.
- No cloud request possible from a local-only project.
- `CHANGELOG.md` updated under `[Unreleased]`.
- Any deviation from this spec recorded in `docs/DECISIONS.md` with reason.
