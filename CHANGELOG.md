# Changelog

All notable changes to this project are documented in this file.
The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

This list is kept short: it tells what Mimer can do in each version. A small release that only fixed the one before it is folded into the last version of its series (for example 0.8.0 to 0.8.10 is one entry), and something that was removed and later came back is described only where it is in the app now.

## [Unreleased]

## [0.21.0] - 2026-10-31

### Added

- **Your own tags.** **···** → **Tags…** on a note has **Mimer uses these** (Meeting, Epic and Pinned, each with what it does) and **Your tags**: add any word, take it off again, or click a tag you already use on another note. Above the note Mimer's tags are filled and yours are outlined with a `#`. **Search** lists the two kinds in two groups, and a click searches for `tag:name`. The AI never adds or takes away Meeting, Epic or Pinned.

### Changed

- **Meetings: one text for the notes, and parts you choose.** You write the notes in one text all through the meeting and can always read them; the agenda is a checklist beside it. **Agenda**, **Decisions** and **Actions** (tasks that also show in Tasks) are options, off until you tick them when you make the meeting, in the meeting, or under **Change…**. Older meetings keep their notes and have all three parts.
- **Pick a time from a list** of every quarter of an hour, or type it as before.

### Fixed

- A click in a box in a window opened from the editor toolbar (Tags…, Rename…) now focuses the box.

## [0.20.0] - 2026-10-30

### Added

- **Two editions: Preview and Stable.** Mimer is now **Preview** (0.x and later `1.x.y-preview.N`): the newest features, changing often. **Stable** (v1.0.0 and later) is the finished release and is not out yet; until it is, the 0.x releases are the ones in the Microsoft Store.
- **Help → Check for new version…** opens the releases page in your browser. Mimer never looks for updates by itself and sends nothing.
- **A website** with what Mimer is, the two editions and where to download them.
- **Eight themes.** **Settings → General → Theme**: Light, Dark, Slate, Paper, Mint, Midnight, Graphite and Ember, shown live, or follow the computer's Light or Dark.
- **Markdown in the boxes where you write more than a line** (the note of a task, an epic and an idea, a task's log, a meeting's notes, a quick note): bold, lists, Tab and Ctrl+B / Ctrl+I work as in a note.
- **Focus** has a **Timer** you can turn off, any length (15, 25, 45, 60 or 1–180 minutes), and **Ultra focus**: only the task you work on, with its steps and log.
- **AI instructions made clear.** **Settings → AI** has **About me and my notes** and **Language of the AI's answers**; a project has **About this project**. The fixed commands (Fix, Rewrite, Shorten…) no longer read these texts.

### Changed

- **Meetings** show the time on every meeting, and **Next meeting** on the start page lists today's and tomorrow's meetings with Start.
- **With no note open, Files shows a Notes page** with the recent notes and every note, and a box to narrow the list.

### Fixed

- The AI no longer leaves "Here's the revised version:" or "Let me know if you want changes" around its answers, also in Danish.

## [0.19.0] - 2026-10-28

### Added

- **A start page you build yourself.** The house at the top of the left edge opens it, and it shows when no note is open. **Customize** adds, removes, moves and widens widgets (Continue, Recent, Pinned, Write it down, Search and ask, Next meeting, Working on, To sort, Areas, Changed since yesterday, Epic progress). The layout is kept per computer; **Settings → General → Open the start page when Mimer starts** is off by default.
- **Pin a note** from its **···** menu; it is listed under Pinned.
- **A Meetings area** (the calendar clock at the left edge): a calendar with a dot on the days with a meeting, then Today, Upcoming, Past and No date. A meeting shows its agenda, its tasks and its notes, with **Start meeting**, **Prepare next…**, **Change…**, **Delete** and **Open the note**. A meeting is a note with the tag Meeting.
- **One box per kind of thing written down:** Quick note, New task and New idea each open only their own box. **Ctrl/Cmd+Shift+N** asks first. In a meeting, in Focus and on the start page, **+ Task**, **+ Idea** and **+ Quick note** keep the box open for the next one.
- **Tab and Shift+Tab** move a list item in or out, also in the boxes outside the editor.
- **Status on a task row** (Doing, Waiting, Dropped) as a small label.
- **Time format** in **Settings → General**: System, 24-hour or 12-hour. A time can be typed as `14:30`, `1430` or `2:30 pm`.
- **A UX guide** (`docs/UX-GUIDE.md`) with the design system every screen follows.

### Changed

- **Foundry Local asks before downloading the hardware parts:** **Download and find my hardware**, or **Use only the processor**, which downloads nothing.

### Fixed

- A new meeting is for today unless another day is picked.
- Mermaid diagrams are also drawn from a fenced block with no language that starts with `graph TD`, `sequenceDiagram` and the like.

### Removed

- Your own templates (**From a template…**, **Save the note as a template…**). Meeting, quick and daily notes still start from their templates in `.vault/templates/`.

## [0.18.0] - 2026-10-27

### Added

- **A note for a task.** The task page has **Linked note**: **Link a note…** or **Make a note for this task**. The link is a `[[wiki-link]]` in the task's own line, so it works in any editor and follows a rename.
- **Tags on a note: Meeting and Epic.** The **···** menu above a note (Rename, History, Tags, Export) has **Tags…**; the tag is written in the note's properties. A note tagged Meeting gets **Start meeting**; a note tagged Epic is listed with your epics.

### Changed

- **The tag decides what is an epic.** A note without the tag only keeps its `- [ ]` lines under **Tasks in other notes**, each with **Make an epic**.
- **The agenda of a meeting note is not tasks.**

### Fixed

- Adding an item to a meeting that had no agenda now works.

## [0.17.0] - 2026-10-26

### Added

- **Choose the epic of a task** with **Into** in the write-it-down box (the epic of the meeting, the one used last, any other, or **+ New epic…**).
- **Pencil and waste bin** on epics, tasks and steps. Deleting an epic or a task asks first; a step is deleted at once with **Undo**.

### Changed

- "Epic task" is now just **Epic**.
- **Prepare next meeting…** carries over the agenda items that were not reached.

## [0.16.0] - 2026-10-26

### Added

- **Meetings.** **New → Meeting note…** asks for a title, a day and time, who is with you and an agenda (all optional) and saves an ordinary Markdown note. **Start** opens the meeting screen with the agenda, the notes and the write-it-down box. The next meeting shows at the top of Landing. **Prepare next meeting…** fills in the window for the next one.
- **Right-click on selected text** shows Cut, Copy, Paste and Select all, then **AI ›** and Add as a task or idea.
- **A Beta mark on the AI**, and a first-start notice saying the AI is a first version.
- **Focus** can add a step under any task and move tasks and steps.

### Changed

- **Focus is one button, on the epic.**
- **Quick note** opens the write-it-down box and saves in Quick notes without moving you away.
- **Settings has one AI tab:** the choice of AI, then the folded sections for the built-in AI and for LM Studio and other providers.

### Removed

- **New note from a starter** (Meeting, Status update, Reply to an e-mail, Idea).

## [0.15.1] - 2026-10-24

### Added

- **Every Foundry Local model** it can run on this computer, each with what it is good for, size and licence, with search and filters. A model without tools can be used for text commands and the chat about the open note.
- **Which AI Mimer uses**, as one list at the top of Settings → AI, in the order that suits where Mimer runs, with its state and a button to where it is set up.
- **Cloud AI as a last resort.** Mimer says what is sent and that it is your responsibility, and uses it only after you tick "I understand". The status bar shows **Cloud AI** while it is on.
- **Local AI only** for a project: its notes never go to a cloud AI.
- **"AI can make mistakes. Check the answer before you keep it."** under the chat and in every review.

### Fixed

- Translate no longer keeps the text in Danish.
- Some Foundry Local models (such as SmolLM3) no longer fail with "Unknown method: replace".

## [0.14.1] - 2026-10-24

### Added

- **Focus on a whole epic.** Every task of the epic is one outline; the task you work on is open and marked (its status becomes Doing) with its steps and a box for what has happened, which goes into the log with today's date.
- **Your own order for epics, tasks and steps** with the arrows or **Alt+↑** / **Alt+↓**.
- **Phi Silica on Copilot+ PCs** (Microsoft Store version): the small model built into Windows runs on the neural processor with nothing to download. Settings → Built-in AI explains what Windows says about access, the PC and the model.
- Change a step's text on the task page.

### Fixed

- Focus: the buttons under the timer no longer run out of the window.
- Phi Silica's "the package lacks a permission" message.
- Renaming a task no longer removes its `made:` date.

## [0.13.0] - 2026-10-21

### Added

- **AI in every text box.** Select text in any box and a small bar offers Fix, Rewrite, Shorten and more; **Ctrl+K** works on the selection or all the text.
- **A note on a task and on an epic**, kept as plain text in the note, and **edit and delete a line in "What has happened"**.
- **Trace my work** (Settings → General, off by default; can also be chosen when you make a vault): one line a day for each note you write in and each task you make, work on or finish, under "Worked on" in today's daily note.
- **Let the AI check its own answer** (Settings → AI, off by default).

### Changed

- **New licence: AGPL-3.0** (was Apache-2.0). Mimer stays free for everyone, also companies; if you share your own version you must share it with its source under the same licence.
- **Tasks are an outline of epics, tasks and steps.** Every epic folds to one line with its progress, and finished epics are folded together under **Done**. There are no due dates and no Today: every task gets the day it was made (`made:2026-10-21`).
- **A task page in two columns**, and a task's file that reads well in any editor (the log as dated list items).
- **A calmer, more consistent look:** no "Back to notes" buttons, panels that follow what is on screen, one name for each thing, and a layout that fits a narrow window.
- **Names Windows cannot keep are refused** when you make or rename a folder, note or project (a dot at the end, `CON`, `NUL`, and the characters `\ / : * ? " < > |`).

### Fixed

- Thinking out loud and lead-ins like "Revised text:" are removed from the AI's answers.
- An answer that would delete the text is never offered as a replacement.
- A sleeping built-in AI is woken by the text commands too.

## [0.12.0] - 2026-10-20

### Added

- **Epics.** An epic is a note with tasks in it, shown as a box with progress ("2 of 4") that can be folded. A task made from another note goes into an epic of its own; **Suggest steps from the note** lets the AI propose steps you choose from.
- **Landing.** Meetings, Quick notes and Tasks are kept together above the projects. New notes there have a NEW mark for a week.
- **Daily notes on a calendar** at the top of the Files panel.
- **Mermaid diagrams** are drawn from a fenced `mermaid` block.
- **Tag suggestions** when you type `#`, and the tags of the note in the Outline panel.

### Changed

- The Tasks panel lists the epics. Folding an epic replaces the old filters.

## [0.11.0] - 2026-10-19

### Added

- **Tasks.** A task is a checklist line in any note (`- [ ] Renew the licence`). Mimer reads them in every note and shows one list (Ctrl/Cmd+Shift+T). A task has a status, steps, and a log of dated lines; **Break it down** lets the local AI propose steps you choose from. Everything is written back as plain Markdown.
- **Focus on a task:** one step at a time, a timer, **Help me start** (the AI suggests one tiny first step) and a box to park a thought.
- **Ideas**, an area of their own (the light bulb at the left edge): a dated line you can turn into a task or a note, archive and bring back.
- **Write it down** (Ctrl/Cmd+Shift+N): one box for a task, an idea or a note.
- **AI where you work, with fixed commands instead of a chat to type into:**
  - Selected text: Fix, Rewrite and Shorten, and more under **AI ▾** (simpler words, more formal, friendlier, a list, translate, **Explain this**, **Find tasks in it**). A rewrite shows whether its numbers, links, addresses and tags are all still there.
  - The whole note: an **AI** button with fix spelling, tidy the structure, a short summary, a title and tags, find tasks, split into notes and an e-mail from the note.
  - **Search** shows **Answer from my notes** when the search reads like a question.
  - **Spelling help** for dyslexia, which marks misspelt words (also in Danish) and never changes anything by itself.
- **Everything else works without an AI.** Every AI button is greyed out and says why.
- **The right side is a narrow row of icons:** Outline, Links (with *Maybe related* notes), History and Images.
- **Make an index page** for a folder (right-click) without AI.

### Changed

- **The chat is only a chat.** It reads and searches your notes but can no longer change them, and opens as a window (Ctrl/Cmd+L) instead of a column.
- **The menus are File, Go and Help**, and every menu, panel and page has one look.

### Fixed

- Pictures survive moving a note, and tabs with the same name show their folder.
- The start screen is a small window of its own, and the app opens at the size and place it had.
- New app icon and start picture.

## [0.10.2] - 2026-10-18

### Added

- **Skills.** A skill is a job Mimer carries out itself, note by note, so it works with small local models. Mimer finds the notes, asks the model for one step at a time and builds the proposals itself; you review every change before anything is written. Kinds: rewrite each note, sort notes into folders, write one new note, or answer in the chat. Eleven come with Mimer (fix spelling and grammar, improve the structure, sort into folders, summarise…).
- **Right-click a note or folder → AI** runs a fitting skill at once.
- **Mimer checks every change** (links, tags, numbers and dates, names, properties, code), and a change that fails a check is shown but not selected, with the reason. **Fix small mistakes** only sends back "wrong => right" for the words to fix. Long runs start with three notes, then ask **Looks good, do the other N**.
- **A local AI must be running** before a skill starts (a built-in AI awake, or LM Studio answering); otherwise a message says what to start.
- **A new look for working with the AI:** an AI chip in the status bar, a **Review changes** screen with filters, group accept and **Undo**, a command palette (Ctrl/Cmd+Shift+P), a left icon bar, a bar over selected text, and a short welcome when there is no AI yet.

### Fixed

- Stop during a skill no longer proposes half an answer, and a skill started with nothing chosen does not run on the whole vault.
- The Windows build of 0.10.0 failed because two file names differed only in upper and lower case; use 0.10.2.

## [0.9.4] - 2026-10-16

### Added

- **Foundry Local as a built-in AI.** Settings → Built-in AI asks which engine should run the AI on this computer: **Foundry Local** (Microsoft's runtime, which picks the best hardware by itself, including a neural processor, and offers Qwen, Phi and Gemma) or **llama.cpp**. It runs in a helper process, so a fault cannot take Mimer down. It is the only built-in engine in the Microsoft Store version. Windows 11 24H2 or later is needed on Windows.
- **Find my hardware** downloads the hardware parts (no model) and reads the model list again, so NPU and graphics models are listed.

### Changed

- **Settings → AI providers** lists the built-in AI as one entry, whichever engine it uses.

## [0.8.10] - 2026-10-16

### Added

- **A built-in AI: Mimer without LM Studio.** **Settings → Built-in AI**: choose your processor and graphics card, pick a model (Gemma 4 12B recommended) and press **Download**. Mimer downloads llama.cpp's `llama-server` and the model, checks them against fixed checksums, and keeps them in its own folder. The engine is chosen from the graphics card (Vulkan, CUDA, ROCm, SYCL or CPU only). You can add your own `.gguf` file.
- **Wake Mimer / Sleep Mimer.** Wake loads the model into memory; Sleep unloads it. The message box is locked until Mimer is awake, and Mimer can sleep by itself after idle minutes. The engine never outlives Mimer, listens on `127.0.0.1` only, and the uninstaller (Windows) or **Remove files** (Linux) deletes it.
- **Clear problems.** When something fails (memory, a driver, a missing runtime, a busy port, a damaged model, a failed download) Mimer says what happened, gives numbered steps, and has the engine's last lines under **Show details**.
- **Settings for the built-in AI:** context size, graphics card use, threads, flash attention, thinking and sleep after idle time.
- **Add provider asks which kind first,** and every kind of provider explains what to do. **Switch AI and model in the tab** from a menu.
- **A Microsoft Store package** (MSIX), with a privacy policy (`PRIVACY.md`) and a **Report inappropriate AI content** link, which the Store requires. The Store version is called **Mimer: Markdown Notes** and uses Foundry Local; llama.cpp cannot be downloaded there.
- **Markdown source view** (**Ctrl/Cmd+Alt+M**), and **Report a bug** and **Suggest a feature** in the File menu with the version and system filled in.
- **The new app icon** (the gold M on a dark tile).

### Changed

- **A project is always a new folder in the vault root.** **New → Project…** asks for a name and makes both at once.
- **Pictures are listed in the Images tab only,** not in the file tree.
- **Settings → Built-in AI explains the download** before you press the button.

### Fixed

- Links did nothing in the Linux AppImage; Mimer now opens them itself.
- Sorting a big folder (for example a OneNote import) no longer goes in circles.
- Web links in notes and the report button no longer say "not allowed to open".

## [0.7.1] - 2026-10-15

### Added

- **A beta mark** in the status bar, the start screen, About, Settings and the window title. GitHub releases are marked as pre-releases.

### Changed

- **A new note is named the same way everywhere:** one small window asks for the name. A name that is taken is explained while you type, and a move onto a taken name stops with a window you have to close.

### Fixed

- Two things could have the same name in one folder (`Docs` and `docs`, or a note `Work` next to a folder `Work`), and two projects could have the same name; both are now refused, in the backend as well, so a vault works the same on Linux and Windows.
- Release builds showed the editor without its styling.
- A vault that was deleted, renamed or moved on disk is marked "Folder not found" and can be removed from the list or located again.

## [0.6.0] - 2026-10-14

### Added

- **Attach a note or a whole folder** to a message with `/` (the first 40 notes of a folder).
- **My own order** in the file panel: drag a note or folder, or use **Alt+Up / Alt+Down**; the order is saved in `.vault/order.json`.
- **Select several files and folders** with Ctrl/Cmd+click and Shift+click, then move or delete them together.
- **Reuse a picture** from the Images tab with **Insert in note** or by dragging, and look closer by clicking a picture.

### Changed

- **Projects have their own tree** under **Projects**, with a **+** button, project settings and drag and drop; links work across the project border.
- **The attachments folder is not listed in All files;** pictures are in the Images tab.
- **Recent** shows 4 notes by default, and the number is a setting.

## [0.5.0] - 2026-10-13

### Added

- **A how-to guide** (**?**, **F1**) with a search box, and small **?** hints next to settings and tools.
- **A new note is named by its title:** type `# Weekly sync` and the file becomes `Weekly sync.md` a moment after you pause.
- **Pictures in notes:** an **Insert image** button, dragging a picture in, a size bar (Small, Medium, Large, Original), and an **Images** tab with every picture and the notes that show it.
- **A clearer file panel:** one **New** menu, a filter box, **Collapse all**, sort by name or last change, note counts, a **Recent** section and a breadcrumb above the note.

## [0.4.0] - 2026-10-13

### Added

- **Meeting and quick notes.** A new vault has a `Meetings` and a `Quick notes` folder with their templates; two buttons make a meeting note or a quick note. **Settings → Vault** changes the folders and can add them to an existing vault.
- **Switch between vaults** from the vault name in the header (**Ctrl/Cmd+Shift+O**), with recent vaults, open another folder and create a new vault.
- **Index pages:** right-click a folder → **Create index page**, a note with a link to every note in it. Run it again to refresh it; your own text stays.
- **Link to a note** (**Ctrl/Cmd+Shift+K**) searches the whole vault and inserts `[[…]]`.
- **Merging notes** is one proposal: the new note plus the deletion of the source notes, all or nothing.

## [0.3.0] - 2026-10-13

### Added

- **A formatting toolbar** above the editor: bold, italic, strikethrough, code, headings, lists, quote, links, table, code block and line. The tools toggle and keep the selection.
- **The AI is called Mimer.** Attach notes to a message with `/`; the answer shows what is happening (waiting, writing, "Reading Work/Plan.md…", the step of a longer task).
- **Import notes from a folder** (File → Import notes from folder…), made for the Markdown output of a OneNote exporter. It previews, never overwrites, cleans names Windows does not allow, reports broken links and can be cancelled (`docs/IMPORT-ONENOTE.md`).
- **A start screen and About**, with the Mimer picture and the version.

### Fixed

- Bold, italic and the other wrap tools no longer put the marker across a line break or around spaces.

## [0.2.0] - 2026-10-13

### Added

- **Chat history** per vault (not committed to Git).
- **Daily notes** (`Ctrl/Cmd+Shift+D`) from a template, and a Vault settings tab for folders and date format.
- **Tabs and a split view:** several notes as tabs, a second pane (`Ctrl/Cmd+\`), and tabs restored per vault.
- **A table editor:** Markdown tables are editable tables when the cursor is outside them.
- **Export** of a note or folder to HTML, Word (`.docx`) and PDF.
- **Semantic search:** optional search by meaning with embeddings from LM Studio, in modes Keyword, Meaning and Both.
- **The version is shown in the app** (status bar, welcome screen, Settings) with the commit, so you can tell exactly which build you are testing.
- A start guide for Linux and Windows (`docs/START-GUIDE.md`).

## [0.1.0] - 2026-10-13

### Added

- **The first version:** a three-column app with a vault and a file tree (create, rename, move, delete, a file watcher), a live-preview Markdown editor with saves and conflict handling, a local Git history of every change (restore a version, recover a deleted note), wiki-links, backlinks and tags with automatic link updates on rename, attachments, full-text search (`tag:` and `path:`), settings, an LM Studio chat with streaming, inline AI commands with a diff review, projects with their own instructions, an agent that proposes edits, creations, moves and deletes for you to review and apply, and installers for Windows, Linux and macOS.
