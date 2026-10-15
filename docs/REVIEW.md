# Code review: compliance with CLAUDE.md

Status of each finding from the review. Tick a box only after the fix is in and `pnpm check` plus `cargo test` pass. All items are ticked. Item 11 was finished in a later pass; see its note.

## High priority

- [x] 1. Project is not a Git repository (§3.3). Run `git init -b main`, commit v1 and each v2 feature in logical steps.
  - Done: repository initialised on `main`, first commit `6b9a92a`.
- [x] 2. Business logic in command handlers (§3.1). Move project create/update/delete, vault open, settings update and hybrid search into service functions with unit tests. Commands only validate, call and return.
  - Done: project create/update/delete, settings-change decision and hybrid merge moved to tested services. Vault open, close, create and remember-last now live in `vault/session.rs` (7 tests). The command keeps only the window-bound steps (asset scope, file watcher, index thread), which need a Tauri handle.
- [x] 3. Errors silently ignored on data-safety paths (principle 1). Log swallowed errors with `tracing::warn!`; surface commit and config failures to the UI.
  - Done: swallowed errors on commit, watcher, settings lock and config read are logged.

## Medium priority

- [x] 4. Non-atomic writes. Add one `fs_ops::write_atomic` helper and use it for restore, project, template and vault config writes.
  - Done: `fs_ops::write_atomic` used everywhere a file is replaced; unit test added.
- [x] 5. Components call Tauri plugins directly (§3.2). Add typed wrappers in `src/lib/` for dialogs and window title.
  - Done: `lib/dialogs.ts` and `lib/window.ts`; no component imports a Tauri plugin.
- [x] 6. More than one component per file (§3.2). Split `Tabs`, `TreeRow`, `Bubble`, `Row`, `Pane` into their own files.
  - Done: every component file now holds one component; verified by script.
- [x] 7. New logic without tests (§15). Add tests for editor tab switching, search modes, semantic settings, vault settings, chat and prompt menus, print preview and history.
  - Done: component tests for editor tab switching, search modes, vault settings, chat history and prompt menus, and the history panel, plus print preview and semantic settings. `spawn_index_job` is now a thin call to `plan_index`, which is tested (Markdown filter, cloud exclusion, progress total). The Tauri spawn itself is not unit-tested.
  - Also fixed: `App.test.tsx` restored a note saved by an earlier test; it now clears the saved layout first.
- [x] 8. `react-hooks/exhaustive-deps` suppressed in `SettingsDialog.tsx` and `ProjectDialog.tsx`. Reset dialog state with a `key` and remove the suppressions.
  - Done: dialogs split into wrapper plus form mounted per open; no suppressions left.
- [x] 9. Circular import between `chatStore.ts` and `vaultStore.ts`. Break the cycle.
  - Done: vault store no longer imports chat store; `stores/chatSync.ts` reacts to vault changes.
- [x] 10. File reads that bypass `paths::resolve` (§8.2). Route them through `resolve`.
  - Done: note reads go through `paths::resolve`.
- [x] 11. Oversized modules. Extract a note-session hook from `Editor.tsx`; split `FileTree.tsx` and `search/mod.rs`.
  - Done: the note session (CodeMirror view, load and autosave, tab switching, disk changes, keep/load conflict) moved to `features/editor/useNoteSession.ts`. `Editor.tsx` is now 146 lines and only renders the banner, the no-note hint and the inline AI popup. `search/mod.rs` keeps its code; its tests moved to `search/tests.rs` (452 lines left).
  - Not split: `FileTree.tsx` is 195 lines and one component, so there is nothing to separate. The review's suggestion is not needed.
  - Note: `useNoteSession.ts` is 414 lines because it holds one lifecycle (load, save, switch, disk changes). Splitting it further would mean passing the editor view and session refs between files, which is harder to follow than keeping it together.

## Low priority

- [x] 12. Missing `///` doc comments on `ProposalSet::new`, `ChatMessage::user/assistant/tool_result`, `ResolvedProvider::config`, `CommitReason::new`.
  - Done: doc comments added.
- [x] 13. Placeholder parameters `let _ = from_path;` (commands/search.rs) and `let _ = v;` (export/mod.rs). Remove them.
  - Done: placeholder parameters removed.
- [x] 14. Unused API wrappers `linkTargets`, `projectForPath`, `resolveLink`, `deleteTemplate`. Remove them or add the UI.
  - Done: unused commands and wrappers removed.
- [x] 15. Unused dependency `@lezer/markdown`. Remove it or record why in DECISIONS.md.
  - Done: `@lezer/markdown` removed.
- [x] 16. Lowercase `components/ui/*.tsx` names. Record the exception in DECISIONS.md.
  - Done: recorded in docs/DECISIONS.md.
- [x] 17. Toolchain not pinned. Add `packageManager`/`engines` to package.json and `rust-version` to Cargo.toml.
  - Done: packageManager/engines in package.json, rust-version 1.88 in Cargo.toml.
- [x] 18. HTTP client silently falls back to a default without the timeout. Return an error instead.
  - Done: `http_client()` returns an error instead of falling back.
- [x] 19. Chat `projectId` always null. Fill it or remove it.
  - Done: chats record their project id.
- [x] 20. Plan docs in `docs/plans/` still read as to-do. Mark them implemented.
  - Done: plan files marked implemented.

## Not code (cannot be fixed here)

- Windows build and run not verified.
- Semantic search not run against a real embedding model.
- Export save and print dialogs not clicked through.

## Second review pass (before version 0.2.0)

Checked against CLAUDE.md §3: no `unwrap`/`expect`/`panic!` outside tests and `main` setup (regex literals are a recorded exception), every public service function has a `///` comment, components only reach the backend through `src/lib/api.ts` and `src/lib/events.ts`, one component per file, file naming, sentence-case UI text, CSP and capabilities as in §12.3.

- [x] 21. Logic left in Tauri commands: saving settings, the connection-test message and pruning applied proposals.
  - Done: `settings::service::apply_update` (4 tests), `providers::connection_report` (3 tests), `proposals::forget_applied` (1 test). The commands only call them.
- [x] 22. Non-null assertions (`!`) in tests without a justifying comment (§3.2), allowed by an unrecorded ESLint exemption.
  - Done: tests use `must()` from `src/test/must.ts`; the exemption is removed. The two remaining test-only ESLint exemptions are recorded in DECISIONS.md.
- [x] 23. No visible version (§3.3 Semantic Versioning).
  - Done: version 0.2.0, shown with build metadata (`0.2.0+<commit>[.dirty]`) in the status bar, the welcome screen and Settings → General. `package.json` is the single source; a test keeps `Cargo.toml`, `tauri.conf.json` and `CHANGELOG.md` in step.
