> **Status: implemented in 0.3.0.** See docs/DECISIONS.md (section Version 0.3.0) and CHANGELOG.md. The text below is the original plan.

# Feature 10 – Import notes (OneNote migration)

Branch: `feat/import`. Read [README.md](README.md) first (rules, definition of done).

## Is it possible?

**Yes, in two parts.** OneNote stores notes in its own format and has no Markdown export, so Mimer cannot read a OneNote notebook by itself without a lot of fragile code. What works well:

1. Convert the notebook to Markdown files with a **free third-party exporter** (the user does this once, outside Mimer).
2. Use a new **File → Import notes from folder…** in Mimer that safely copies those Markdown files and their images into the vault, in one Git commit. It also works for other apps (Obsidian, Notion, plain Markdown folders).

### What we checked (current as of October 2026; third-party tools change, so the guide tells the user to check each project's page)

| Route                                                             | Needs                                                | Verdict                                                                                                             |
| ----------------------------------------------------------------- | ---------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| **OneNoteMdExporter** (alxnbl/onenote-md-exporter, GitHub)        | Windows, desktop OneNote 2013+ (not the Store app)   | Most used exporter. Writes Markdown + attachments. **Recommended** for work notebooks opened in desktop OneNote.    |
| Direct `.one` converters (for example rans0r/onenote-to-markdown) | Python; reads `.one` files from OneDrive/SharePoint  | Works without OneNote installed, but young and unverified. Offer as an alternative, not the main route.             |
| Export pages to Word (`.docx`) + Pandoc                           | Desktop OneNote, Pandoc                              | Manual, loses images and structure. Last resort.                                                                    |
| Microsoft Graph OneNote API                                       | Azure app registration, sign-in, often admin consent | **Rejected for Mimer:** needs a cloud sign-in and IT approval, and a lot of code. Not worth it for a one-time move. |
| Obsidian Importer                                                 | Obsidian                                             | Not usable (needs Obsidian).                                                                                        |

Mimer itself will **not** read `.one` or `.onepkg` files in this feature (record in DECISIONS.md).

## What the user gets

- **File → Import notes from folder…** with three steps: pick the source folder → see a preview (notes, images/attachments, name clashes, skipped files) → choose the target folder in the vault (default `Imported/OneNote`) → import with a progress bar.
- Notes and attachments keep their folder structure, so relative image links keep working. Nothing in the vault is ever overwritten: a clash gets a suffix (`Name 1.md`).
- One snapshot commit before and one commit after: `Import: 42 notes from "OneNote export"`. Everything is undoable through History.
- A **step-by-step guide** (`docs/IMPORT-ONENOTE.md`, also linked from the import dialog) written for a non-developer.

## Decisions (already made – do not change)

| Question                  | Decision                                                                                                                                                                                                                           | Why                                                              |
| ------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| Source folder             | Any folder the user picks with the system dialog. It is **read only**; Mimer never changes or deletes it.                                                                                                                          | Principle 1 (no data loss).                                      |
| What is copied            | `.md` files and the attachment/image extensions the file tree already shows (`vault::tree::ATTACHMENT_EXTS`; make that constant `pub` and reuse it, do not copy the list). Everything else is counted as "skipped" in the preview. | Same rule as the tree; no executables or odd files in the vault. |
| Hidden items, symlinks    | Names starting with `.` and `node_modules/` are skipped. Symlinks are **not followed**.                                                                                                                                            | Safety; avoids copying from outside the chosen folder.           |
| Size limit                | A single file over 50 MB is skipped and reported.                                                                                                                                                                                  | Keeps the vault usable.                                          |
| Names                     | Characters Windows rejects (`<>:"/\|?*`) become `-`; trailing dots/spaces are trimmed; reserved names (`CON`, `NUL`, …) get a `_` suffix. Every rename is listed in the report.                                                    | A vault must work on all platforms.                              |
| Clashes                   | Never overwrite. `Name.md` → `Name 1.md`, `Name 2.md`.                                                                                                                                                                             | Principle 1.                                                     |
| Links                     | Files keep their relative structure, so relative links and images keep working. Links are **not** rewritten in v1. The report counts `[[wiki-links]]` whose target is missing.                                                     | Rewriting is risky; the exporter already produces working links. |
| Where is the destination? | Inside the vault only, resolved with `paths::resolve_dir` (no `..`, not `.git/`, not `.vault/`).                                                                                                                                   | §8.2.                                                            |
| Commit                    | New `CommitKind::Import`, message `Import: <n> notes from "<folder name>"`. A snapshot commit first, no empty commits.                                                                                                             | §8.8; add the kind to the table in DECISIONS.md.                 |
| Cancel                    | Possible during the copy. Already-copied files stay (and are committed as `Import (cancelled): …`), nothing is half-written (`fs_ops::write_atomic`).                                                                              | No partial files.                                                |
| New dependencies          | None. Use `walkdir` only if it is already in `Cargo.lock`; otherwise `std::fs::read_dir` recursion.                                                                                                                                | Rule 7 in the README.                                            |

## Tasks (in order)

### Task 1 – Import service (L)

New Rust module `src-tauri/src/import/mod.rs` (no Tauri types, so it is unit-testable):

- `pub fn scan(source: &Path) -> AppResult<ImportPlan>`: walks the folder, returns the files to copy (relative path, size, kind), skipped files with reasons, and name changes. Does not touch the vault.
- `pub fn run(vault: &OpenVault, plan: &ImportPlan, source: &Path, dest_folder: &str, cancel: &CancellationToken, progress: &dyn Fn(u32, u32)) -> AppResult<ImportReport>`: snapshot commit, copy with `write_atomic`, de-duplicate names, `vault.reindex` once at the end (use `sync_index`), commit.
- `ImportReport { imported_notes, imported_attachments, renamed, skipped, broken_links }` with `#[derive(TS)]` and `///` docs.
- `sanitize_name(name: &str) -> String` as a separate, well-tested function.

Tests (use `tempfile`): structure preserved; clash gets a suffix and the original is untouched; Windows-illegal and reserved names; hidden files and symlinks skipped (symlink test only on Unix); file over the limit skipped; destination `../x` or `.git` rejected; cancel keeps a consistent vault; exactly one commit made and none when nothing was imported; the source folder is byte-for-byte unchanged afterwards.

Done when: all tests pass.

### Task 2 – Commands and bindings (S)

`src-tauri/src/commands/import.rs` (thin): `scan_import(source: String) -> ImportPlan`, `run_import(source, dest_folder, channel) -> ImportReport` (progress through a `Channel<ImportEvent>`, like the chat stream), `cancel_import()`. Register in `lib.rs`; add to `src/lib/api.ts`. The source path is an absolute path chosen in the OS dialog – validate that it exists, is a directory and is **not inside the vault**. Add `CommitKind::Import` in `git/mod.rs` with its message format and a test.

### Task 3 – Dialog (M)

`src/features/import/ImportDialog.tsx` (one component; split a `ImportPreview.tsx` if it grows): step 1 choose folder (use the typed wrapper in `src/lib/dialogs.ts` – add `pickFolder` use, it exists), step 2 preview table with counts and a collapsible list of skipped/renamed files, step 3 destination folder field (default `Imported/OneNote`) and an **Import** button, then a progress bar (this is a real percentage: files done / total) with **Cancel**, then the report with an **Open folder in tree** button. Menu entry in **File** (`components/layout/Header.tsx`). Link "How do I export from OneNote?" opens the guide text in the dialog (short version, see Task 4). Component tests with the API mocked: preview shows counts; cancel calls the API; report shown; errors shown as a toast.

### Task 4 – The user guide (S)

Write `docs/IMPORT-ONENOTE.md`, in plain language, with these parts (and link it from README and START-GUIDE):

1. What you need and how long it takes; **a warning for work notebooks**: check with your IT/security rules before copying company notes to a personal vault, and remember Mimer's cloud AI sends note text to a cloud service unless the project is "Local AI only".
2. Route A (recommended, Windows): install OneNoteMdExporter from its GitHub page, close OneNote's other windows, run it, pick the notebook, choose the Markdown flavour, export. Tell the user to read the tool's README for the current options, because we did not test it.
3. Route B (no OneNote installed): the direct `.one` converter, marked "newer, check that it works for you".
4. Route C (manual): export pages to Word and convert.
5. In Mimer: **File → Import notes from folder…**, pick the exporter's output folder, check the preview, import. How to undo: History → restore, or delete the imported folder (it is in Git history).
6. After the import: check a few notes, images, tables and links; what OneNote features do not survive (ink/drawings, some layouts, audio); how to re-run safely (a second import adds `… 1` copies, so delete the first import folder first).
7. Troubleshooting.

### Task 5 – Docs and tests (S)

README, `docs/MANUAL_TESTS.md` (section "Import"), `docs/DECISIONS.md` (the decisions above, the rejected routes, `CommitKind::Import`), `CHANGELOG.md`. (Built differently: the tests create their sample folder in a temporary directory, so no fixture folder is needed.) Add a small sample folder under `src-tauri/tests/fixtures/import-sample/` (notes, an image, a clash, a hidden file) used by the scan test.

## Manual test

- [ ] Export a small test notebook with OneNoteMdExporter (or use any Markdown folder), import it into a throw-away vault: the preview counts match the folder.
- [ ] The imported notes open, images show, `[[links]]` that point inside the import work.
- [ ] Import the same folder again: copies get ` 1`, nothing is overwritten.
- [ ] History shows `Snapshot before import…` and one `Import: …` commit; restoring from History works.
- [ ] Cancel during a large import leaves a clean vault with a matching commit.
- [ ] The source folder is unchanged.

## Definition of done

`pnpm check` green, bindings regenerated, tests for every task, the guide reviewed by someone who has never used the tool, manual list ticked. Windows is tested before release.
