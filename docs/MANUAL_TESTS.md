# Manual test checklist

This is the checklist for everything automated tests cannot cover. Run the whole list on Linux before each release and again on Windows 11 for release candidates. Use a throw-away vault (an empty folder you create for testing) so nothing real is at risk. Items marked **(AI)** need a local AI: the built-in AI, or LM Studio with a model loaded (`http://localhost:1234/v1`).

Keep it up to date: when a feature changes, change its lines here in the same commit.

### 0. Automated checks (do these first)

- [ ] `pnpm check` finishes with no errors (format, lint, typecheck, frontend tests, `cargo fmt`, `cargo clippy`, Rust tests). On Bazzite/Silverblue, run it inside the development container: the host has no GTK/WebKit libraries for the Rust part.
- [ ] `pnpm tauri dev` opens the app window without errors in the terminal.
- [ ] The status bar (bottom right) shows `v<version>+<commit> beta` (`.dirty` at the end means the build has uncommitted changes). The same version is on the welcome screen and in **Settings → General**. Hover over it: the build date and time match the build.

### 1. Start, vaults and the window

- [ ] At start the Mimer picture is shown for about two seconds with the version; a click or any key skips it.
- [ ] First start (no vault): the Welcome screen has **Open folder as vault**, **Create new vault**, the recent list, **How to use Mimer** and **About**, on the Mimer picture.
- [ ] **Create new vault** → pick a parent folder → the window asks for a name and has **Trace my work in today's daily note** (off). A name like `PAM div.` is refused with a red box that says why. Create: the vault opens with `.git`, `.gitignore` (with `.vault/index.db`), `.vault/config.json`, the folders `Meetings` and `Quick notes`, and the templates `Meeting` and `Quick note` in `.vault/templates/`.
- [ ] Tick **Trace my work** when creating a vault: Settings → General shows it on.
- [ ] A recent vault whose folder is gone shows **Folder not found** with **Locate** and remove.
- [ ] Close and start again: the last vault opens straight away with its tabs. Start a second copy: the first window comes to the front.
- [ ] Window size and position are remembered.
- [ ] The vault name in the header (or `Ctrl/Cmd+Shift+O`) lists the recent vaults with a check mark on the open one. Switch: the open note is saved and committed first; the other vault's tabs and chats come back. **Open another folder as vault…** and **Create new vault…** work there too.
- [ ] Left edge: Files, Search, Ideas, Tasks and Settings. Pressing the open one hides the panel. Right edge: Outline, Links, History and Images open and close a narrow panel (closed at start); the speech bubble opens the chat.
- [ ] Right-click in an empty area or the status bar: only **Inspect element** (no Reload). In a note and in text boxes the normal menu stays.

### 2. The file panel

- [ ] **New** above the tree: Note, Meeting note…, Quick note, Today's daily note, Folder…, Project… all work, and there is no "From a starter". **File** has Note, Meeting note…, Quick note, Task, Idea, Today's daily note, then **Write it down…**. The `···` menu has no Search or Quick open.
- [ ] **Quick note**: opens the small box on Note; with a name it saves `Quick notes/<name>.md`, without one it uses the first line; the note you are in stays open and unchanged.
- [ ] **Meeting note…**: everything can be left empty. With a day and time, the note is `Meetings/<day> <title>.md` with `meeting:` and `with:` at the top, the agenda as a checklist and a `###` part per item. **Create** keeps you where you are; **Create and start** opens the meeting screen.
- [ ] **Meeting screen**: the first open item is **Now**; typing writes to the note (open it in another tab to see it); **Next item** ticks the item; **+ Add an item** adds it; the write-it-down box does not change the notes; **Esc** leaves. **Start meeting** shows above notes in the Meetings folder.
- [ ] **After the meeting**: next to **Start meeting**, **Prepare next meeting…** fills in the window: same title and people, a week later, only the agenda items that were not ticked.
- [ ] **Where a task goes**: in the write-it-down box (Focus, meeting screen, Ctrl+Shift+N) a task has **Into**. Focus starts on the epic in focus, a meeting on its own epic (made when the first task is saved), else the one used last; **+ New epic…** asks for a name; nothing is made without one; no "Inbox" appears.
- [ ] **Pencil and waste bin**: over an epic, a task and a step (list, epic page, task page, Focus) the pencil opens a field (Enter saves, Esc and the cross go back, clicking away changes nothing) and the waste bin deletes. Epic and task ask first and say how much goes with them; a step goes at once and **Undo** in the message puts it back at the end. Tab reaches both buttons.
- [ ] **Landing** has one line with the next meeting of today or tomorrow and **Start**; **+N** shows the others; with no meeting today or tomorrow there is no line.
- [ ] Folders first, then notes, A–Z ignoring case; `.md` is hidden. Files and folders starting with `.` never show. Folders show how many notes they hold.
- [ ] Rename (right-click → **Rename**, or F2), drag a note onto a folder, delete (the dialog says it can be restored from history).
- [ ] Create, change and delete a `.md` file in another program: the tree follows within a second or two.
- [ ] **Daily notes** at the top: a calendar with a dot on days with a note; a day opens or makes its note; **Today** works; the Daily folder is not listed in All files.
- [ ] **Recent** lists the notes you opened last (4; Settings → General → **Recent notes shown**: 0 hides it, 20 is the most).
- [ ] **Landing** holds Meetings, Quick notes and Tasks. A new note shows **NEW** and a move button until you open it; right-click → **Move to…** moves it.
- [ ] **Projects** are not in All files; each has its own tree, a **+** and a gear. The attachments folder is not in All files.
- [ ] The filter box narrows the tree (also inside projects); Esc clears it. **Collapse all**, **Show the open note** and **Sort** (Name, Last changed, My own order) work.
- [ ] **My own order**: drag to the top or bottom edge of an item places it there; the middle of a folder moves into it. **Move up / Move down** and Alt+Up / Alt+Down work. After a restart the order is kept (`.vault/order.json`).
- [ ] Ctrl/Cmd+click ticks items, Shift+click ticks a range, Esc clears. Right-click: **Move N items to…** (links updated, one question) and **Delete N items** (asks once).
- [ ] Names: a folder or note called `PAM div.`, `nul` or `a:b` is refused with a red box that says why, also when renaming. `v1.2 notes` is fine. A name that already exists in the folder (also with other upper/lower case) is refused while you type. Renaming `plan` to `Plan` works.
- [ ] Drag a note onto a folder that already has a note with that name: a window says what exists where and nothing moves.

### 3. The editor

- [ ] The toolbar: bold, italic, strikethrough, inline code (clicking again removes the marker), headings 1–3, bullet/numbered/task list and quote (switch without stacking), link, link to a note, table, image, code block, horizontal line. Hover shows the name and shortcut. With no note open the buttons are greyed out and the editor is read-only.
- [ ] Live preview: `**bold**`, headings, _italic_, ~~strike~~, `code` and links render with the markers hidden off the cursor line and shown on it. Checkboxes can be clicked. Quotes and code blocks have a background. `---` becomes a line. Front matter shows as a collapsed **Properties** bar.
- [ ] Tables show as a table off the cursor; a cell can be edited, Tab/Shift+Tab/Enter move, Tab in the last cell adds a row, the table toolbar adds and removes rows and columns. `Ctrl/Cmd+Alt+T` inserts one.
- [ ] **</>** (or **Go → Show Markdown source**, `Ctrl/Cmd+Alt+M`) shows the raw text; the choice is remembered.
- [ ] Ctrl/Cmd+B, Ctrl/Cmd+I, Ctrl/Cmd+F work.
- [ ] Save status: **Unsaved changes** → **Saving…** → **Saved** about a second after you stop typing. Restart: the text is still there.
- [ ] A changed file on disk (no unsaved edits): Mimer shows the new text. With unsaved edits: the banner **Keep my version / Load disk version**; History has `Snapshot before reload: …` either way.
- [ ] `Ctrl/Cmd+N`, **New → Note** and right-click a folder → **New note** open the same window that asks for a name (`Untitled`, or `Untitled 1` when that exists). **Create** opens the note with `# <name>` as its first line and the file has that name.
- [ ] Tabs: no duplicate tab; close with ×, middle-click or `Ctrl/Cmd+W`; `Ctrl/Cmd+PageUp/PageDown` switch; `Ctrl/Cmd+\` splits and merges; right-click → **Open in split view**. Two notes with the same name show their folder in the tab. Quit with a split: it comes back.

### 4. Links, tags, pictures and diagrams

- [ ] `[[` opens a list of notes (fuzzy). `[[Note]]`, `[[Note|alias]]`, `[[Note#Heading]]` work; Ctrl/Cmd+click opens; a missing note is muted and a click creates it. Links in code are not links.
- [ ] **Link to a note** (`Ctrl/Cmd+Shift+K`) with a selected word inserts `[[Note|word]]`.
- [ ] Rename a linked note: "Update N links in M notes?"; **Update links** rewrites them in **one** commit `Rename <old> → <new>`.
- [ ] `#tag` is a pill that searches; typing `#` suggests your tags. `tags: [a, b]` counts; `#123` does not.
- [ ] Paste a screenshot, drag a picture, and **Insert image**: the picture is copied into `attachments/` and shown. The size bar (Small / Medium / Large / Original) changes it. A PDF becomes a link that opens in the default app.
- [ ] Move a note with a picture two folders down and back: the picture is still shown.
- [ ] **Images** at the right edge lists every picture, which notes use it and the unused ones; **Insert in note**, the large view and **Move to trash** work.
- [ ] A ```mermaid block with `flowchart LR` becomes a diagram off the cursor; broken code shows a message and the code.

### 5. Version history

Check with `git log --oneline` in the vault folder.

- [ ] `Ctrl/Cmd+S` on a changed note: `Save: <path>`; again without changes: **no** commit.
- [ ] Switching from a changed note: `Autosave: <path>`. Idle time (Settings → Version history, 1 minute to test): `Autosave`. Closing the window: `Autosave on close`, and it closes within 5 seconds.
- [ ] A file changed while Mimer was closed: `Recovered uncommitted changes` on open.
- [ ] **History** (right edge, `Ctrl/Cmd+Shift+H`): commits for the note with a diff; **Restore this version** adds a snapshot and a `Restore … to …` commit. Renames are followed.
- [ ] Delete a note, **File → Recover deleted notes…**, Restore: it is back.
- [ ] A vault that already is a Git repository keeps its old commits; Mimer only adds.

### 6. Search

- [ ] `Ctrl/Cmd+Shift+F`: results while you type, with word prefixes (`firew` finds firewall) and highlights. `tag:` and `path:` narrow it. Odd input (`"`, `(`, `AND`, `*`) gives no error.
- [ ] `Ctrl/Cmd+P` quick open finds a note by part of its name.
- [ ] `node scripts/gen-vault.mjs ~/mimer-test-1000 1000`, open it: indexing is quick and search answers instantly; typing stays smooth.
- [ ] Delete `.vault/index.db` while Mimer is closed: it is rebuilt.
- [ ] **(AI)** Semantic search (Settings → AI, a local embedding model): **Keyword / Meaning / Both** appear; **Meaning** finds a note by a phrase that is not in it. `.vault/embeddings.db` is ignored by Git.
- [ ] **(AI)** A search like "what is the service desk number?" shows **Answer from my notes**; **Get an answer** answers with the notes it used.

### 7. Tasks and epics

- [ ] `Ctrl/Cmd+Shift+T` or the Tasks icon: one outline of epics, each a box with "N of M" and a bar; the left panel lists the epics. There is no Today, Later, due date or "Moved from earlier" anywhere.
- [ ] Fold an epic: only its name and progress are left. **Fold all** and **Unfold all** do every epic. Restart: what was folded is still folded. Finished epics are under **Done · N** at the bottom, folded; the button shows them.
- [ ] A task with steps has an arrow: unfold it, tick a step and add one (**+ Add a step**) right in the list; the note shows the step.
- [ ] **+ Add a task to …** at the bottom of an open epic: type "Print the guide tomorrow" and press Enter. The title is exactly that (no date is read from it) and the file has `made:<today>` at the end of the line; the list shows the day it was made.
- [ ] **New epic** "Office move": `Tasks/Office move.md` is made and opens. Add three tasks, tick all: the epic moves to **Done**; untick one: it comes back.
- [ ] Select a line in a note → **As a task**: `Tasks/<note>.md` has a `source:` line and the task (with `made:`); the note is unchanged. The epic page shows **Came from**.
- [ ] Task page: two columns. Left: title, **Note**, steps, "What has happened". Right: status (a "Status: …" log line appears), **Made**, **Epic: …**, **Open the note** and the tags. The way back at the top goes to the epic. No due date, time or today's list.
- [ ] Task page **Note**: write two lines and click away: the file has them as plain indented text right under the task. An epic made with **New epic** has a **Note** too (text under its heading).
- [ ] "What has happened": a new line is written as `  - <today> text` (a list item). Hold the mouse over a line: the pencil changes its text and date, the bin deletes it (it asks; History of the note still has it).
- [ ] Old file: a task with `> 2026-10-19 …` log lines and a `> note` line still shows its log and note. Add a log line: that task's lines are now all in the new form; other tasks are untouched. Words like `due:2026-10-23` stay in the file but are not shown.
- [ ] Open the epic's note in another Markdown editor (or GitHub): every log line is on its own line, and the note reads as text under the task.
- [ ] **Focus** in the Tasks panel starts with the first open task of the epic that is open (or of the first epic).
- [ ] **(AI)** **Break it down** suggests steps; only the ticked ones are added. **Write a status line from the log** uses the written lines, the steps and the note, not the "Status:" lines. **Suggest steps from the note** on an epic adds only the ticked ones.
- [ ] Order: hover an epic, a task and a step and use the arrows; then the same with **Alt+↑/↓** (the focus stays on the item, so it can be pressed again). The note has the new order (a task moves with its steps, note and log). Restart Mimer: the epic order is kept. Change a step's text with the pencil on the task page: Enter saves, Esc goes back; no title or step is a text field before the pencil is pressed. Rename a task: `made:` stays.
- [ ] Delete a task: it asks; History has "Snapshot before delete".

### 8. Ideas, write it down and Focus

- [ ] The light bulb: ideas Open / Used / Archived; **New idea**; change the title and note, click away: `Ideas.md` has the note indented under the line (hidden from the tree and not a task).
- [ ] **Make a task**: asks which epic (or a new one), then puts it there with the idea's note as the task's note; the idea is Used. **Make a note**: a note in Quick notes opens. Archive and Bring back work.
- [ ] `Ctrl/Cmd+Shift+N` from inside a note asks first (T, I, N or the buttons) and then shows only that box; each saves and closes with a message that has **Open**; the note you were writing is unchanged. **New → Task**, **New → Idea** and **Quick note** (start page, File, palette) show only that box, with no choice of kind. In a meeting, Focus and the start-page widget: **+ Task**, **+ Idea**, **+ Quick note** open one box, which stays open after saving; the cross closes it.
- [ ] **Focus** is only on an epic: in its heading in the task list and at the top of the epic page (not in the left panel, not on task rows, not on the task page). It shows the whole epic as an outline, every task open, the task marked **Working on it** (its status is Doing), its next step marked **Now**. Fold any task (also the marked one), **Work on this** moves the mark, **Fold the rest** folds all but the marked one. Move tasks and steps with the arrows (or Alt+Up/Down), and add a step under a task with Enter.
- [ ] In Focus, write in **What has happened** and press Enter: the line is in the task's log with today's date and you stay in Focus. **Done, next step** on the last step asks "Tick the task too?"; yes marks the next open task. When the epic is done: "Epic done" and **Back to the task list**. The timer can be paused; the write-it-down box keeps you in Focus; Esc leaves.
- [ ] Focus → **Timer** box: off hides the ring, the length and Start timer, and "Do this now" with Done stays; close Focus and open it again: still off; on brings the timer back. **How long** lists 15, 25, 45, 60 and Custom… (1–180, a wrong number is refused); the length is kept next time and cannot be changed while the timer runs. **Ultra focus** shows only the marked task with timer (if on), steps, a box for the log and the log; **Back to the epic** and Esc work.
- [ ] **(AI)** **Help me start** in Focus, **Think it through** and **Suggest first steps** on an idea: nothing is added until you press the button.

### 9. Daily notes and Trace my work

- [ ] `Ctrl/Cmd+Shift+D` makes `Daily/<today>.md`; again opens the same note. Settings → Vault: daily folder, date format and template are used.
- [ ] Settings → General → **Trace my work** on: write in a note, make a task, add a log line, tick it. Today's daily note has "## Worked on" with one line for each; task lines end with `in [[Tasks/…]]`, a link to the epic's note. Write in the same note again: no second line. Remove a line: it stays removed while Mimer runs. Off: nothing is written.

### 10. Setting up the AI

- [ ] **Settings → Built-in AI**: two engine cards, **Foundry Local** and **llama.cpp**; none is chosen for a new user.
- [ ] llama.cpp: the hardware found is shown and pre-selected; a model shows its size and memory; **Download** shows progress, Cancel and continue work; the built-in AI becomes Mimer's provider. **Add my own model file…** copies a `.gguf`.
- [ ] Outside the Store version there is no Phi Silica card. In the **Store version on a Copilot+ PC**: a third card **Windows AI · Phi Silica**, llama.cpp greyed out. "Phi Silica on this PC" shows Access, This PC and The model (green, or the reason in plain words with Windows' answer in grey). **Test Phi Silica** answers the test sentence; **Use Phi Silica for my notes** makes it the AI; Fix on a selected paragraph and a chat question about the open note work; the chat says tools are not available. **Copy for a bug report** copies the lines. On a PC that is not Copilot+: the card is greyed out with the reason, and Foundry Local still works.
- [ ] **Settings → AI**: one list "Which AI Mimer uses", in the order for this computer (Store on Copilot+: Phi Silica, Foundry Local, LM Studio, Cloud AI; Windows installer: llama.cpp first; Linux: llama.cpp, LM Studio, Foundry Local). Each line shows its state; choosing a ready one makes it Mimer's AI; a line that is not set up offers **Set up the chosen AI**.
- [ ] **Cloud AI**: add an OpenAI-compatible provider with a cloud address and key; choose Cloud AI: the warning lists what is sent, **Use the cloud AI** is greyed out until "I understand…" is ticked; **Keep the AI on this computer** changes nothing. After using it: the status bar shows **Cloud AI**, the chat note is orange ("your notes go to …"), and a chat answer comes from it. A project with **Local AI only** uses a local AI instead. Choose another AI, then Cloud AI again: the warning comes again.
- [ ] Foundry Local list: every chat model (also "No tools"), each with "good for", maker, size, runs on, reads about N words, licence. Search, Writing/Reasoning/Code, Can use tools, Downloaded, Runs on, Size and Sort work; **All Foundry Local models at Microsoft** opens the browser. Download a model without tools: text commands work, the chat says tools are not available.
- [ ] Translate to English on Danish text (Phi Silica and a Foundry model): the answer is in English.
- [ ] Foundry Local (Windows 11 24H2 or later; Linux is experimental), on a computer that has never used it (or after **Remove all**): there is no model list, only the question about the hardware parts, and nothing is downloaded. **Use only the processor**: the list shows CPU models, **Find my hardware** is offered, and downloading a model or waking it fetches no hardware parts. **Download and find my hardware**: progress, then the list shows GPU/NPU where the computer can. A small model downloads.
- [ ] **Wake** in the status bar loads the model; **Sleep** frees the memory (no `llama-server` or helper `mimer` process left). An AI command while asleep wakes it by itself. Closing or killing Mimer stops the engine. **Sleep after** 1 minute works.
- [ ] A problem (too large a context, missing driver) shows a red box with steps, **Show details** and **Copy details**.
- [ ] **Remove** a model and all files (with a confirmation) cleans the folder shown in the settings.
- [ ] Nothing from the built-in AI is reachable from outside: `curl http://127.0.0.1:<port>/v1/models` without a key is refused.
- [ ] **Settings → AI → More: LM Studio and other providers** → LM Studio: **Load models**, pick one, **Test connection** says connected. An OpenAI-compatible provider with a non-local address shows that it is not used.
- [ ] An API key shows "Key stored" and is **not** in `settings.json` (it is in the system keychain).
- [ ] The status bar AI chip: green when ready, grey when asleep (with **Wake**), blue while working (with **Stop**), red with **Fix** on a problem. Clicking it shows the model and where it runs.
- [ ] First run with no model: the welcome appears once; **Skip setup** does not bring it back.

### 11. AI where you work (AI)

- [ ] Select text in a note: the bar has **Fix**, **Rewrite**, **Shorten**, **AI ▾**, **As a task**, **As an idea**. **AI ▾** (and `Ctrl/Cmd+K`) lists the fixed commands; none asks you to type.
- [ ] **Fix** shows a diff with "Same numbers, links and names"; remove a number by hand in a test and see "Check: … is gone". **Accept** (Enter) replaces the text, with `Snapshot before AI: …` and `AI: …` commits; **Try again** and **Reject** (Esc) work.
- [ ] **Explain this** shows an answer with Copy and changes nothing. **Find tasks in it** opens the task finder. Translate to Danish and to English work.
- [ ] **Every text box**: in a task's note box, the log box and a step box, select a word: the same bar appears; a real mouse click on **Fix** shows the review. `Ctrl/Cmd+K` with nothing selected works on the whole text; Accept puts the result in the box. No bar in password, search or name boxes. With no AI the bar says why.
- [ ] A small model that answers with `<think>…</think>` or "Revised text:": only the text is shown. An empty answer, or one that lost most of the text, is not offered: Mimer tries once more and then says it got no usable answer.
- [ ] Settings → AI → **Let the AI check its own answer** is off by default; on, a text command takes longer and a wrong answer is tried again.
- [ ] The **AI** button above a note: fix spelling and grammar (only the wrong words change), improve the structure, a short summary at the top, a title and tags, find tasks, split into notes, an e-mail from this note. **Link related notes** opens the Links panel (no AI).
- [ ] Right-click a folder → **AI**: sort into folders, find duplicates and the other skills that fit a folder. **Make an index page** works without AI. Several ticked notes (up to five) work together.
- [ ] `Ctrl/Cmd+Shift+P`: a skill name runs it on the open note; a note name opens it; actions work.
- [ ] Spelling help (status bar): a misspelt word gets a wavy line; click it for the right spelling, Ignore, Add to my words, Fix all. Nothing changes by itself.

### 12. The chat (AI)

- [ ] `Ctrl/Cmd+L` or the speech bubble opens **Ask about my notes** over the note; Esc closes it and the chat is kept.
- [ ] Ask "Summarize this note": the answer streams and uses the note; untick **Include the open note** and it no longer knows it. **Stop** stops at once.
- [ ] Type `/` or press the paperclip: notes and folders can be attached as chips (× removes one; a sixth is refused). In a project only its notes are offered.
- [ ] The chat answers but never changes a note.
- [ ] Ask "who are you?": Mimer, briefly; in Danish when asked in Danish. Settings → AI has no base instruction any more. **Language of the AI's answers** set to Danish: the chat, the fixed commands and skills answer in Danish; Same as the text: in the language of the text; a Custom command that asks for a translation still translates.
- [ ] **History** reopens earlier chats after a restart; **New chat** starts over; delete one and **Delete all history…** work. `.vault/chats/` is not committed.
- [ ] Stop the AI server and send a message: a clear error, not an endless spinner. A slow model shows a counting timer.

### 13. Reviewing changes (AI)

- [ ] **AI → Split into notes** on a note with several headings: the chat window shows the steps, then **Review changes**. Nothing is on disk yet.
- [ ] The review lists every file (Edit / Create / Move / Delete, path, reason, diff), with Accept / Reject per file and per group. A change that fails a check is shown unselected with the reason.
- [ ] Reject one file and **Apply selected**: only the accepted files are written; `Snapshot before AI: …` then one `AI: …` commit. **Reject all** writes nothing.
- [ ] Change an affected file on disk before applying: it is marked **Changed since proposal** and must be confirmed.
- [ ] After Apply, **Undo** (or **File → Undo the last AI change**): everything is back, with a "Restore AI changes of …" commit. After a hand edit Undo refuses and says why.
- [ ] A command on more than five notes does three first, then **Looks good, do the other N**.

### 14. Without an AI

- [ ] No provider chosen (or the built-in AI asleep and not set up): every AI button is greyed out with the reason and **Set up AI**. Notes, search, tasks, ideas, Focus, the calendar, outline, links, history, images, import and export all work; the system spellcheck still underlines.

### 15. Projects

- [ ] **New → Project…**: Name, About this project and AI provider (local only). Save: a new folder in the **vault root** (also with another folder selected), under Projects, with `.vault/projects/<id>.json` committed.
- [ ] A name already used in the root (folder or note, any case) is refused while you type. There is no **Make project** on a folder; a project cannot go inside a folder or another project.
- [ ] Drag notes onto the project: they move in (one `Rename` commit, links updated). Drag one back to All files.
- [ ] **(AI)** A sentence in **About this project** or **About me and my notes** (for example what "Wave 1" means) is known to the chat and to skills, and does not change what Fix, Rewrite or Shorten return. There is no "Ask AI to change the instructions" box.
- [ ] Rename the project folder: the project follows.

### 16. Templates, import, export and index pages

- [ ] There is no **From a template…** or **Save the note as a template…** anywhere (New, File, the start page). A new meeting, quick note and daily note still start from their template in `.vault/templates/` and fill `{{title}}` and `{{date:…}}`.
- [ ] **File → Import notes from a folder…** (see [docs/IMPORT-ONENOTE.md](IMPORT-ONENOTE.md)): the preview counts match, "Left out" lists hidden and unsupported files; import shows progress and a report; pictures are in **Images**, not in the tree; importing again numbers the copies; a folder inside the vault is refused; the source folder is unchanged.
- [ ] **File → Export…** of a note with a heading, a table, a picture, a `[[link]]` and `<script>alert(1)</script>`: HTML shows the picture and the script as text (no dialog); Word has the formatting; PDF opens a preview and prints only the note. A folder exports as one document with a table of contents. Exporting makes no commit.
- [ ] Right-click a folder → **Make an index page**: a list of links; your own text above it is kept when you make it again.

### 17. Settings

- [ ] **File → Settings…** (`Ctrl/Cmd+,`): General, AI (marked Beta), Version history, Vault. The AI tab has the beta note, the list of AIs, then the folded sections **Built-in AI: set up** and **More: LM Studio and other providers**.
- [ ] **First start** (clear `mimer.betaNoticeSeen`): "Welcome to Mimer" says it is a first version and that the AI is beta; **Got it** is remembered; **Help → About the AI beta…** shows it again. **Beta** marks sit by the editor AI button, the chat title and the AI tab.
- [ ] **Right-click on selected text**: Cut, Copy, Paste, Select all, then **AI ›**, Add as a task, Add as an idea. Without a selection the system's own menu shows.
- [ ] General → Theme: eight cards (Light, Dark, Slate, Paper, Mint, Midnight, Graphite, Ember); a click changes Mimer at once, Save keeps it, closing Settings without saving puts the old theme back. **Follow my computer** follows the computer's Light or Dark; unticking it keeps the theme on screen. Look at the editor, a dialog, the Tasks page and the start page in every theme: text readable, panels, the writing area and raised boxes still apart.
- [ ] General: font size, line width, spellcheck, recent notes, spelling help, Trace my work and your own words take effect.
- [ ] Vault: daily notes folder and template, meetings and quick notes folders, image style; a folder like `../outside` is refused. **Add standard folders and templates** does not overwrite your edits.
- [ ] Edit `settings.json` and set `"schemaVersion": 99`: "Settings could not be loaded" and the file is not overwritten (restore it afterwards).

### 18. Safety

- [ ] A link like `[x](../../outside.txt)` does not open anything outside the vault.
- [ ] Kill the app while it says **Unsaved changes**: at most the last second of typing is lost; the vault opens normally.
- [ ] A symbolic link in the vault that points outside it: the files behind it are not shown or reachable.
- [ ] Network check: while using every AI feature, nothing goes to a host other than the local AI (and, only when you press Download, the download sites).

### 19. Packaging

- [ ] Windows 11: the `…-setup.exe` installs **without** an administrator prompt; Mimer starts from the Start menu with the purple "M" icon; pictures show; **Reveal in file manager** opens Explorer; uninstalling (which also removes `mimer-ai` next to the program) leaves the vaults untouched.
- [ ] Linux: the `.AppImage` starts and Help → Report a bug… opens the browser (or a dialog shows the address). The `.rpm` installs.
- [ ] Microsoft Store package ([docs/MSIX.md](MSIX.md)), in Windows Sandbox or a virtual machine: it installs and starts; a vault opens and saves; Settings and recent vaults are kept after a restart; the llama.cpp card says it is not available in the Store version and Foundry Local works; the Windows App SDK runtime was installed with it (the test copy: `Install-TestMsix.ps1` installs it); uninstalling leaves the notes.
- [ ] The release run has the artifacts `mimer-msix` (unsigned) and `mimer-msix-test`.

### 20. Help, About and reporting

- [ ] The **?** in the top bar, **Help → How to use Mimer** and **F1** open the guide; the search narrows the topics; Esc closes it. A **?** next to a setting explains it and **Read more in the guide** opens the right topic.
- [ ] **Help → About Mimer…** shows the picture, version, build date, the licence (AGPL-3.0) and who made it.
- [ ] **Help → Report a bug…**, **Suggest a feature…** and **Report inappropriate AI content…** open GitHub with the form filled in (version and system).

## Epics and other notes with tasks

- [ ] Write `- [ ] test` in an ordinary note: no new epic in the Tasks panel. In **Show all tasks** it is under **Tasks in other notes** (folded).
- [ ] **Make an epic** on it: the note gets `tags: [epic]` (other properties are kept), and it is listed with the epics. Outside `Tasks/` it has no pencil or waste bin.
- [ ] **New epic** makes a note with `tags: [epic]` in its properties. A note in `Tasks/` from before (no tag) is under **Tasks in other notes**; **Make an epic** on each tags it.
- [ ] A meeting note: the agenda lines are not tasks and no epic is made. A task written under `## Notes` in it still shows up.
- [ ] A meeting without an agenda: the text is written under `## Notes`, with no `### Notes` heading.

## Tags on a note

- [ ] The **···** menu above a note: Rename… renames it (links are asked about as in the tree), History opens the history, Export… opens the export. **Tags…**: Meeting and Epic. Tick Epic on an ordinary note: it gets `tags: [epic]` in its properties, a chip shows, and it is listed with your epics. The cross takes it off again.
- [ ] Tick Meeting on any note: **Start meeting** shows. Take it off: it goes, also in the meetings folder.
- [ ] A note with other properties and its own `#tags`: only the `tags:` line changes. A note whose properties only held the tag gets no empty `---` block left behind.

## A note for a task

- [ ] Task page → **Linked note** → **Make a note for this task**: name is the task title, folder is the task note's folder. The note opens with the heading and a line `Task in [[…]]`. The task line gets `[[Name]]` after its title, before `#tags` and `due:`/`made:`.
- [ ] A small chip with the note's name shows in the task list, in Focus and on the task page; a click opens the note.
- [ ] **Link a note…** picks an existing note. The pencil changes it; the cross unlinks (the note stays).
- [ ] Rename the linked note in the tree: the link in the task line follows. Delete it: the chip is dimmed and says "Note missing"; on the task page **Make the note** makes it again.
- [ ] Rename the task title: the link stays. The link is not in the title anywhere.

## Meetings, Next meeting and Notes page

- [ ] Meetings: Upcoming and Past rows show date and time (`Thu 29 Oct 11:00`); today's rows show the time; a meeting without a time shows the date only. The time follows Settings → Time format.
- [ ] Start page → Next meeting lists today's and tomorrow's meetings to come with Start; none: "No meetings today or tomorrow." "Today's meetings" is not in Add widget.
- [ ] Close every note, then press Files: the Notes page with Recent and All notes shows; typing in Find a note narrows the list; a click opens the note. The house still opens the start page.

## Markdown in text boxes

- [ ] Task page → Note, epic page → Note, idea → Note, the meeting screen's notes, Quick note: type `**bold**` and move to another line: it shows bold; `- one` and Enter continue the list; Tab and Shift+Tab indent; Ctrl+B and Ctrl+I wrap the selection. A note box saves when you click away; Ctrl+Enter saves a quick note, an idea's note and the small note of a new task.
- [ ] Task page → "Write what happened": bold works, Enter adds the line, Shift+Enter writes nothing. Pencil on a log line: the same box; Esc cancels. The log, Focus and the meeting page show bold as bold.
- [ ] Titles, tasks, steps, names, the chat and the AI instructions are still plain one-line or plain text boxes.

## Tab, status, Meetings and the start page

- [ ] In a bullet list, **Tab** moves the item one level in, **Shift+Tab** out; a selection over several items moves them all; a numbered and a task item work too. **Enter** on an empty nested item takes it out one level; on an empty item at the left edge the list ends. A plain line with the caret at its start moves two spaces in and out; with the caret after some text, Tab puts a tab there and Shift+Tab takes it back; in a table cell Tab still moves between cells. The same in the meeting screen, the note box of a task, an epic and an idea, and the write-it-down box (there Tab no longer leaves the box: click away).
- [ ] A task with the status Doing, Waiting or Dropped shows a label at the right end of its row in Tasks and in an epic; a task without a status shows none. The status is still set on the task page.
- [ ] The **calendar clock** at the left edge opens Meetings. The calendar has a dot on the days with a meeting. Today lists the day's meetings with their time (no daily note); Upcoming and Past follow. A click on a day shows only that day; the cross shows everything again.
- [ ] A click on a meeting shows it in the middle: agenda (ticking an item changes `- [ ]` in the note), tasks from the note, notes under each item. **Start meeting**, **Prepare next…** and **Open the note** work. **+ New** opens the meeting window. A note without the tag Meeting is not listed, also in the meetings folder.
- [ ] The **house** opens the start page; so does closing the last note. **Continue** shows the last note with its first lines and **Open** opens it. Recent has the filters; **Show more** lists up to 20. **···** → **Pin to the start page** puts the note under Pinned (tag `pinned`); the cross on the start page unpins it. A new vault shows three buttons. Narrow the window: one column.
- [ ] **Settings → General → Open the start page when Mimer starts**: on, restart: the start page shows, not the last note. Off (default): the last note opens as before.
- [ ] **Settings → General → Time format**: choose 12-hour: the Meetings list, the meeting page, the Landing line and the start page write `2:30 PM`; the Time field of a new meeting shows `2:30 PM` and accepts `14:30`, `1430` and `2:30 pm`. Choose 24-hour: `14:30`. System follows the computer (24-hour on a Linux with a 24-hour language, AM/PM on a Windows with US settings).
- [ ] A new meeting has today in the Day field; it is listed under Today without picking a day. **Change…** on a meeting changes the day, time and people; the list and the Landing line follow. Clearing the day puts it under No date.
- [ ] A fenced block with no language whose first line is `graph TD` (or `sequenceDiagram`, …) is drawn as a diagram; a ```mermaid block still is; other code is not.
- [ ] The house: the start page fills the window: the left panel (whatever it showed), the right panel and its icon bar are gone and no icon is marked; pressing Files (or opening a note) brings them back as they were. **Delete** on a meeting asks, then removes the note (find it again in History / Recover deleted notes) and the list updates.
- [ ] Start page → **Customize**: each widget has up/down arrows, Half/Full and a cross; **Add widget** lists the widgets that are not on the page (each can be added once); **Reset** brings back Continue, Recent and Pinned; **Done** leaves. Restart: the layout is the same. Each widget works: Write it down saves a note, task or idea; Search and ask searches (Ask AI is off with a message when no AI is on); Next meeting starts a meeting; Working on opens a task; Areas opens each area; Epic progress opens an epic. A narrow window is one column.
- [ ] AI commands and skills that rewrite text: the answer or the proposed note starts with the text itself, never "Here’s the revised version:", and has no "Let me know…" at the end (try a small model).

## Preview, Stable and the website

- [ ] **Help → Check for new version…** opens the releases page in the browser, and **Help → About Mimer…** has the same link and says which edition this is. The status bar says `preview` after the version. Nothing is sent by Mimer (no network use at start).
- [ ] Preview: after installing a build made from a `-preview` tag the program is called **Mimer Preview**, and it can stand next to an installed Mimer. The first time it starts it has the same settings (vaults, theme) as the Stable one if there was one; changing a setting in Preview does not change Stable.
- [ ] A tag `v0.x.y` makes a pre-release (draft) with the installer, Linux packages and, until v1.0.0, the Store package; a tag such as `v1.1.0-preview.1` makes the "Mimer Preview" build with **no** Store package; neither needs approval. A tag `v1.0.0` waits for approval (GitHub → Actions → the run → **Review deployments**), then makes the release and the Store package. A tag that does not match `package.json` stops at the first step.
- [ ] The website (`https://jkielsgaard.github.io/Mimer/`) opens in light and dark and on a phone with no sideways scroll; the Preview card links to the releases page and the Stable card says it is not released yet.

## Meeting notes and parts

- [ ] **New → Meeting note…** has **Use in this meeting** with Agenda, Decisions and Actions all unticked the first time (they are options), and no agenda box. Tick Agenda: the agenda box shows. Tick Decisions and Actions too, untick Agenda, press Create: the note has `parts: [decisions, actions]` and no `## Agenda`. The dialog stays open while you tick and untick. The next new meeting starts with the same choice.
- [ ] **Start meeting**: at the top, **Use** has Agenda, Decisions and Actions: ticking one shows it at once (the note gets its section) and unticking hides it. The notes are one box in the middle. Click another agenda item: it is marked **Now** and the notes stay as they were. Tick an item, add an item. Add and remove a decision. Add an action: it appears in the note under `## Actions` as a task with a made date, and in **Tasks** (under Tasks in other notes or the epic you made). Tick it.
- [ ] A meeting without Agenda gives the notes the whole width; without Decisions or Actions those boxes are not shown. **Change…** on a meeting changes the parts; what was written in a part that is off is still in the note.
- [ ] An older meeting (made before this) opens with all three parts, its `### item` notes shown as text in the one notes box, and nothing lost. The Meetings page shows the parts the meeting has.

## Time picker

- [ ] In **New meeting** the Time box has a small arrow. A click on the arrow or in the box opens a list under it, every 15 minutes from 00:00 to 23:45, scrolled to the time in the box (09:00 when it is empty). Click a time: it is written in the box and the list closes. The window stays open.
- [ ] Arrow down opens the list and moves through it; Enter picks the marked time (without one, Enter creates the meeting as before); Esc closes only the list; a click outside closes it. Type `10:20`: it is kept (the nearest quarter is shaded); `1430` and `2:30 pm` still work; `25:00` is marked red and Create is off.
- [ ] With 12-hour time chosen in Settings, the list reads `9:15 AM` and the box `2:30 PM`; the note still stores `14:30`. **Change…** on a meeting has the same box.
