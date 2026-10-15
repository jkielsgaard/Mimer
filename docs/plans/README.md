# Mimer v2 feature plans

Step-by-step plans for the v2 features (1, 4–8) and the v3 features (9–12). Each plan is written so that a junior developer can build the feature **without asking questions**: every decision is already made, every file is named, and every task says when it is "done". If something is genuinely not covered, follow the rule at the bottom of this page.

| #   | Feature                                       | Plan                                                               | Size           | Depends on                           |
| --- | --------------------------------------------- | ------------------------------------------------------------------ | -------------- | ------------------------------------ |
| 8   | Persisted chat history and saved prompts      | [08-chat-history-and-prompts.md](08-chat-history-and-prompts.md)   | S–M (2–3 days) | –                                    |
| 4   | Templates and daily notes                     | [04-templates-and-daily-notes.md](04-templates-and-daily-notes.md) | M (3–4 days)   | –                                    |
| 1   | Tabs and split view                           | [01-tabs-and-split-view.md](01-tabs-and-split-view.md)             | L (6–8 days)   | –                                    |
| 6   | Table editor                                  | [06-table-editor.md](06-table-editor.md)                           | M–L (5–6 days) | do after 1 (both change the editor)  |
| 5   | Export to HTML, PDF and Word                  | [05-export.md](05-export.md)                                       | L (6–8 days)   | –                                    |
| 7   | Semantic search and "ask my vault"            | [07-semantic-search.md](07-semantic-search.md)                     | XL (8–10 days) | –                                    |
| 12  | AI is called Mimer, editable base instruction | [12-mimer-persona.md](12-mimer-persona.md)                         | S (1–2 days)   | –                                    |
| 9   | Mention notes in chat with `/`                | [09-mention-notes-in-chat.md](09-mention-notes-in-chat.md)         | M (3–4 days)   | do after 12 (both change the prompt) |
| 11  | Show that Mimer works, and how far            | [11-ai-progress.md](11-ai-progress.md)                             | M (3 days)     | do after 9 (both change chat events) |
| 10  | Import notes (OneNote migration)              | [10-onenote-import.md](10-onenote-import.md)                       | L (5–7 days)   | –                                    |
| 13  | Images in notes (proposal)                    | [13-images-in-notes.md](13-images-in-notes.md)                     | S–M (pick)     | –                                    |
| 14  | A clearer file panel (proposal)               | [14-file-panel-layout.md](14-file-panel-layout.md)                 | S–L (pick)     | –                                    |
| 15  | Name the note by typing its title (proposal)  | [15-title-first-notes.md](15-title-first-notes.md)                 | M (3 days)     | works best with 14                   |

The numbers are the numbers from the original idea list, so the file names stay stable.

## Build order (do them in this order)

1. **8 – Chat history and prompts.** Smallest, teaches you the full "Rust service → command → API wrapper → store → UI" loop used by everything else.
2. **4 – Templates and daily notes.** Same loop, plus vault config and a dialog.
3. **1 – Tabs and split view.** Changes how the editor is used everywhere. Do it **before** the table editor so you do not have to rewrite the table code afterwards.
4. **6 – Table editor.** An editor extension; builds on a stable editor.
5. **5 – Export.** Independent; touches Rust (new module), the dialog capability and one new dialog.
6. **7 – Semantic search.** The biggest. Do it last, when you know the codebase well.

The v3 features (9–12) come after the v2 ones, in this order:

7. **12 – Mimer persona.** Small; changes the system prompt and the AI settings, so do it first.
8. **9 – Mention notes with `/`.** Adds a field to the chat request and a picker in the chat box.
9. **11 – AI progress.** Adds two chat events and the live status line; builds on the chat changes above.
10. **10 – Import (OneNote).** Independent and the largest of the four; ends with a user guide.

Version: the four features together are a minor release, **0.3.0**.

Work on **one feature at a time, on its own branch**: `feat/chat-history`, `feat/templates`, `feat/tabs`, `feat/table-editor`, `feat/export`, `feat/semantic-search`. Merge to `main` only when the feature's "Definition of done" is fully ticked.

---

## Rules that apply to every task

Read `CLAUDE.md` sections 1 (principles), 3 (coding standards) and 15 (definition of done) before you start. The short version:

1. **Never lose user data.** Any code that replaces user content must be preceded by a commit (use `OpenVault::commit`) or be itself committed. Never use destructive Git operations.
2. **The AI only proposes.** Nothing the AI produces may be written to disk without the user pressing Accept/Apply.
3. **Local first.** Nothing may be sent to a cloud provider from a project marked `localOnly`. All provider access goes through `ai::router::select_provider`.
4. **Rust:** no `unwrap()`/`expect()`/`panic!` outside tests; return `AppResult<T>`; `///` doc comment on every public function; commands in `src-tauri/src/commands/` are thin (validate → call service → return).
5. **TypeScript:** no `any`, no `!` non-null assertions, function components only, one component per file, components never call `invoke` (use `src/lib/api.ts`), UI text in English with sentence case ("Make project", not "Make Project").
6. **Every path that crosses the IPC boundary is vault-relative with forward slashes** and is validated with `vault::paths::resolve` (or `resolve_dir` / `resolve_internal`, see below).
7. **New dependencies** (crates or npm packages) must be added with a line in `docs/DECISIONS.md` that says _why_. Prefer not adding any.
8. **Tests are part of the task**, not an extra. A task is not done until its tests exist and pass.
9. **Commit often** with Conventional Commits (`feat:`, `fix:`, `refactor:`, `test:`, `docs:`, `chore:`), one logical step per commit.

## Codebase map (where things are)

| What                                                          | Where                                                                                                                                                                      |
| ------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Rust entry, command registration                              | `src-tauri/src/lib.rs` (`tauri::generate_handler![...]`)                                                                                                                   |
| Thin command handlers                                         | `src-tauri/src/commands/*.rs` (one file per area; list in `commands/mod.rs`)                                                                                               |
| App state (`settings`, `vault`, `proposals`, `ai_tasks`)      | `src-tauri/src/state.rs` – get the open vault with `state.current_vault()?`                                                                                                |
| The open vault (repo, index, projects, file list)             | `src-tauri/src/vault/mod.rs` (`OpenVault`: `commit`, `with_repo`, `with_index`, `refresh_files`, `reindex`, `touch`, `config`)                                             |
| Vault operations (write, rename, delete, restore)             | `src-tauri/src/vault/ops.rs`                                                                                                                                               |
| Path safety                                                   | `src-tauri/src/vault/paths.rs` – `resolve` (user files), `resolve_dir` (empty path = root), `resolve_internal` (allows `.vault/`), `is_hidden`, `is_inside`, `to_relative` |
| Plain file operations                                         | `src-tauri/src/vault/fs_ops.rs` – `validate_name`, atomic `write_note`                                                                                                     |
| Commit kinds and messages                                     | `src-tauri/src/git/mod.rs` (`CommitKind`, `CommitReason::message`) – there is a test that pins every message                                                               |
| `.gitignore` lines Mimer adds                                 | `src-tauri/src/git/repo.rs` (`GITIGNORE_LINES`)                                                                                                                            |
| Markdown helpers (frontmatter, wiki-links, tags, code ranges) | `src-tauri/src/markdown/`                                                                                                                                                  |
| Search index (SQLite FTS5)                                    | `src-tauri/src/search/mod.rs`                                                                                                                                              |
| Settings (global, outside any vault)                          | `src-tauri/src/settings/mod.rs` – structs use `#[serde(default)]`, so adding a field is backwards compatible                                                               |
| AI: providers, router, prompt, tools, agent loop              | `src-tauri/src/ai/`                                                                                                                                                        |
| Types shared with TypeScript                                  | any Rust type with `#[derive(TS)] #[ts(export)]` → generated into `src/bindings/`                                                                                          |
| Test helper that opens a temp vault                           | `crate::vault::open_for_test(path)` (cfg(test))                                                                                                                            |
| Backend call wrappers                                         | `src/lib/api.ts` (object `api`) and `src/lib/events.ts`                                                                                                                    |
| Zustand stores                                                | `src/stores/` – `vaultStore`, `editorStore`, `uiStore`, `chatStore`, `settingsStore`, `proposalStore`                                                                      |
| Shared actions (open a link, save, new note)                  | `src/lib/actions.ts`                                                                                                                                                       |
| Pending-write registry (flush before commit)                  | `src/lib/flush.ts`                                                                                                                                                         |
| The editor                                                    | `src/features/editor/Editor.tsx`, extensions in `src/features/editor/extensions/` (`livePreview.ts` is one CodeMirror `StateField` that builds all decorations)            |
| Layout                                                        | `src/components/layout/` (`AppShell`, `Header` = File menu, `StatusBar`)                                                                                                   |
| shadcn-style UI primitives                                    | `src/components/ui/`                                                                                                                                                       |
| Frontend tests                                                | next to the file (`Foo.test.tsx`); `src/test/setup.ts` stubs jsdom gaps; `src/App.test.tsx` is the app smoke test                                                          |
| Manual test checklist                                         | `docs/MANUAL_TESTS.md` **and** the "Tests you need to do" section of `README.md` (keep both identical)                                                                     |
| Decisions and deviations                                      | `docs/DECISIONS.md`                                                                                                                                                        |

## Commands you will use all the time

```bash
# Frontend (Node 22: `nvm use 22`)
pnpm test                 # unit/component tests
pnpm lint                 # ESLint (strictTypeChecked) – must be clean
pnpm typecheck            # tsc
pnpm prettier --write .   # format everything (CLAUDE.md is ignored on purpose)

# Backend (run in the Fedora container, or wherever Rust is installed)
cargo test  --manifest-path src-tauri/Cargo.toml
cargo clippy --manifest-path src-tauri/Cargo.toml --all-targets -- -D warnings
cargo fmt   --manifest-path src-tauri/Cargo.toml
pnpm bindings             # = cargo test ... export_bindings → regenerates src/bindings/*.ts

pnpm tauri dev            # run the app
```

`pnpm check` runs all of the above (needs Node **and** Rust on the same machine).

## The "add a backend feature" recipe (used by every plan)

1. **Service function** in the right module (pure Rust, no Tauri types), with `///` docs and **unit tests** using `tempfile`/`open_for_test`.
2. **Types** that cross the boundary: `#[derive(Debug, Clone, Serialize, Deserialize, TS)]`, `#[serde(rename_all = "camelCase")]`, `#[ts(export)]`. Use a **unique type name** (two exported types with the same name overwrite each other's `.ts` file). 64-bit numbers need `#[ts(type = "number")]`.
3. **Command** in `commands/<area>.rs`:
   ```rust
   #[tauri::command]
   pub async fn my_command(state: State<'_, AppState>, some_arg: String) -> Result<MyType, AppError> {
       let v = state.current_vault()?;          // bind first – `&state.current_vault()?` confuses type inference
       my_service::do_it(&v, &some_arg)
   }
   ```
4. **Register** it in `lib.rs` inside `generate_handler![...]`.
5. `pnpm bindings` → new `.ts` files appear in `src/bindings/` (commit them; CI fails if they are stale).
6. **Wrapper** in `src/lib/api.ts`. Argument names on the JavaScript side are **camelCase** (`some_arg` → `someArg`).
7. Use it from a store/component. Mock `@/lib/api` in tests (see `src/App.test.tsx` for the pattern with `vi.hoisted`).

## The "add a frontend feature" recipe

1. Pure logic first (a `lib/*.ts` file or store action) with tests.
2. Component(s) in `src/features/<name>/`, one per file, PascalCase.
3. Wire into the layout/menu; add the keyboard shortcut in `src/App.tsx` (`bindings` object) if the plan says so.
4. `pnpm prettier --write src && pnpm lint && pnpm typecheck && pnpm test`.
5. **Look at it running** (`pnpm tauri dev`) – lint cannot tell you if it looks right.

## Definition of done (every feature)

- [ ] All tasks in the plan are finished and each task's "Done when" is true.
- [ ] `pnpm check` is green (format, lint, typecheck, tests, rustfmt, clippy, Rust tests).
- [ ] `src/bindings/` regenerated and committed.
- [ ] New tests cover the logic listed in the plan's "Tests" section.
- [ ] `CHANGELOG.md` has entries under `[Unreleased]` → `### Added`.
- [ ] `docs/MANUAL_TESTS.md` **and** the README checklist have the new manual tests (copy the plan's list).
- [ ] `docs/DECISIONS.md` records every deviation (new dependency, changed spec rule, new command, etc.).
- [ ] The README feature list / shortcut table mention the feature.
- [ ] You ran the manual tests from the plan on Linux and everything passes.
- [ ] No data-loss path was introduced; no AI path writes without approval; no cloud request from a local-only project.

## Common pitfalls (learned the hard way on v1)

- `ls` sometimes prints nothing in the tool shell; use `find . -maxdepth 2`.
- `mkdir -p` the directory **before** writing a file into it.
- In Rust, `&state.current_vault()?` can fail to compile; bind it to a variable first.
- `chrono`'s `format()` **panics** in `to_string()` if the format string is invalid. Write into a `String` with `write!` and handle the `Err`.
- ESLint `no-unnecessary-condition` complains about `let cancelled = false` flags that are changed in a cleanup; use an object (`const run = { cancelled: false }`).
- jsdom has no layout: `react-resizable-panels` and CodeMirror geometry calls are stubbed in `src/test/setup.ts`. If a new browser API is missing, stub it there.
- Prettier rewrites files; run it before you run ESLint.
- The editor must be **read-only when no note is open** (a past bug: text typed with no note open was silently lost).
- After changing a `#[ts(export)]` type, run `pnpm bindings` **and** fix TypeScript call sites.

## If something is not covered

Choose the simplest option that respects the principles in `CLAUDE.md` §1.1, implement it, and write one paragraph about the choice in `docs/DECISIONS.md` (what, why, alternatives you rejected). Do not stop to ask.
