# Changelog

All notable changes to this project are documented in this file.
The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Fixed

- **The AI no longer leaves "Here’s the revised version:" in front of its answer.** The clean-up knew the line with a straight apostrophe only, and a skill that rewrites whole notes did not clean at all. Both now remove such an opening (also after "Sure!", and in Danish), a closing line such as "Let me know if you want changes", reasoning and a code fence, and the instruction to the model says it plainly. A note that itself begins like that keeps its first line.

### Added

- **Markdown in the boxes where you write more than a line.** The note of a task, an epic and an idea, the log of a task, the notes in a meeting and the text of a quick note are now the note editor in a small box: `**bold**` shows as bold when the cursor leaves the line, lists, Tab and Ctrl+B / Ctrl+I work as in a note. What was saved is shown formatted (the task and its log in Focus, the notes on the meeting page). A log line stays one line, because that is how it is kept in the file.

### Changed

- **How the app is built and changed** (no change to what it does): the areas of the app are mapped in `docs/AREAS.md`, each area has its rules in a `CLAUDE.md`, a change starts from a brief (`docs/BRIEF.md`) with a change plan and ends with a change report (`pnpm areas report`), and every button, field, box and choice on a screen comes from the shared components (lint checks it). The four selects and the settings text box that had their own look now look like every other one.

## [0.19.0] - 2026-10-28

### Added

- **A start page you build yourself.** The house at the top of the left edge opens it, and it shows when no note is open; the side panels are hidden while it is shown. It starts with **Continue** (the last note, with its first lines), **Recent** (with filters for notes, meetings and epics) and **Pinned**. **Customize** adds, removes, moves (arrows) and widens (Half or Full) widgets, and **Reset** goes back. Twelve widgets: Continue, Recent, Pinned, Write it down, Search and ask (Ask AI only when an AI is on), Next meeting, Today's meetings, Working on, To sort, Areas, Changed since yesterday and Epic progress. **New** is a menu: Note, Meeting, Quick note, Task and Idea. The layout is kept per computer, and **Settings → General → Open the start page when Mimer starts** is off by default.
- **Pin a note** from its **···** menu (**Pin to the start page**); it gets the tag `pinned` and is listed under Pinned.
- **A Meetings area**, next to Tasks (the calendar clock at the left edge): a calendar with a dot on the days with a meeting, then Today, Upcoming, Past and No date; a day picked in the calendar shows only that day. The chosen meeting is shown in the middle with its agenda (ticking an item writes it in the note), the tasks from the note and what was written under each item, and **Start meeting**, **Prepare next…**, **Change…** (day, time and people), **Delete** and **Open the note**. A meeting is a note with the tag Meeting, so nothing new is stored. The Landing meeting line follows the tag and the date too.
- **One box per kind of thing written down.** New → Quick note, Task and Idea (start page, File, the command palette) open only that box, named **Quick note**, **New task** or **New idea**, with its own save button; a task chooses its epic under **Into**. **Ctrl/Cmd+Shift+N** (**File → Write it down…**) asks first, with the letters T, I and N. In a meeting, in Focus and on the start page there are three buttons, **+ Task**, **+ Idea** and **+ Quick note**, and the box stays open for the next one. After saving, the message has **Open**.
- **Tab and Shift+Tab** move a list item (bullet, numbered or task) one level in or out, and every line of a selection; with the caret after text on a plain line, Tab puts a tab there. **Enter** on an empty nested item takes it out one level. The same keys work in the boxes where notes are written outside the editor (the meeting screen, the notes of tasks, epics and ideas, the write-it-down boxes).
- **Status on a task row**: Doing, Waiting or Dropped as a small label at the right end of the row. Setting the status is unchanged.
- **Time format** in **Settings → General**: System, 24-hour (`14:30`) or 12-hour (`2:30 PM`), per computer. A meeting's time is typed that way (`14:30`, `1430` and `2:30 pm` are all understood), and a time that cannot be read is not saved.
- **A UX guide** in `docs/UX-GUIDE.md` with the design system in `docs/design-system/`: the rules, colours, type, spacing and components every screen follows.

### Changed

- **Foundry Local asks before downloading the hardware parts.** The first time, no model list is shown: **Download and find my hardware** fetches the parts from Microsoft and then lists what the graphics card or neural processor can run; **Use only the processor** downloads nothing and lists the processor's models. Downloading a model or waking it no longer fetches the hardware parts by itself. The choice is kept on the computer; **Remove all** asks again.
- The month calendar is one component, shared by the daily notes in Files and by Meetings.

### Fixed

- **A new meeting is for today** unless another day is picked (before, a meeting made without picking a day had no date and was listed under No date).
- **Mermaid:** a fenced block with no language whose first line starts a diagram (`graph TD`, `sequenceDiagram`, …) is drawn too.

### Removed

- **The button "Make the notes in Tasks epics"** (it was only for the upgrade to 0.18.0). **Make an epic** on each note stays.
- **Your own templates:** **From a template…**, **File → Save the note as a template…** and **Start from** in **Make a note for this task**, with the command that saved a template. Meeting, quick and daily notes still start from their templates in `.vault/templates/`, and the daily template can still be chosen in Settings → Vault.

## [0.18.0] - 2026-10-27

### Added

- **A note for a task.** The task page has **Linked note**: **Link a note…** picks a note you have, **Make a note for this task** makes one (name, folder and an optional template) with a line in it that points back at the task. The link is a `[[wiki-link]]` in the task's own line (`- [ ] Send the offer [[Offer to Acme]] made:…`), so it works in any editor, shows in backlinks and follows a rename. The task list, Focus and the task page show a small chip with the note's name; a click opens the note. **Unlink** only takes the link off the task. A note that is gone shows as "Note missing" and can be made again.
- **Tags on a note: Meeting and Epic.** The new **···** menu above a note (Rename, History, Tags, Export) has **Tags…**, a short list; ticking one writes it in the properties of the note (`tags: [meeting]`) and the note stays where it is. A tag the note has shows as a chip with a cross that takes it off. A note tagged Meeting gets **Start meeting** wherever it is; a note tagged Epic is listed with your epics. You can also write `tags: [epic]` yourself.

### Changed

- **The tag decides what is an epic.** A note is an epic only when it has the tag `epic`, wherever it is; **New epic** and the Inbox make their notes with the tag. A note without it is only a note: its `- [ ]` lines are kept under **Tasks in other notes** (folded, in **Show all tasks**), each with **Make an epic** (adds the tag). Notes already in the Tasks folder from before have no tag: **Make the notes in Tasks epics** tags them all at once (this button is only for this upgrade and is removed in the next release).
- **Start meeting** shows above a note tagged `meeting` only (the notes Mimer makes for a meeting have the tag).
- **The agenda of a meeting note is not tasks**, so a meeting no longer makes an epic by itself.

### Fixed

- **Add an item to a meeting without an agenda** now works: the note gets an `## Agenda` with the item, and it is listed in the meeting screen. Before, only the heading in the middle changed.
- A meeting without an agenda no longer writes a second **Notes** heading under **Notes**; the text goes straight under it.

## [0.17.0] - 2026-10-26

### Added

- **Choose the epic of a task.** The write-it-down box has **Into** for a task: the epic of the meeting, the epic in Focus, or the one used last, any other epic, or **+ New epic…**. Making a task from an idea asks the same. Mimer no longer makes an Inbox epic by itself.
- **Pencil and waste bin** on epics, tasks and steps (shown when the pointer is over the row or the focus is in it). Titles are no longer text fields. Deleting an epic or a task asks first; a step is deleted at once with **Undo**. An epic is renamed by its heading; the note keeps its file name.

### Changed

- **"Epic task" is now just "Epic"** in the app and the documentation.
- **Meetings are simpler:** the Decision / Action / Question / Park it buttons and **Add actions to Tasks…** are gone. **Prepare next meeting…** is a button next to **Start meeting** and carries over the agenda items that were not reached.

## [0.16.0] - 2026-10-26

### Added

- **Meetings.** **New → Meeting note…** (also under File) asks for a title, a day and time, who is with you and an agenda, all optional, and saves an ordinary Markdown note in Meetings. **Start** opens the meeting screen: the agenda on the left, one item at a time with its notes in the middle, buttons that mark a line as a Decision, Action, Question or Parked, **Next item**, and the write-it-down box on the right. Everything is written into the note as you go. The next meeting of today or tomorrow shows as one line at the top of Landing with **Start**; **Start meeting** also shows above notes in the Meetings folder.
- **After a meeting.** **Add actions to Tasks…** (in the meeting screen, and in the small menu next to **Start meeting**) puts the lines marked Action into an epic task, by default one for the meeting; added lines are marked "(in Tasks)" so they are not added twice. **Prepare next meeting…** opens the meeting window filled in from the last one: the same title, people and time a week later, and the agenda items not reached plus actions not yet in Tasks as "Follow up". Neither uses AI.
- **Right-click on selected text** shows Cut, Copy, Paste and Select all first, then **AI ›** and Add as a task or idea.
- **Beta mark on the AI.** A small **Beta** by the editor AI button, the chat title and the AI tab in Settings, a note at the top of Settings → AI, and a first-start notice that says this is a first version and that the AI is beta (Help → About the AI beta… shows it again).
- **Focus** can add a step under any task and move tasks and steps up and down, like the task list.

### Changed

- **Focus is one button, on the epic task** (in its heading in the task list and at the top of its page). It is gone from the task rows, the task page and the left panel. In Focus every task is open and any task can be folded, also the one worked on.
- **Quick note** opens the write-it-down box on Note, with an optional name, and saves in Quick notes without moving you away from what you are doing. Ctrl+Shift+N opens the same box.
- **New and File have the same list**: Note, From a template, Meeting note, Quick note and Today's daily note. "Write something down" is now "Capture a task, idea or note".
- **Settings has one AI tab** instead of three: the choice of AI, then the folded sections Built-in AI: set up and More: LM Studio and other providers.
- The editor's AI button says **AI for this note** when there is room.

### Removed

- **New note from a starter** (Meeting, Status update, Reply to an e-mail and Idea), in New, File, the command palette and the empty editor screen.
- Search and Quick open from the `···` menu and toolbar in Files; they are in the left rail and have shortcuts.

## [0.15.1] - 2026-10-24

### Added

- **"AI can make mistakes. Check the answer before you keep it."** under the chat, in the review of a text command and in the review of proposed changes.

### Fixed

- **Some Foundry Local models (for example SmolLM3) failed with "Unknown method: replace".** Their chat template cannot take a system message in Foundry Local. Mimer now asks once more with the instructions in the question; other models and other errors are not affected. No empty system message is sent any more.

## [0.15.0] - 2026-10-24

### Added

- **Every Foundry Local model.** The Foundry Local list now has every chat model it can run on this computer, not only those with tools, each with what it is good for, its maker, size, where it runs, how much text it reads and its licence. Search and filter it (writing, reasoning, code, tools, downloaded, hardware, size), sort it, or open Microsoft's list of all models. A model without tools can be used for text commands and the chat about the open note.
- **Which AI Mimer uses**, as one list at the top of Settings → AI, in the order that suits where Mimer runs (Store version on a Copilot+ PC: Phi Silica, Foundry Local, LM Studio; Windows installer and Linux: llama.cpp first), each with its state here, and a button to where it is set up.
- **Cloud AI as a last resort.** An OpenAI-compatible cloud service can be Mimer's AI when nothing on the computer is good enough. Mimer first says what is sent and that it is the user's responsibility, and it is only used after "I understand" is ticked. While it is on, the status bar shows **Cloud AI** and the chat says in orange where the notes go. Choosing another AI turns it off.
- **Local AI only** for a project: its notes never go to a cloud AI.

### Fixed

- **Translate kept the text in Danish** (most of all with Phi Silica): text commands and skills were also told to "answer in the language of the text". Now the language the task asks for wins. Phi Silica gets one short prompt with the task first and the text last.

## [0.14.1] - 2026-10-24

### Fixed

- **Focus: the buttons under the timer ran out of the window.** "Done, next step" now has its own line, with the timer and Help me start under it.
- **Phi Silica said "the package lacks a permission" (CapabilityMissing).** The Store package now declares that it is tested with a Windows version new enough for Windows to grant the `systemAIModels` permission.

## [0.14.0] - 2026-10-23

### Added

- **Focus on a whole epic task.** Focus shows every task of the epic as one outline. The task you work on is open and marked (its status becomes Doing), with its note, its steps (the next one marked **Now**) and a box to write what has happened, which goes into the log with today's date. Unfold any other task to read it or tick a step, **Work on this** moves the mark, and **Fold the rest** folds them again. After the last step Focus asks if the task is done, then moves on to the next open task; when the epic is done it says so.
- **Your own order for epics, tasks and steps.** Hold the mouse over one and use the arrows, or press **Alt+↑** / **Alt+↓**. A task moves with its steps, note and log, in the note itself. The Inbox stays at the top; the order of the epics is kept in `.vault/order.json`.
- **Change a step's text** right on the task page (Enter saves, Esc puts it back).

- **Phi Silica on Copilot+ PCs** (Microsoft Store version only). Settings → Built-in AI has a third choice, **Windows AI · Phi Silica**: the small model built into Windows, running on the neural processor, with nothing to download in Mimer. **Phi Silica on this PC** shows what Windows says about the access, the PC and the model, in plain words with Windows' own answer for a bug report; **Ask Windows to get it** fetches the model, **Test Phi Silica** sends a test sentence, and **Use Phi Silica for my notes** makes Mimer use it. It cannot call tools, so skills and vault search in the chat are not available with it. Outside the Store version nothing changes.

### Fixed

- Renaming a task no longer removes its `made:` date.

## [0.13.0] - 2026-10-21

### Added

- **Edit and delete a line in "What has happened".** Hold the mouse over a log line: a pencil changes its text and date, a bin deletes it (it asks first; History of the note has it).
- **A note on a task and on an epic task.** The task page and the epic page have a **Note** box, kept in the note as plain text (indented quote lines under the task, and text under the heading of an epic). The note in the "write it down" box becomes the task's note.
- **Easier to see on a task:** *Epic task: …* and *Open the note* are now two clear buttons under the title.
- **AI in every text box.** Select text in any box (a log line, a step, a task title, an idea) and a small bar offers Fix, Rewrite, Shorten and more; **Ctrl+K** works on the selection or on all the text. The same commands and the same review as in a note, including Translate. Passwords, search and name boxes are left out.
- **Trace my work can be chosen when you make a vault.** The "Create new vault" box has a checkbox for it (off by default). It is the same setting as in Settings → General, so it can be changed there.
- **Trace my work** (Settings → General, off by default). Mimer writes one line a day for each note you write in and each task you make, work on or finish, under "Worked on" in today's daily note. A task line ends with a link to the note (epic task) the task is in. You can edit the lines and write there yourself.
- **Let the AI check its own answer** (Settings → AI, off by default). A second question to the AI before a text command's answer is shown; it takes longer.

### Changed

- **New licence: AGPL-3.0** (was Apache-2.0). Mimer stays free for everyone, also companies. If you share your own version of the code you must keep the notice, say where it is from and share it with its source under the same licence. Versions up to 0.12.0 stay under Apache-2.0.
- **Help, About and the documentation are up to date**: menu names (Help → Report…, Go → Show Markdown source), the chat window instead of the old tabs, task notes and log editing, AI in text boxes, and the README with new pictures. The manual test checklist is rewritten for 1.0.
- **Releases**: a 0.x tag (or one with `-`, such as `v1.1.0-rc1`) is a pre-release; `v1.0.0` and later are normal releases. CI only reads the code and cancels a run that a newer push replaced.
- **Names Windows cannot keep are refused** when you make or rename a folder, note or project, with a red box that says why: a dot at the end ("PAM div." could not be synced by OneDrive), the names `CON`, `NUL`, `COM1` and the like, and the characters `\ / : * ? " < > |`. The same rules hold in the backend, for the AI's proposals and on Linux, so a vault works on every system.
- **The status line from the log** uses the written log lines (the latest ten, not Mimer's own "Status:" lines), the steps and the note, with a stricter prompt.

### Changed (tasks)

- **Tasks are an outline of epic tasks, tasks and steps.** Every epic task folds to one line with its progress, and **Fold all / Unfold all** do them all. A task with steps unfolds to tick its steps or add one right in the list, and each open epic has **+ Add a task**. Finished epic tasks are folded together under **Done**.
- **No due dates, no Today and no Later.** The due date, the time it takes, today's list, "Moved from earlier" and the date words when you add a task (tomorrow, fri, later, ~30m) are gone: what you type is the title. Each task Mimer makes gets the day it was made (`made:2026-10-21`), shown in the list and on the task. Older words like `due:` stay in the file untouched.
- **A task page in two columns:** the note, the steps and what has happened on the left; status, the day it was made, the epic task and the note in a card on the right. The way back goes to its epic task. Focus in the Tasks panel starts with the open epic's first open task.
- **The task's file reads well in any editor.** The log is written as dated list items (`- 2026-10-20 …`) and the note as plain indented text, instead of `>` lines that other editors join into one paragraph. Older files are still read, and a task is written in the new form when Mimer changes its log or note.

### Changed (UI review)

- **No "Back to notes" button** on the Tasks, task, epic and Ideas pages: Files at the left edge brings the notes back.
- **The panels follow what is on screen.** Files and Search on the left bring the note back to the middle; going back to the notes shows Files again instead of the Tasks or Ideas list. Outline, Links and History say which note they are about.
- **A calmer task list.** The Focus button shows on the task under the mouse (and with the keyboard), and each epic task has a clear **Open ›** button. Focus has one look everywhere.
- **A narrow window.** The calendar uses one-letter weekdays and a short month when there is little room, and its help moved into a **?**. The tree tools go into a **⋯** menu when they do not fit.
- **Small fixes:** an icon for every item in the right-click menus (also on a project), the chat's × in its title row, a visible × on the About picture, no extra space above a table, and the title of a note that was just opened shown without its `#` until you click in the note.
- **One name for each thing:** the AI menu above a note uses the same names as the command palette, "Ask about my notes" everywhere, and **Start timer** in Focus.
- **Anthropic can no longer be chosen** as a provider (Mimer never used it); one from an older version is shown as not used. A new OpenAI-compatible provider starts at a local address.

### Removed

- The Anthropic client and its test fixtures (a cloud AI Mimer never used).
- Code that nothing used any more: saved chat prompts (removed from the chat in 0.11.0), making, removing and trying your own skills (Settings → Skills was removed in 0.11.0; skills made before are still listed), the Wake/Sleep bars of the old Mimer tab, and the browser opener package (links are opened by Mimer itself), with its permission.
- Old files: the gold icon in `assets-src/`, `docs/screenshot.png`, the feature plans in `docs/plans/` and the review notes in `docs/REVIEW.md` (all in the Git history), and the Foundry Local test program and its workflow. Fetching Foundry Local's libraries now uses a small empty crate in `scripts/foundry-native-fetch`.

### Fixed

- **Thinking out loud is never shown.** `<think>…</think>` and lead-ins like "Revised text:" are removed from the AI's answers, in text commands, the chat and skills.
- **An answer that would delete the text.** An empty answer, or one that lost most of the text, is not offered as a replacement: Mimer tries once more and then says it got no usable answer.
- A sleeping built-in AI is woken by the text commands too.
- **The Outline panel showed the previous note.** After switching notes it could keep the headings and tags of the note before; it now reads the new note.

## [0.12.0] - 2026-10-20

### Added

- **Epic tasks.** An epic task is a note with tasks in it. The task list shows each epic as a box with progress ("2 of 4") that can be folded; an epic whose tasks are all done moves to Done by itself. A new epic is a note in the folder `Tasks/`. A task made from another note (**As a task**, **Find tasks in a note**) goes into an epic of its own for that note (a note in `Tasks/` with a `source:` line; the note you were in is not changed). A note with tasks you typed yourself is an epic too. The epic page has *Go to the epic's note*, *Came from* and *Suggest steps from the note* (the AI reads the note, and you choose which steps are added). Deleting the note removes the epic from the lists. Quick tasks go into the epic **Inbox**.
- **Landing.** Meetings, Quick notes and Tasks are kept together in a Landing section above the projects instead of in All files. New notes there have a NEW mark for a week; a button and *Move to…* in the right-click menu move a note to a project or a folder.
- **Daily notes on a calendar** at the top of the Files panel: a month with a dot on the days that have a note; a click opens or makes that day's note. The daily notes folder is no longer listed in All files.
- **Mermaid diagrams** are drawn in live preview from a fenced `mermaid` block, and show the code again when you click them (new dependency: `mermaid`, loaded only when a note has a diagram).
- **Tag suggestions.** Typing `#` suggests the tags you already use; the Outline panel shows the tags of the note with a **+ tag** button.
- **Break it down** reads the note the task is in, not only its title.

### Changed

- **The Tasks panel lists the epic tasks**, with no filters and no box for writing a task. The filters (All open, Today, Moved from earlier, This week, Later) and the grouping are gone: you fold an epic instead. The Ideas panel has a **New idea** button instead of a box.
- **The `Tasks.md` note in the root is an ordinary note again** (an old vault shows it as an epic); epic notes can be opened like any note.

## [0.11.0] - 2026-10-19

### Added

- **Tasks.** A task is a checklist line in any note (`- [ ] Renew the licence due:2026-11-01`). Mimer reads them in every note and shows one list: **Today** on top, **Moved from earlier** without blame, **This week** and **Later**, grouped by when, note or tag. Add a task with one line (a date word at the end becomes the due date). Press the Tasks icon or Ctrl/Cmd+Shift+T.
- **One task** has a status (To do, Doing, Waiting), a due date, a time, steps (indented checklist lines) and a **log** of dated lines (`> 2026-10-14 …`) that reads as a timeline. **Break it down** lets the local AI propose small steps; you choose which stay. Everything is written back into the note as plain Markdown, and an edit is refused if the line changed since it was read.
- **Focus.** Press Focus on a task: one step, a 15/25/45 minute timer, "Help me start" (the AI suggests one tiny first step), and a box to park a thought as a task. Everything else is hidden.
- **A task you type in is for today.** Without a date it gets `plan:` today, because that is why it was written. Write a date (`tomorrow`, `fri`) to give it a due date, or end with `later` to put it away.
- **Find tasks in this note**: the local AI reads the open note and suggests tasks. You choose which to keep, and they are added to the end of that note as checklist lines (tasks the note already has are not added twice). Button in the Tasks list, and in the command palette.
- **`Tasks.md` is hidden from the file tree** (it is still found by the task list and opens with *See the file*).
- **New note from a starter** is also under **New** above the file tree and on the empty editor screen (File menu and command palette as before): Meeting, Status update, Reply to an e-mail or Idea. You answer a few questions and Mimer writes the note, with `[blanks]` to fill in. No AI is used.

- **Ideas** are an area of their own (the light bulb at the left edge), next to Files, Search and Tasks. An idea is a dated line in the hidden note `Ideas` (`- 2026-10-19 Text #tag`). *Make a task* puts it in the task list under Later, *Make a note* makes a note in Quick notes and opens it; the idea stays, marked as turned into something. Archive and Bring back are there too. The panel on the left lists the ideas (Open, Used, Archived); a picked idea opens in the middle, where its title and a small note can be changed. The note is written indented under the idea, and goes with it when it becomes a task (into the log) or a note.
- **Tasks have their own panel** on the left: add a task, filter the list by Today, Moved, This week, Later, Done or a tag, and see today's tasks with a box to tick while you write.
- **A note with a task or an idea** in the write-it-down box: "Add a note" opens a small note box.
- **Write it down** (Ctrl/Cmd+Shift+N, File menu, command palette, and inside Focus): one box where you choose Task, Idea or Note as you write. Focus uses it for what pops up while you work, and stays open. Select text in a note and choose *As a task* or *As an idea* in the bar over the selection.

- **AI where you work, with fixed commands instead of a chat to type into.**
  - **Selected text:** Fix, Rewrite and Shorten in the bar, and **AI ▾** for the rest: rewrite with simpler words, more formal or friendlier (same meaning), make it a list, translate to Danish or English, **Explain this** (an answer, nothing changes) and **Find tasks in it**. A rewrite shows whether its numbers, links, addresses and tags are all still there.
  - **The whole note:** an **AI** button above the note with fix spelling, tidy the structure, a **short summary at the top**, **a title and tags**, find tasks, split into notes, **an e-mail from the note** (three new built-in skills) and your own skills.
  - **Search** shows **Answer from my notes** when the search reads like a question: the local AI reads the notes that fit (by meaning when semantic search is on, else by the words) and answers, with the notes it used.
  - **Tasks:** **Write a status line from the log**. **Ideas:** **Think it through** (three questions for the idea's note) and **Suggest first steps** (they become one task with those steps under it).
  - **Spelling help** for dyslexia: the local AI marks misspelt words with a wavy line a moment after you stop typing. Click a word to use the right spelling, ignore it, add it to **my words**, or fix all marked words. Nothing changes by itself; the marks are never written into the note. On and off in the status bar and in Settings → General (off by default).
- **Without an AI everything else still works.** Every AI button is greyed out and says why (no AI set up, not local, asleep, not running), with **Set up AI**. The notes, search, tasks, ideas, outline, links, history and images do not need it, and the system spellcheck still works.
- **The right side is a narrow row of icons.** **Outline** (the headings of the note; click one to go there), **Links** (notes that link here, the links in this note, and *Maybe related* notes found by the title and tags, with a + to link them; no AI), **History** and **Images** open a small panel that is closed by default. The chat is a window over the note (Ctrl/Cmd+L or the speech bubble), and Raven has its own button.
- **Make an index page** for a folder (right-click) without AI: a note with a link to every note in it, grouped by subfolder.
- **Delete a task or an idea.** The task page and the idea have **Delete**, which asks in the same window as deleting a note. The note is committed first, so the task or idea can be brought back from History.

### Removed

- **Raven (the cloud chat) is gone**, with the research prompt, *Import an answer from a cloud AI*, the *Allow Mimer to write from its own knowledge* setting and Raven's provider setting. If you ask Mimer for new documentation or facts, it says that it has no internet access and cannot write it, and offers to structure what is in your notes. Mimer only ever uses an AI on this computer; the Add provider window offers LM Studio and other local servers.

### Changed

- **The chat is only a chat.** "Ask about my notes" has a message box, *Include the open note*, the chat history and New chat. It reads and searches the notes to answer, but it can no longer change them: the change tools are not offered to it, and it is told to point to the AI buttons instead. Skill cards, the Skills and Prompts menus and attaching notes with `/` are gone from it. Raven uses the same header and message box.
- **Settings → Skills is gone.** The AI commands are fixed and built in; skills made in an older version are kept in their file but no longer offered.
- **The menus are File, Go and Help** instead of one long File menu: File for notes, import and export and the vault; Go for quick open, search, tasks, ideas, the chat and the history; Help for the guide, reports and About. Import has its own submenu.
- **Every menu, panel and page looks the same**: one style for drop-down and right-click menus (labels, shortcuts, submenu arrows), one header for the side panels and one for the pages in the middle (with *Back to notes*), one style for the small headings over groups.
- **The chat is no longer a column on the right.** It opens as a window when you ask for it, so the note gets the width. Skills started from a menu open it to show their progress and the review.
- **"I am stuck" in Focus is called "Help me start"**, with a tooltip that says what it does.
- **Ideas are open, used or archived.** "Keep" is gone; an idea that was kept is simply open.

### Fixed

- **The AI menu over selected text closes** when you click outside it, and has a close button.
- **The start screen is a small window of its own** with a fixed size. The app window opens after it, at the size and place it had when it was closed (a normal size the first time).
- **New app icon and start picture.**
- **The chat is simpler**: no model switch and no Wake button (a sleeping built-in AI is woken when you send a message, or use an AI command), and **/** or the paperclip points at a note or a folder again.
- **A task can be renamed** on its page (click the title). Tags, dates and status stay.
- **Tasks and ideas are never opened as notes.** *See the file* on a task is now **Show Markdown**, which shows the task's lines in the task page itself. Tasks and Ideas no longer appear under Recent, in Quick open, in the palette or in search results, and opening them from anywhere goes to the Tasks or Ideas area.
- **An idea becomes one task with steps**, not one task for each step.
- **Spelling help checks in the language of the text** (also Danish), not only English. The system's own underline follows the language of the computer.
- **Pictures survive moving a note.** A note that is moved or renamed into another folder (by dragging, "Move to…", a folder rename or the Sort into folders skill) keeps its pictures and relative links: `![](attachments/a.png)` becomes `![](../../attachments/a.png)` as needed. Before, the picture could not be found when the note was opened again. A picture whose link is already wrong is still shown if a file with that name exists in the vault.
- **Tabs with the same name can be told apart.** Two open notes called "Meeting" now show their folder next to the name (`Meeting  Acme`, `Meeting  Bygma`), and the Close button names the folder too.

## [0.10.2] - 2026-10-18

### Fixed

- **Stop during a skill no longer proposes half an answer.** A note, a fix, a folder or a new note that was cut off by Stop is left out instead of being proposed.
- **Fix small mistakes keeps numbers that belong to the note.** A line such as `3. gang denne maned => 3. gang denne måned` no longer turns into `3. 3. gang`; only a list number that is on the wrong text alone is dropped.
- **A skill started with nothing chosen does not run on the whole vault.** It now says that a note or a folder is needed, and why a chosen folder was left out.
- **"Looks good, do the other N" does the rest exactly like the first notes**: it keeps the extra instructions you typed and the project of the first notes, even if you opened another note meanwhile.
- A test of the whole app that sometimes timed out on a busy computer now waits longer.

## [0.10.1] - 2026-10-18

### Fixed

- The Windows build: two files in the command palette had names that differed only in upper and lower case, which Windows treats as the same file. The helper is now `paletteItems.ts`. 0.10.0 never got a Windows build; use 0.10.1.

## [0.10.0] - 2026-10-16

### Added

- **Skills.** A skill is a job that Mimer carries out itself, note by note, so it works with small local models that only answer in the chat when asked to use tools. Mimer finds the notes (the attached notes and folders, or the open note), asks the model for the text of **one step** (the whole new text of a note, the folder of a note, or one new note) and builds the proposals itself. You still review every change before anything is written. There are four kinds: **Rewrite each note**, **Sort notes into folders**, **Write one new note** and **Answer in the chat** (an ordinary chat turn with the instruction in front). Eleven skills come with Mimer, for example Fix spelling and grammar, Improve the structure, Sort into folders and Summarise.
- **Settings → Skills**: a list on the left (add, remove) and the chosen skill on the right, with the kind and what it does, an example to start from, and Copy to a new skill. Built-in skills cannot be changed but can be copied. Your own skills are stored in `skills.json` next to `settings.json`, so they follow you into every vault.
- The **Skills** button over the message box (it replaces **Tasks**) lists the skills. Choosing one puts it on the message; type extra instructions if you like, then press Enter.

- **Right-click a note or folder in the file tree → AI** lists the skills that fit it and runs one at once on what you clicked (several ticked items work too, up to five). Each skill has a **Works on** setting in Settings → Skills (a note, a folder, or both) that decides where it is offered; the built-in skills are set to what suits them.
- **A local AI must be running.** A skill will not start, from the menu or the chat, unless a local AI is chosen, started (built-in AI or Foundry Local awake) and, for LM Studio and other local servers, answering. Otherwise a message says what to start. Notes never go to a cloud AI.

- **A new look for working with the AI**, from the design ideas:
  - **AI chip in the status bar**: a coloured dot and one verb (Wake, Stop, Fix, Set up). Click it for the model, the device Foundry Local reports (CPU, GPU or NPU), the connection to LM Studio, and the privacy note.
  - **Review changes** has two panels, filters for moves, edits, new notes and deletes, **Accept group / Reject group**, and shows the start of a note that is to be moved. After you apply, an **Undo** button in the message (and File → Undo last AI change) puts everything back, as long as the notes were not changed again; the undo is a commit of its own.
  - **The assistant**: skill cards in an empty chat, **Recent** skills over the message box, a progress bar with a rough time left while a skill works through notes, and **Why were N notes left out?** after a run.
  - **Command palette** (Ctrl/Cmd+Shift+P): notes, the skills that fit the open note or selected folder, and actions in one search.
  - **Settings → Skills**: search, skills grouped by kind, kind cards, **Try it on a note** (shows what the model answers for one note without proposing anything) and a note on where each skill is shown.
  - **Left icon bar** for Files, Search and Settings, a **bar over selected text** with Fix, Rewrite, Shorten and Ask Mimer, and the word count and number of backlinks of the open note.
  - **Right-click menu** with icons and shortcuts; the AI submenu lists Recent skills, a line for each skill and which local AI is ready.
  - **First run**: when there is no AI yet, a short welcome helps you choose the built-in AI or LM Studio.

- **Skills that are easier to make and safer to run** (from the "Simpler skills" design):
  - **Making a skill takes two steps**: say in your own words what it should do and choose what should happen to the notes (fix small mistakes, change the text, move into folders, make one new note, or answer in the chat), then **try it on a note**, see before and after, and save.
  - **Fix small mistakes**: the AI only sends back "wrong => right" for the words to fix, and Mimer puts exactly those in. Front matter and code blocks are never sent, and long notes are proofread in parts. *Fix spelling and grammar* now works this way.
  - **Mimer checks every change** of a skill: links, tags, numbers and dates, names, properties, code, nothing left out, no extra text in front. A change that fails a check is shown but not selected in the review, with the reason.
  - **Long runs start with three notes**: with more than five notes, Mimer does three, then asks **Looks good, do the other N** or **Not right, change the skill**. The rest of the run uses exactly the notes that were left and the folders chosen so far.

### Changed

- The ten ready-made Tasks became skills. Seven of the eleven built-in skills are carried out by Mimer (spelling, structure and formatting, writing, sort, summarise, action items, index page); merge, split, duplicates and explain still run as chat turns. "Propose a structure" and "Add links" are replaced by Improve the structure, Sort into folders and Explain these notes.

## [0.9.4] - 2026-10-16

### Fixed

- A test of the right-panel tabs (`App.test.tsx`) was timing-dependent and failed once in GitHub Actions. It now waits for the text. No change to the app; 0.9.4 has the same content as 0.9.3 and a fully green build.

## [0.9.3] - 2026-10-16

### Added

- **Find my hardware** in Settings → Built-in AI → Foundry Local. The model list was read before the hardware parts (the NPU and graphics card drivers) were downloaded, so only processor models were listed and no NPU or GPU models showed. The button downloads the hardware parts (no model) and reads the list again. The list is also read again after every download. Foundry Local registers the hardware parts for each process separately, so the model list now registers them first once they have been downloaded (it never starts a download by itself); before, it always showed only the processor.

## [0.9.2] - 2026-10-16

### Changed

- **Settings → AI providers** lists the built-in AI as one entry, **Built-in AI**, whichever engine it uses (it opens Built-in AI, where the engine and model are chosen), next to LM Studio and the other providers. The two built-in providers are named **Built-in AI · llama.cpp** and **Built-in AI · Foundry Local** where they are chosen (Settings → AI and the menu under the Mimer tab's title).

## [0.9.1] - 2026-10-16

### Fixed

- The build of 0.9.0 stopped half-way (the AppImage could not be packed because it did not find ONNX Runtime by its soname, and the Store package script had a syntax error). 0.9.1 has the same content as 0.9.0 and builds completely. Use 0.9.1.

## [0.9.0] - 2026-10-16

### Added

- **Foundry Local as a built-in AI.** Settings → Built-in AI now asks which engine should run the AI on this computer: **Foundry Local** (Microsoft's runtime) or **llama.cpp** (as before). Foundry Local picks the best hardware by itself, including a neural processor (NPU) on computers that have one, and offers models such as Qwen, Phi and Gemma; only models that can call tools are shown, because searching and changing notes needs them. Download, **Wake Mimer** and **Sleep Mimer** work as for llama.cpp. The engine runs in a helper process (Mimer started again as `mimer --foundry-helper`), so a fault in it cannot take Mimer down. Foundry Local is the only built-in engine in the Microsoft Store version: its native libraries are part of the signed package, and only data (hardware parts and the model) is downloaded.
- Windows 11 version 24H2 or later is needed for Foundry Local on Windows. On Linux it is new and on some systems its engine crashed when a model was downloaded; Mimer stays up and says so.

### Changed

- The separate "Foundry Local" provider from 0.8.9 (which looked for a program the user had installed) is gone; Foundry Local is now Mimer's own built-in engine.

## [0.8.10] - 2026-10-16

### Changed

- **The Store package no longer has the second variant with the built-in AI.** On a managed laptop the downloaded engine (`llama-server`) was blocked from starting, so that package could not use its AI. There is one Store package again (`mimer-msix`), and Settings → Built-in AI says that the engine cannot run in the Store version. The GitHub installer and the AppImage are unchanged.

## [0.8.9] - 2026-10-16

### Added

- **Foundry Local** as an AI provider (Windows and macOS): Microsoft's program for running models on this computer, including on a neural processor (NPU). Add a provider, choose the kind **Foundry Local** and press **Detect Foundry Local**; Mimer finds the address, since Foundry Local chooses a new port each time it starts. It counts as local (notes may be sent to it) only at an address on this computer. Foundry Local is installed by the user, not by Mimer.
- **Add provider asks which kind first.** Settings → AI providers opens with no provider chosen, and **Add provider** opens a window with the kinds (LM Studio, Foundry Local, another local server, Anthropic, a cloud service with the OpenAI interface), each marked "Local · for Mimer" or "Cloud · for Raven only", with a note that a local AI cannot be used by Raven because Raven works only with a cloud AI.
- **Switch AI and model in the tab.** Click the AI name under the title of the Mimer or Raven tab to choose another provider or model from a menu, without opening Settings. Mimer lists the local providers, Raven the cloud ones; the built-in AI lists its downloaded models. The choice is saved in the settings. A project that chooses its own AI keeps it.
- **Every kind of AI provider explains what to do** in Settings → AI providers when you choose it: what it is, numbered steps to get it working, and what to know afterwards.

## [0.8.8] - 2026-10-16

### Changed

- **Settings → Built-in AI explains the download** before you press the button: that the engine (llama.cpp, MIT) comes from github.com and the model (Gemma 4, Apache-2.0) from huggingface.co, their sizes, that nothing is downloaded until you press Download, the disk space, and the memory the model uses while awake.

## [0.8.7] - 2026-10-16

### Added

- **A Store package with the built-in AI.** Every release now builds two Microsoft Store packages: `mimer-msix` (as before, no downloaded engine) and `mimer-msix-with-ai` (the built-in AI can be downloaded in Settings → Built-in AI). They are the same program; a small marker file in the second package switches the feature on, so going back to the first is just uploading the other file (see docs/MSIX.md). The Store may reject the one with the built-in AI.

## [0.8.6] - 2026-10-15

### Changed

- **File → Report** is a submenu with **Report a bug…**, **Suggest a feature…** and **Report inappropriate AI content…**. The flag buttons in the Mimer and Raven tabs are gone.

### Fixed

- **Links did nothing in the Linux AppImage** (the report items, and web links in notes): the AppImage's own library settings leaked into the browser that Mimer started. Mimer now opens links itself with those settings removed, and when a link still cannot be opened a dialog says so and shows the address.
- **Sorting a big folder**: a list of moves that a model writes as text instead of calling the tool is now turned into proposals for review, the tool tells the model which notes in the folder still have no move, and the model is asked for about 20 moves per call.

## [0.8.5] - 2026-10-15

### Added

- **Markdown source view**: a button in the editor toolbar (and **File → Show Markdown source**, **Ctrl/Cmd+Alt+M**) shows the note exactly as it is stored, with every `#`, `**` and `[[...]]`, in a monospace font. Switch back to the live preview the same way. The choice is remembered.
- **Report a bug / Suggest a feature** in the File menu: opens a GitHub issue form with the Mimer version and system already filled in (`.github/ISSUE_TEMPLATE`).

### Changed

- **Pictures are listed in the Images tab only**, not in the file tree. This includes the pictures that come with an imported folder. A folder that only holds pictures is not shown either. The files themselves are not moved.

### Fixed

- **Mimer went in circles when asked to sort a big folder** (for example a OneNote import). A folder with more than 12 notes is now attached as a list of its note names instead of the text of 40 notes, which filled the AI's memory. The AI can list a whole folder at once (`list_folder` with `recursive`) and move many notes in one step (`propose_move_many`, up to 60 per call). It now knows that a folder is made by moving a note to a new path (there is no tool for empty folders, which it kept trying to use), that it must not ask for confirmation, and that nothing it proposes is applied until you apply it. The AI uses a lower temperature when it works with tools, so small local models repeat themselves less.

## [0.8.4] - 2026-10-15

### Fixed

- **Links and the report button gave "not allowed to open"**: the app was not allowed to open any web address. Web links in notes and **Report inappropriate AI content** now open in the browser (http, https, mailto and tel only).

## [0.8.3] - 2026-10-15

### Added

- **Report inappropriate AI content**: a flag button in the Mimer and Raven tabs and **File → Report inappropriate AI content…** open a pre-filled issue on the project's GitHub page (nothing from your notes or chat is added). The Microsoft Store requires apps with live generative AI to offer this (policy 11.16). The Store listing texts now disclose the use of live generative AI.

## [0.8.2] - 2026-10-15

### Changed

- **The built-in AI is Mimer's provider from the start** on a fresh install (where it can be downloaded: Windows and Linux, not the Store version). LM Studio and other local providers are still there to choose under Settings → AI → Mimer's provider, and a cloud AI is only for Raven. Existing settings are not changed. The settings and the help now say plainly that Raven needs a cloud AI, because LM Studio and the built-in AI cannot search the internet.
- The message about a missing Windows runtime now says to install the **64-bit (x64)** Visual C++ Redistributable, not x86, gives the direct link, and names the files that come with it (`vcruntime140_1.dll`, `msvcp140.dll`).
- The Store package is called **Mimer: Markdown Notes** (the name reserved in Partner Center); the tile and the Start menu show the short name Mimer.

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
