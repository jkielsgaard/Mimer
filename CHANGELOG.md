# Changelog

All notable changes to this project are documented in this file.
The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.8.1] - 2026-10-15

### Added

- **A Microsoft Store package (MSIX).** `scripts/msix/Build-Msix.ps1` makes the package from the Windows release build: the manifest, the logos and `makeappx`. With `-TestSign` it also makes a copy signed with a test certificate, with `Install-TestMsix.ps1` and a Windows Sandbox file (`mimer-sandbox.wsb`) to try it on a clean Windows. The package Microsoft wants is unsigned: the Store signs it itself, so no certificate is needed and Windows shows no "unknown publisher" warning. The release workflow builds it as an artifact (`mimer-msix`) without ever failing the release, and CI packs and signs a stand-in program with the real manifest, so a mistake shows early. How to reserve the name, build, test and submit is in `docs/MSIX.md`.
- A **privacy policy** (`PRIVACY.md`), which the Store listing needs.

### Changed

- When Mimer runs as a Store package it keeps the built-in AI files in the user's data folder (the program folder is read-only), which goes away with the app. **The built-in AI cannot be downloaded in the Store version** until the Store's rules about apps that download programs have been checked (`ENGINE_DOWNLOAD_IN_STORE_BUILD`); the settings say so and LM Studio works as before.

## [0.8.0] - 2026-10-15

### Added

- **A built-in AI: Mimer without LM Studio.** **Settings → Built-in AI**: choose your processor (AMD, Intel, other) and graphics card (Nvidia, AMD, Intel, none), pick a model, and press **Download**. Mimer downloads llama.cpp's `llama-server` (build b11636) for Windows or Linux and the model, checks both against fixed SHA-256 checksums, and keeps them in its own folder. The engine is chosen from the graphics card: Vulkan (AMD, Intel and Nvidia), CUDA 12 or 13 (Nvidia), ROCm (AMD) or SYCL (Intel) as advanced choices, or CPU only. Models: **Gemma 4 12B** (recommended, 7.0 GB), **E4B** (5.2 GB), **E2B** (3.3 GB) and **26B-A4B** (14.4 GB), all Google's quantisation-aware GGUF files under Apache-2.0, pinned to a commit. You can also add your own `.gguf` file.
- **Wake Mimer / Sleep Mimer** in the Mimer tab. Wake loads the model into memory; Sleep unloads it and gives the memory back. The message box is **locked until Mimer is awake**, in the screen and in the backend. Mimer can also sleep by itself after a number of idle minutes.
- **Clear problems.** When something fails (not enough memory, a graphics or Nvidia driver, a missing Windows runtime or Linux library, a busy port, a damaged or too new model, security software, a failed download or a full disk) the Mimer tab and the settings say what happened, give numbered steps, and have the engine's own last lines under **Show details** with **Copy details**.
- **Settings for the built-in AI** that apply at the next wake: context size, how much goes on the graphics card (automatic, as much as possible, none, or a number of layers), processor threads, flash attention, thinking (off by default) and sleep after idle time. The bar says when a change needs a sleep and a wake.
- The engine **never outlives Mimer**: it is stopped by Sleep and by closing Mimer, and if Mimer crashes or is killed (Linux: the kernel stops it; Windows: a job object; a pid file removes a leftover at the next start). It listens on `127.0.0.1` only, with a random key made at each wake, and has no web page.
- On Windows the files live next to the program (`%LOCALAPPDATA%\Mimer\mimer-ai`) and the **uninstaller removes them** (an NSIS hook also stops the engine first). On Linux they are in the user's data folder, and **Settings → Built-in AI → Remove files** deletes them.
- **The new app icon** (the gold M on a dark tile) in all sizes for the window, the installer and the favicon.

### Changed

- **A project is always a new folder in the vault root.** **New → Project…** asks for a name and makes that folder and the project at once, whatever is selected. **Make project** on an existing folder is gone: a project cannot be made from a folder, cannot be put inside a folder or another project, and a name that is used in the root (a folder, a note, another project, any case) is refused while you type. A project can be renamed but not moved into a folder; the project and its folder keep the same name when renamed. Projects made by older versions inside folders keep working.
- Conflicts such as moving a project into a folder open a dialog that must be closed, like taken names do.
- Provider lists include "Mimer (built-in)". The built-in AI cannot be used for semantic search (it runs a chat model).

### Fixed

- The release workflow no longer builds macOS (it cannot be tested); CI compiles and lints the Rust code on Windows too.

## [0.7.1] - 2026-10-15

### Changed

- **A new note is named in the same way everywhere.** Ctrl/Cmd+N, **New → Note** and the file tree's menus all open the same small window that asks for the name (it starts with `Untitled`, or `Untitled 1` … when that is taken). The note then opens with the name as its first line. Before, the New menu made an untitled note and the name was typed on its first line, which looked different from the other ways.
- A name that is taken is explained **while you type**, in a red box with an icon, and **Create** / **Rename** cannot be pressed: "A note called “Plan” already exists in “Work”." This goes for new notes, new folders, renaming and new projects.
- Moving something (drag and drop, or Move to…) onto a name that is already taken stops with a **window you have to close**, not a toast that disappears. Moving several items collects all the clashes in one window. Nothing is changed for the items that clash.

### Fixed

- **Two things could have the same name in one folder.** Only an exact match was refused, so `Docs` and `docs`, or a note `Work` next to a folder `Work`, were allowed. They look the same in the file tree, and a project and a folder with the same name caused trouble. Now a name counts as taken when it matches ignoring upper/lower case, with a note counting without `.md`. The check is in the backend (new notes and folders, renaming, moving, notes created by Mimer), so it is the same on Linux and Windows. A case-only rename (`plan` → `Plan`) still works. Existing vaults are not changed.
- **Two projects could have the same name.** The project name must now be unique (ignoring case), and the project window says so.

## [0.7.0] - 2026-10-15

### Added

- **Raven**, a separate tab for a cloud AI that has **no access to your notes**. It is a plain chat for knowledge from the internet (whether it can look things up depends on the provider and model). Each answer has **Copy** and **Save as note** (a new note marked `status: needs review`, `source: raven`). The tab is shown only when a cloud provider is chosen under **Settings → AI → Raven's provider**. The first time, a notice says what is sent and to whom. The research prompt card has a **Send to Raven** button that fills the message box (you still press send). The Raven chat is not saved.
- A line at the top of both tabs says where the AI runs: Mimer "Local AI · your notes stay on this computer", Raven "Cloud AI · no access to your notes" (with the provider's name).
- A **beta** mark in the status bar, on the start and splash screens, in About and Settings, in the window title and in the README. GitHub releases are marked as pre-releases.
- The licence is now **Apache-2.0** (was MIT), with a `NOTICE` file, so that other versions of Mimer point back to this project. A short "Why Mimer?" section in the README.

### Changed

- **Your notes only ever go to a local AI.** Mimer, inline commands, the project dialog's "Ask AI" and semantic search accept local providers only. A provider is local only when its address is on this computer: this now also applies to LM Studio providers (before, the kind alone made it local). The settings file cannot override this.
- **Settings → AI:** the Mimer provider list shows local providers only, and there is a new **Raven's provider (cloud AI)** setting. A cloud provider that was the default in an older version moves to Raven, and the first local provider becomes the default.
- Projects no longer have **Local AI only** (nothing from notes can reach the cloud any more), and the lock icons are gone. Old project files still open; the old setting is ignored and dropped when the file is saved. A cloud provider chosen for a project in an older version is ignored.
- Semantic search lists local embedding providers only.
- No macOS build for now (it cannot be tested); the release workflow builds Windows and Linux.

### Security

- Closed three holes in the old per-project lock: a note from a locked project could be attached or read from outside the project and sent to a cloud provider; inline AI trusted the lock flag sent by the UI; a provider of kind LM Studio was always treated as local whatever its address was. The new rule has no per-project state to get wrong, and Raven's backend receives no vault at all.

### Fixed

- Built (release) versions of the app showed the editor without its styling: headings, lists and links were not formatted and every word sat on its own line. Tauri added a nonce to the style rules of the security policy, which made the browser ignore the inline styles that CodeMirror adds. `style-src` is now excluded from that change (`dangerousDisableAssetCspModification` in `tauri.conf.json`). `pnpm tauri dev` was not affected.
- A vault that was deleted, renamed or moved on disk can now be dealt with from the start window: it is marked "Folder not found" and can be removed from the list, or located at its new place. The folder itself is never touched.
- CI: pnpm's version is read from `package.json`, and a chat-list test no longer depends on timing.

## [0.6.0] - 2026-10-14

### Added

- **Attach a whole folder or project** to a message to Mimer: type `/` and pick a folder (shown with a folder icon and its note count). Mimer receives its notes (the first 40, each shortened to 6,000 characters) and in a project only the project's own folders are offered.
- **Tasks menu** over the message box with ten ready-made jobs (merge notes, propose a structure, split a long note, summarise, fix spelling and grammar, find duplicates, create an index page, add links between notes, collect action items, tidy up formatting). A task fills in the message box; you can edit it before sending.
- **Research prompts for a cloud AI.** Mimer has no internet access, so it no longer writes new facts from memory by default. Instead it has a tool, `write_research_prompt`, and **File → Write a research prompt…** (also in the Tasks menu) builds the same prompt from a form: topic, goal, audience, type, depth, language, what you already have. The prompt tells the cloud AI how to answer: one Markdown document with front matter, a summary, sections, a **Sources** list with links and dates and an **Open questions** list. In the chat the prompt is a card with **Copy prompt**.
- **Import an answer from a cloud AI** (File menu, Tasks menu or the card): paste the answer, check the warnings (no sources, very short, no title), and it is saved as a new note marked `status: needs review`. A code fence or a sentence around the answer is removed; existing notes are never overwritten.
- **Settings → AI → Let Mimer write new content from its own knowledge** (off by default). **Settings → General → Recent notes shown** (0–20, default 4).

### Added (your own order)

- **My own order:** the Sort button in the file panel has a new choice, **My own order**. Then nothing is sorted for you: drag a note or folder to the top or bottom edge of another to put it before or after it (the middle of a folder still moves it into the folder), or right-click → **Move up / Move down**, or press **Alt+Up / Alt+Down**. It works in All files and in every project, folders and notes can be mixed, and items dragged from another folder are moved there first. New notes go last in their folder. Meetings and Quick notes are not moved to the top in this mode. The order is saved in `.vault/order.json` (plain JSON, committed with the vault) and follows renames and moves.

### Added (several files at once)

- **Select several files and folders in the file tree:** Ctrl/Cmd+click ticks or unticks an item, Shift+click ticks everything between two items. Right-click a ticked item for **Move N items to…** (choose the folder) and **Delete N items** (one question for all), or press Delete. Dragging a ticked item moves all ticked items, also onto a project. Links in moved notes are updated without asking for each one. A folder and a note inside it are moved once. Esc or a plain click clears the selection. Everything stays in the version history.

### Added (pictures)

- **Reuse a picture:** the Images tab has **Insert in note** under every picture (written at the cursor of the note you last clicked in, in the vault's link style), and pictures can be dragged from the tab into a note.
- **Look closer:** clicking a picture in a note or in the Images tab shows it large in a window (Esc closes it), without opening another program.

### Fixed

- A tool call that arrived with no arguments (the answer was cut off by a small context window) was sent back to the server as an empty string, which made LM Studio answer `500 Internal Server Error` on every later step. It is now sent as `{}`, and Mimer is told the answer was probably cut off.

### Changed

- **Projects are no longer part of "All files".** Under **Projects**, each project has its own tree with its notes and folders, a **+** button for new notes, a gear for the project settings, and it accepts notes dragged onto it. Notes can still be linked across the project border in both directions. A project cannot be nested by dragging.
- **Recent** shows 4 notes instead of 8, and the number is a setting.
- **Meetings** and **Quick notes** (the folders set in Settings → Vault) are at the top of **All files**.
- **The attachments folder is no longer listed in "All files"**; pictures are in the **Images** tab, where clicking a picture or its name now opens it.
- **Right-click in Projects** gives the same menu as in All files (new note, new folder, rename, delete, index page, project settings, export, reveal).
- **The web view's own right-click menu (Back, Reload…) is gone.** Right-clicking elsewhere shows **Inspect element**; text fields keep the system menu.
- **The Backlinks tab is removed** from the right panel (the backend and the rename link update are unchanged).
- The filter box searches inside projects too, and the fold state of the Projects section and of each project is remembered.

## [0.5.0] - 2026-10-13

### Added

- **How-to guide and "?" hints.** The **?** button in the top bar, **File → How to use Mimer** or **F1** (also on the welcome screen) opens a guide with fourteen topics (getting started, writing, naming a note, links and index pages, images, Mimer, projects, templates, several vaults, version history, search, import, export, shortcuts) and a search box. Small **?** buttons next to settings, the chat, the search modes, the Images tab, the import dialog, the editor toolbar and the file tree explain what something does when you point at, focus or click them, with a link to the matching topic.
- **A new note is named by its title.** A new note starts with `# ` and the cursor after it. Type the title and, a moment after you pause, the file is renamed to match (`# Weekly sync` becomes `Weekly sync.md`). The rename makes no commit, keeps your cursor and undo history, and only happens for notes you have not named yourself. A **Name follows title** marker above the note lets you keep the current name.
- **Pictures in notes.** An **Insert image** button in the toolbar (choose several files), dragging a picture or note from the file tree into a note, and a size bar when you point at a picture (Small, Medium, Large, Original, written as `![alt|400](path)`). Settings → Vault → **Insert images as** chooses a Markdown link or a short `![[name]]`. A new **Images** tab lists every picture with the notes that show it, and moves unused ones to the trash (restorable from history).
- **A clearer file panel.** One **New** menu (note, meeting note, quick note, folder, project), a filter box, **Collapse all**, **Show the open note**, sort by name or last change, note counts on folders, a lock on projects that are Local AI only, a **Recent** section, a **Projects** section and a breadcrumb above the note (`Project › Folder › Note`, folders can be clicked).

### Changed

- The tree toolbar icons for meeting and quick notes moved into the **New** menu.
- Dropping a picture file into a note and pasting a screenshot now follow the vault's image link style.

## [0.4.0] - 2026-10-13

### Added

- **Standard folders and templates for meetings and quick notes.** A new vault is created with a `Meetings` and a `Quick notes` folder and the templates `Meeting` and `Quick note` in `.vault/templates/`. Two new buttons in the file tree toolbar make a meeting note (asks for a title, named `<date> <title>`) or a quick note (one click, named after the time). The folders can be changed in Settings → Vault, which also has **Add standard folders and templates** for existing vaults. Existing templates are never overwritten.
- **Switch between vaults.** The vault name in the header is now a menu with the recent vaults (the open one is marked), **Open another folder as vault…** and **Create new vault…**. `Ctrl/Cmd+Shift+O` opens it. Switching saves the open note and commits the old vault first.
- **Index pages and easy links.** Right-click a folder (or the empty tree area for the whole vault) → **Create index page**: a note `<Folder> index` with a link to every note in the folder and its sub-folders. Run it again to refresh the list; only the part between the markers is rewritten, so your own text stays. The editor's **Link to a note** button (and `Ctrl/Cmd+Shift+K`) opens a search over all notes in the vault and inserts `[[…]]` (by path when the name exists twice, with the selected text as the visible text, or a link to a new note).
- **`propose_merge` tool for Mimer.** Merging notes is one proposal: the new note plus a deletion of every source note, all or nothing.

### Changed

- Mimer's rules now say how to merge notes and never to ask in the chat whether it may delete: it proposes the deletions on the review screen.
- Earlier answers are sent back to the model together with what Mimer did in that turn (which notes it proposed to create or delete), so "now delete the old ones" refers to the right notes.

### Fixed

- Merging several notes into one often created the new note but not the deletions. Causes found and fixed: no merge instructions in the prompt, the model not knowing in the next message what it had done, and parallel tool calls from some local servers (all numbered 0) being glued into one broken call.
- Two vault opens at the same time (React StrictMode in development) raced on the Git branch and showed "old reference value does not match". The app starts once and the backend opens one vault at a time.

## [0.3.0] - 2026-10-13

### Added

- **Formatting toolbar** above the editor in every pane: bold, italic, strikethrough, inline code, headings 1–3, bullet, numbered and task lists, quote, link, link to a note, table, code block and horizontal line. The tools toggle (a second click removes the formatting), keep the selection, and keep the focus in the editor. Commands are in `features/editor/extensions/formatCommands.ts`.
- **Mimer, the assistant's name and identity.** The assistant is called Mimer in the app (tab, message box, answers). Settings → AI has an editable *base instruction* that says who Mimer is (a notes AI that helps write and structure notes and projects), with a short introduction from Norse mythology that can be edited or removed, and a **Reset to default** button. The safety rules (Mimer only proposes changes, stays inside the project) are fixed and cannot be edited away.
- **Attach notes in chat with `/`.** Type `/` in the message box (or press the paperclip) to find a note, and it becomes a chip above the box. Mimer receives the content of every attached note (up to 5, each cut at 12,000 characters) and works on those. Only notes inside the active project are offered, and the backend checks every path again.
- **Visible progress.** While Mimer works, the answer shows what is happening (waiting for the model, writing with a word count, or "Reading Work/Plan.md…"), the step of a multi-step task ("Step 3 of 15"), a timer, and a hint after 15 s of silence that a local model may be loading. The status bar says "Mimer is working…" and the Mimer tab shows a dot while another tab is open.
- **Import notes from a folder** (File → Import notes from folder…), made for the Markdown output of a OneNote exporter. It previews the folder, copies notes and attachments into one vault folder, never overwrites, cleans names Windows does not allow, reports broken links, can be cancelled, and is one commit after a snapshot commit. A step-by-step guide is in `docs/IMPORT-ONENOTE.md`.
- **Start screen and About.** A start screen with the Mimer picture and the version is shown when the app opens (click or press a key to skip). **File → About Mimer…** (and an About link on the welcome screen) shows the picture, the version, what the app is for, and who made it.
- **New app icon**, in all sizes for Windows, macOS and Linux and as the window favicon. The welcome screen has the Mimer picture as its background.

### Changed

- The right-panel tab "Assistant" is now "Mimer" (the spec said "Assistant"; recorded in `docs/DECISIONS.md`).
- The system prompt is built from the editable base instruction, then the fixed rules, then global and project instructions, then context.
- The chat can show which notes were attached to an earlier message when a saved chat is reopened.

### Fixed

- Bold, italic and the other wrap tools (and `Ctrl+B`/`Ctrl+I`) no longer put the marker across a line break or around spaces: a triple-click selection used to give `**text⏎**`, which is not valid Markdown. The marker now wraps only the text.

## [0.2.0] - 2026-10-13

### Added

- **Chat history and saved prompts:** chats are saved per vault in `.vault/chats/` (not committed to Git) and can be reopened, deleted or cleared from the Assistant's History menu. Reusable prompts are saved in `.vault/prompts.json` (committed) and inserted from the Prompts menu.
- **Templates and daily notes:** `.vault/templates/` holds templates with variables (`{{title}}`, `{{date}}`, `{{date:FORMAT}}` …). New notes from templates, `Ctrl/Cmd+Shift+D` daily notes, Save as template, and a Vault settings tab for folders, date format and daily template.
- **Tabs and split view:** several notes open as tabs (close, middle-click, drag to reorder, `Ctrl/Cmd+W`, `Ctrl/Cmd+PageUp/PageDown`), and a second pane (`Ctrl/Cmd+\`) for side-by-side editing. Tabs are restored per vault.
- **Table editor:** Markdown tables are shown as editable tables when the cursor is outside them, with keyboard navigation, row/column/alignment toolbar, and `Ctrl/Cmd+Alt+T` to insert one. This replaces the v1 rule that tables stay raw text.
- **Export:** notes and folders export to HTML (self-contained, images embedded, raw HTML escaped), Word (`.docx`) and PDF (through the system print dialog from a print preview).
- **Semantic search:** optional meaning-based search with embeddings from LM Studio (or an OpenAI-compatible provider). Search modes Keyword / Meaning / Both, a `semantic_search` tool for the assistant, and a background index in `.vault/embeddings.db` (not committed). Notes in local-only projects are never sent to a cloud embedding provider.
- Start guide for Linux and Windows (`docs/START-GUIDE.md`).
- **Version shown in the app:** the status bar, the welcome screen and Settings → General show the version with SemVer build metadata (`0.2.0+<commit>`, plus `.dirty` for a build with uncommitted changes), so you can tell exactly which build you are testing.
- Component tests for editor tab switching, search modes, vault settings, chat history, saved prompts and the history panel.

### Changed

- Vault open, close, create and remember-last moved from the Tauri command into `vault::session` (tested without a window). Index planning moved into `embeddings::plan_index` (tested).
- The editor's note lifecycle (load, autosave, tab switching, disk changes, keep/load conflict) moved from `Editor.tsx` into `useNoteSession.ts`. The component is now a thin view.
- Search tests moved to `search/tests.rs`.
- Settings saving (`settings::service`), the connection-test message (`providers::connection_report`) and pruning applied proposals (`proposals::forget_applied`) moved out of Tauri commands into tested functions.
- Tests no longer use non-null assertions (`!`); the ESLint exemption for tests was removed.
- `tauri.conf.json` takes its version from `package.json`; a test keeps `Cargo.toml` in step.

### Fixed

- `App.test.tsx` no longer depends on the note saved by an earlier test in the same file.

## [0.1.0] - 2026-10-13

### Added

- **M1 Skeleton:** Tauri 2 + React 19 + TypeScript + Tailwind v4 app shell with three resizable, collapsible columns and a status bar; ESLint, Prettier, Vitest, clippy, rustfmt and `ts-rs` bindings; `pnpm check`; CI workflow.
- **M2 Vault and file tree:** Welcome screen, open/create vault, recent vaults, global settings file; file tree with create, rename, move (drag and drop) and delete; path validation (`vault::paths::resolve`); file watcher that keeps the tree and index current.
- **M3 Editor:** CodeMirror 6 live preview (headings, emphasis, links, task lists, quotes, code blocks, rules, images, tags, wiki-links, collapsed frontmatter), debounced saves (1 s), save status, external change handling with a conflict banner.
- **M4 Git history:** local Git repository per vault, all commit triggers (save, switch, idle, close, snapshots), history panel with diff and restore, recovery of deleted notes, no empty commits, no destructive Git operations.
- **M5 Links, tags, attachments:** wiki-links with autocomplete and navigation, backlinks panel, tags, rename/move with automatic link updates in one commit, paste and drag-and-drop attachments.
- **M6 Search:** SQLite FTS5 index with `tag:` and `path:` filters, ranked results with highlighted snippets, search panel, quick open, test-vault generator (`scripts/gen-vault.mjs`).
- **M7 Settings and chat:** settings dialog, OS keychain for API keys, LM Studio provider with model listing and connection test, streaming chat with stop button and prompt assembly with context budgeting.
- **M8 Inline commands:** `Mod+K` popup with fix spelling, rewrite, shorten, expand, restructure and custom commands, diff review, accept/retry/reject with snapshot and commit.
- **M9 Projects:** folder projects with instructions, provider and local-only lock, no nesting, active project detection, AI-assisted instruction editing with diff, router enforcement of the local-only rule in the backend.
- **M10 Agent and proposals:** search/read/list tools, propose edit/create/move/delete tools, agent loop (max 15 iterations), per-file proposal review, change detection, apply with snapshot and a single commit.
- **M11 Cloud providers:** OpenAI-compatible and Anthropic providers (streaming, tools), API keys in the keychain.
- **M12 Packaging:** release workflow for Windows (per-user NSIS installer), macOS (`.dmg`) and Linux (`.AppImage`, `.rpm`); README with install and usage instructions and the full manual test checklist.
