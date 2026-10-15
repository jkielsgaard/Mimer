# Manual test checklist

This is the checklist for everything automated tests cannot cover. It is also included in the README.
Keep it up to date: every milestone's acceptance criteria (see `CLAUDE.md` §14) must be covered here.

Tick each box as you go. **Run the whole list on Linux before each release and again on Windows 11 for release candidates.** Use a throw-away vault (an empty folder you create for testing) so nothing real is at risk. LM Studio items need a running LM Studio server (see [Set up LM Studio](#set-up-lm-studio)).

### 0. Automated checks (do these first)

- [ ] `pnpm check` finishes with no errors (format, lint, typecheck, frontend tests, `cargo fmt`, `cargo clippy`, Rust tests). On Bazzite/Silverblue, run it inside the development container: the host has no GTK/WebKit libraries for the Rust part.
- [ ] `pnpm tauri dev` opens the app window without errors in the terminal.
- [ ] The status bar (bottom right) shows `v0.7.0+<commit> beta`, for example `v0.7.0+63947f4` (`.dirty` at the end means the build has uncommitted changes). The same version is on the welcome screen and in **Settings → General**. Hover over the status bar version to see the build date and time; it must match when you started or built the app.

### 1. Vault and file tree (M1–M2)

- [ ] First start shows the Welcome screen with **Open folder as vault**, **Create new vault** and an empty recent list.
- [ ] **Create new vault** → pick a parent folder and a name → the vault opens. A `.git` folder, `.gitignore` (contains `.vault/index.db`) and `.vault/config.json` now exist in the new folder.
- [ ] The three columns (file tree · editor · right panel) can be resized by dragging, and collapsed/expanded with the two buttons in the top bar. After restarting the app the sizes are remembered.
- [ ] Create a note and a nested folder with a note in it (right-click in the tree → **New note** / **New folder**). They appear in the tree, folders first, sorted A–Z ignoring case; `.md` is hidden in names.
- [ ] Rename a note and a folder (right-click → **Rename**, or F2). Drag a note onto a folder to move it.
- [ ] Delete a note: the dialog says it can be restored from history. After deleting it is gone from the tree.
- [ ] In another program (file manager or text editor) create, edit and delete a `.md` file inside the vault. The tree updates by itself within a second or two.
- [ ] Close the app and start it again: it opens the last vault straight away. Start a second copy: the first window is brought to the front instead.
- [ ] Window size and position are remembered between runs.
- [ ] Files and folders starting with `.` (for example `.git`) never show up in the tree.

### 2. Editor and live preview (M3)

- [ ] A **Formatting** toolbar is shown above the note. With no note open its buttons are greyed out.
- [ ] Select a word and click **Bold**, **Italic**, **Strikethrough**, **Inline code**: the text is wrapped, the selection stays, and clicking again removes the marker.
- [ ] Put the cursor in a line and click **Heading 1/2/3**: the line becomes that heading; clicking the same heading again turns it back into normal text.
- [ ] Select three lines and click **Bullet list**, then **Numbered list**, then **Task list**: the lines switch type without stacking markers; clicking the active type removes it. **Quote** adds and removes `>`.
- [ ] **Link** with selected text makes `[text](url)` with `url` selected for typing; **Link to a note** opens the note list.
- [ ] **Insert table** adds an editable table; **Code block** wraps the selection in a fence; **Horizontal line** adds `---` (not a heading underline).
- [ ] Hover a button: the tooltip shows its name and, for bold, italic and table, the shortcut.
- [ ] After using a button you can keep typing immediately (the focus stays in the editor). With two panes open each pane has its own toolbar.

- [ ] Type `**bold**`, then move the cursor to another line: it renders **bold** and the `**` markers disappear. Put the cursor back on the line: the markers return.
- [ ] Headings (`#`…`######`), _italic_, ~~strikethrough~~, `inline code`, and `[links](https://example.com)` render styled with markers hidden off-line.
- [ ] A list with `- [ ] task` and `- [x] done` shows clickable checkboxes; clicking one toggles it in the text.
- [ ] Block quotes and fenced code blocks (` ` ```) get a styled background; code keeps its raw text.
- [ ] A `---` line becomes a horizontal rule when the cursor is elsewhere. Tables stay as raw text in monospace.
- [ ] A note starting with `---`, a few `key: value` lines and `---` shows a collapsed **Properties** bar; clicking it expands the raw YAML.
- [ ] Ctrl/Cmd+B and Ctrl/Cmd+I wrap the selection in bold / italic (press again to remove).
- [ ] Ctrl/Cmd+F opens in-note search.
- [ ] The status bar shows **Unsaved changes** while typing, **Saving…** briefly, then **Saved** about a second after you stop typing.
- [ ] Type some text, wait for **Saved**, quit and restart: the text is still there.
- [ ] Edit the open note in another program and save it (while the note has no unsaved changes in Mimer): Mimer silently shows the new text.
- [ ] Type in Mimer (do not wait for it to save) and quickly change the same file in another program: a banner "This note changed on disk" appears with **Keep my version** and **Load disk version**. Try both; in both cases `File → Version history` shows commits named `Snapshot before reload: …` so neither version is lost.

### 3. Git version history (M4)

Check with `git log --oneline` inside the vault folder (any Git client works).

- [ ] Ctrl/Cmd+S on a changed note creates a commit `Save: <path>`. Pressing it again without changes creates **no** commit (no empty commits ever).
- [ ] Open note A, edit it, click note B: a commit `Autosave: <A path>` appears.
- [ ] Edit a note and leave it alone for the idle time (default 5 min; set 1 minute in Settings → Version history to test): a commit `Autosave` appears.
- [ ] Edit a note, then close the app window: a commit `Autosave on close` appears and the window closes within 5 seconds.
- [ ] Open the vault after changing a file while Mimer was closed: a commit `Recovered uncommitted changes` appears.
- [ ] Right panel → **History** (or Ctrl/Cmd+Shift+H) lists the commits for the current note with relative dates, messages and short SHAs. Click one: a diff (old version → current) appears.
- [ ] **Restore this version** brings back the old text. History now has a `Snapshot before restore…` commit and a `Restore <path> to <sha>` commit; the version you replaced is still in history.
- [ ] Rename a note that already has history: its older commits are still listed in History (renames are followed).
- [ ] Delete a note, then **File → Recover deleted notes…**: the note is listed; **Restore** brings it back with its last content. `git log` shows `Snapshot before delete…` and `Delete <path>` before it.

### 4. Links, tags and attachments (M5)

- [ ] Typing `[[` opens a list of notes (fuzzy match on name and path). Picking one inserts `[[Note]]`.
- [ ] `[[Note]]`, `[[Note|alias]]`, `[[Note#Heading]]` and `[[Note#Heading|alias]]` all work; the brackets are hidden off-line and aliases show only the alias.
- [ ] Ctrl/Cmd+click on a link opens the note. A link to a note that does not exist is shown muted; clicking it creates the note and opens it.
- [ ] Wiki-links inside code blocks and inline code are **not** treated as links.
- [ ] Two notes with the same name in different folders: a plain `[[Name]]` goes to the one with the shortest path.
- [ ] `#tag` renders as a pill; clicking it opens a search for that tag. `tags: [a, b]` in the YAML also counts. `#123` and tags inside code do not.
- [ ] Rename a linked note: a dialog says "Update N links in M notes?". Choose **Update links**: the links in the other notes are rewritten (aliases and headings kept), and `git log` shows **one** commit `Rename <old> → <new>` containing everything.
- [ ] Move a note into another folder by drag and drop: same dialog, same single commit.
- [ ] Copy a screenshot to the clipboard and paste it into a note: a file `attachments/pasted-YYYYMMDD-HHMMSS.png` is created and the image shows inline. Paste a second one: a different file name.
- [ ] Drag an image file from your file manager into the editor: it is copied into `attachments/` and shown. Drag a PDF: a `[file.pdf](…)` link appears; Ctrl/Cmd+click opens it in the default PDF app.

### 5. Search (M6)

- [ ] Ctrl/Cmd+Shift+F opens the search tab and focuses the box. Typing part of a word (`firew` finds "firewall") shows results while you type, with matches highlighted.
- [ ] `tag:name` and `path:Folder` in the query narrow the results; combining them with words works.
- [ ] Search for odd input (`"`, `(`, `AND`, `*`): no error, no crash.
- [ ] Ctrl/Cmd+P opens quick open; typing a few letters of a file name finds it (fuzzy); Enter opens it.
- [ ] Generate a big test vault (`node scripts/gen-vault.mjs ~/mimer-test-1000 1000`), open it: the first indexing is quick, search results appear instantly (well under a tenth of a second), and typing in the editor stays smooth while indexing runs.
- [ ] Delete `.vault/index.db` while the app is closed and start again: the index is rebuilt automatically.

### 6. Settings and chat with LM Studio (M7)

- [ ] **File → Settings** (Ctrl/Cmd+,) shows five tabs: General, AI providers, AI, Version history, Vault.
- [ ] General: theme System/Light/Dark switches immediately after saving; font size, line width and spellcheck take effect.
- [ ] AI providers → **LM Studio** → **Test connection** says "Connected" and lists models. **Load models** fills the model suggestions; pick one and save.
- [ ] LM Studio's location cannot be changed (always local). Add an OpenAI-compatible provider with a non-localhost URL: it cannot be marked as Local.
- [ ] Saving an API key shows "Key stored"; the key is **not** written into `settings.json` (open it and check) — it is in the OS keychain.
- [ ] Open a note, open the **Assistant** tab (Ctrl/Cmd+L), ask "Summarize this note": the answer streams in word by word and uses the note's content. Untick **Include current note** and ask again: it no longer knows the note.
- [ ] While an answer is streaming, press **Stop**: it stops straight away.
- [ ] **New chat** clears the conversation. The header shows the provider and model; the status bar does too.
- [ ] Stop LM Studio's server and send a message: a clear error appears in the chat (not a crash).
- [ ] Set **Supports tools** off for the provider: the chat shows "This model does not support tools. Vault search and file changes are unavailable." and plain chat still works.

### 7. Inline AI commands (M8)

- [ ] Select a paragraph with spelling mistakes, press Ctrl/Cmd+K (or right-click): a menu with Fix spelling and grammar, Rewrite clearer, Shorten, Expand, Restructure as list, Custom… appears.
- [ ] **Fix spelling and grammar** shows a diff (old vs new). **Retry** asks again; **Reject** (or Esc) changes nothing.
- [ ] **Accept** (or Enter) replaces the selected text. `git log` shows `Snapshot before AI: …` and then `AI: Fix spelling and grammar in <path>`.
- [ ] **Custom…** with an instruction (for example "translate to Danish") works.
- [ ] If the model wraps its answer in a code block, the fence is removed before it is shown.

### 8. Projects (M9)

- [ ] **New → Project…**: a window asks for Name, Instructions and AI provider (local providers only). Save: a new folder with that name appears in the vault root, listed under Projects with a project icon; `.vault/projects/<id>.json` exists and was committed (`Project: <name> updated`).
- [ ] There is no **Make project** on any folder, and a project cannot be made inside a folder (see section 38).
- [ ] With a note from the project open, the chat header and status bar show the project name.
- [ ] Put an instruction such as "Always answer in French" in the project: the assistant's answers visibly change for notes in that folder, and not for notes outside it.
- [ ] In the project dialog, type "Make these instructions stricter about formatting" and press **Ask AI**: a diff of the proposed instructions appears. **Reject** leaves the field alone; **Accept** replaces the text; nothing is saved until you press **Save**.
- [ ] Rename or move a project folder in the tree: the project keeps working (its folder path is updated in the same commit).
- [ ] A cloud provider cannot be chosen for Mimer: in Settings → AI the Mimer provider list has local providers only, and an old project that pointed at a cloud provider uses the default.
- [ ] Set a cloud provider as the global default, then make a new project: a prompt offers **Lock to local AI** / **Use global default**.

### 9. Agent and proposals (M10)

- [ ] In a note with several headings, ask: "Split this note into one note per heading and link them from an index note." A card **Review N proposed changes** appears when the answer is done. Nothing has been written to disk yet (check the folder).
- [ ] The review window lists every file with an Edit / Create / Move / Delete badge, the path, the reason, and an expandable diff. Each file has **Accept / Reject** (default Accept).
- [ ] Reject one of the new notes, press **Apply selected**: only the accepted files are written. `git log` shows `Snapshot before AI: …` then one `AI: <summary>` commit.
- [ ] Undo the whole thing from History (restore the old versions / recover deleted notes): everything is recoverable.
- [ ] **Reject all** closes the review and writes nothing.
- [ ] Open a proposal, then edit one of the affected files in another program before applying: the file is marked **Changed since proposal** and **Apply selected** stays disabled until you tick "I have checked it".
- [ ] If the open note is changed by an applied proposal, the editor shows the new content right away.
- [ ] Ask the assistant to read a file outside the project folder (for a project chat): it reports that it cannot access it; nothing outside the project is read or changed.
- [ ] Tool activity lines appear in the chat ("Searched notes for 'firewall'", "Read Work/Policy.md").

### 10. Cloud providers (M11) — only if you have an API key

- [ ] Add an Anthropic provider, store the key, test the connection (models are listed), choose a model.
- [ ] Add an OpenAI-compatible cloud provider the same way.
- [ ] Add a cloud provider and choose it as Raven's provider: the Raven tab appears and chat works there (see section 35). Mimer itself keeps using the local provider.

### 11. Safety and robustness

- [ ] In a note, try a link like `[x](../../outside.txt)`: Ctrl/Cmd+click does not open anything outside the vault.
- [ ] Kill the app (`kill -9` / End task) while the status bar shows **Unsaved changes**: at most the last second of typing is lost; on the next start the vault opens normally.
- [ ] Put a vault on a folder with a symbolic link that points outside it: files behind the link are not shown and cannot be reached.
- [ ] Edit `settings.json` and set `"schemaVersion": 99`: the app shows "Settings could not be loaded" and does **not** overwrite the file. (Restore it afterwards.)
- [ ] Open a vault that already is a Git repository with its own history: Mimer keeps working in it and only ever adds commits (check `git log`: old commits unchanged).

### 12. Packaging (M12) — Windows 11

- [ ] The `…-setup.exe` installer from the release installs **without** an administrator prompt, for the current user only.
- [ ] The app starts from the Start menu and works with LM Studio running on the same machine (Settings → AI providers → Test connection).
- [ ] Windows: images pasted into notes display; opening a note's folder with **Reveal in file manager** opens Explorer.
- [ ] Uninstall via Windows Settings → Apps removes the app; your vault folders are untouched.
- [ ] Linux: the `.AppImage` starts.

### 13. Tabs and split view

- [ ] Click two notes in the tree: two tabs appear; clicking a tab switches to it.
- [ ] Switching from a changed note creates `Autosave: <path>` in `git log`; switching from an unchanged note creates nothing.
- [ ] Open a note that is already open: no duplicate tab is created.
- [ ] Close a tab with `×`, with middle-click and with `Ctrl/Cmd+W`; the neighbouring tab becomes active.
- [ ] `Ctrl/Cmd+PageDown` / `Ctrl/Cmd+PageUp` cycle through the tabs of the focused pane.
- [ ] `Ctrl/Cmd+\` with two tabs open splits the view; the active note moves to the right pane. Pressing it again merges the panes. With one tab it shows "Open another note first".
- [ ] Right-click a note in the tree → **Open in split view** opens it in the second pane.
- [ ] Click in each pane: the status bar and the right panel follow the focused pane.
- [ ] Rename an open note: its tab shows the new name. Delete an open note: its tab closes.
- [ ] Undo (`Ctrl/Cmd+Z`) still works in a note after switching away and back.
- [ ] Quit with two tabs and a split, restart: the same tabs and split are restored.
- [ ] Close the window with unsaved text in both panes: both are saved.

### 14. Templates and daily notes

- [ ] Open a note → **File → Save current note as template…** → name it "Meeting". `git log` shows `Template: added Meeting`. The template is not visible in the file tree.
- [ ] A template containing `# {{title}}` and `{{date:%d %B %Y}}`: **File → New note from template…** → pick it, name the note "Kickoff": the note contains `# Kickoff` and today's date written out.
- [ ] Creating a note with a name that already exists shows an error and keeps the dialog open.
- [ ] `Ctrl/Cmd+Shift+D` creates `Daily/<today>.md` and opens it. Pressing it again opens the same note without changing your text.
- [ ] **Settings → Vault**: set a daily template, delete today's daily note, press `Ctrl/Cmd+Shift+D`: the new note uses the template. Delete the template file in `.vault/templates/` by hand: the shortcut still creates an empty note.
- [ ] Settings → Vault: a folder such as `../outside` is rejected.

### 15. Table editor

- [ ] Type a Markdown table (header row, `---` row, body rows), then move the cursor below it: it shows as a table with a bold header.
- [ ] Click a cell, change the text, click elsewhere: the Markdown is updated and aligned.
- [ ] `Tab` moves right, `Shift+Tab` moves left, `Enter` moves down. `Tab` in the last cell adds a row.
- [ ] Toolbar buttons (Row ↑, Row ↓, −Row, Col ←, Col →, −Col, Left/Center/Right) change the table as described.
- [ ] `Ctrl/Cmd+Alt+T` inserts a 3×2 table on its own line.
- [ ] A half-typed table (no `---` row yet) stays as plain text until it is valid.
- [ ] A table inside a fenced code block is not turned into a widget.

### 16. Chat history and saved prompts

- [ ] Send two messages, restart the app, open **History** in the Assistant tab: the chat is listed; opening it restores both messages.
- [ ] `git status` does not list `.vault/chats/`, and chatting creates no commit.
- [ ] **New chat** starts an empty conversation; the old one stays in History.
- [ ] Delete one chat from History. **Delete all history…** asks for confirmation and removes everything.
- [ ] Open a different vault: its chat list is empty or shows only its own chats.
- [ ] **Prompts → Save current text as prompt…** saves the text (`git log` shows `Prompts: added "…"`). Clicking the prompt inserts it into the message box. Removing it creates `Prompts: removed "…"`.

### 17. Export

Prepare a note with a heading, bold text, a table, a task list, a code block, an image (`![[pic.png]]`), a `[[link]]`, an `https://` link and raw HTML such as `<b>x</b><script>alert(1)</script>`.

- [ ] **Export → HTML**: open the file in a browser. Images show, the `[[link]]` is plain text, the raw HTML is visible as text and **no dialog appears**.
- [ ] **Export → Word**: open it in Word or LibreOffice. Headings, bold, table, list, code and images are present; the https link is clickable.
- [ ] **Export → PDF**: the preview appears; **Print / Save as PDF** opens the system print dialog; the PDF contains only the note.
- [ ] Right-click a folder → Export → HTML with table of contents: one document; the contents links jump to each note.
- [ ] Cancel the save dialog: nothing is written and no error appears.
- [ ] Exporting creates no commit and leaves `git status` clean.

### 18. Semantic search (needs LM Studio with an embedding model loaded)

- [ ] Settings → AI → Semantic search: enable it, choose LM Studio, load the models, pick the embedding model, Save. The status shows indexing progress, then the note and chunk counts.
- [ ] In the search panel the **Keyword / Meaning / Both** buttons appear. A phrase that appears in no note but describes one (for example "stolen computer" for a note about lost laptops) is found by **Meaning** and **Both**, not by **Keyword**.
- [ ] `tag:` or `path:` in the search box still uses keyword search.
- [ ] Edit a note, wait a few seconds, search for the new text by meaning: it is found. Typing stays smooth during indexing.
- [ ] Stop LM Studio's server and search by meaning: a message says semantic search is unavailable and keyword results are still shown.
- [ ] Assistant: "What do our notes say about losing a laptop?" shows the line "Searched by meaning for …" and answers from the notes.
- [ ] Privacy: only local providers are listed as embedding providers, so no note is sent to a cloud service.
- [ ] `.vault/embeddings.db` is ignored by Git (`git status` clean).

### 19. Mimer, the assistant's identity

- [ ] The right panel tab, the message box and the answer bubbles say **Mimer**.
- [ ] Ask "who are you?": the answer says Mimer, mentions the well of wisdom under Yggdrasil in a short playful way, and offers to help with the notes. Ask in Danish: the answer is in Danish.
- [ ] Ask a normal task ("summarise this note"): Mimer does not repeat the introduction.
- [ ] Settings → AI shows the default base instruction. Edit it ("You are Mimer, a strict editor…"), save, ask again: the new behaviour shows. **Reset to default** restores the original.
- [ ] Delete the "Who you are" section, save, ask "who are you?": Mimer answers plainly as a notes AI, without the myth.
- [ ] Empty the field and save: Mimer still refuses to write files directly and still proposes changes for review.

### 20. Attach notes with /

- [ ] Type `/` in the Mimer message box: a list of notes opens. Type a few letters: it narrows. Enter or Tab adds a chip and removes the typed text. Esc closes the list.
- [ ] The paperclip button opens the same list.
- [ ] Attach two notes and ask "merge these into one summary": Mimer uses both; a proposal appears and nothing is written until you apply it.
- [ ] Remove a chip with ×: it is no longer used. Attaching a sixth note shows a message.
- [ ] In a project, only notes inside the project folder are offered.
- [ ] Typing a date (`1/2`) or a URL does not open the list.
- [ ] Reopen the chat from History: the chips are shown on the earlier message.

### 21. Progress while Mimer works

- [ ] Send a message with LM Studio stopped: an error appears quickly, not an endless spinner.
- [ ] With a slow or just-started model the line shows "waiting for the model…" with a counting timer, and after 15 s a hint that a local model may be loading. **Stop** works.
- [ ] Ask "split this note into one note per heading": the line shows "Step 2 of 15", "Reading …" and so on, and ends with a review card.
- [ ] Switch to the Files tab during an answer: the status bar says "Mimer is working…" and the Mimer tab has a dot.
- [ ] When the answer is done the progress line disappears; a reopened chat shows no progress text.
- [ ] Inline AI (Ctrl/Cmd+K) shows a timer next to its spinner.

### 22. Import notes from a folder

- [ ] Make a small test folder (or export a small OneNote notebook following [docs/IMPORT-ONENOTE.md](docs/IMPORT-ONENOTE.md)) and use **File → Import notes from folder…** in a throw-away vault: the preview counts match the folder, and hidden files and unsupported files appear under "Left out".
- [ ] Import: a progress bar runs, then the report. The notes open, images show, and `[[links]]` that point inside the import work.
- [ ] Import the same folder again: the copies get a number (` 1`) and nothing is overwritten.
- [ ] History shows `Import: … notes from "…"`, and `Snapshot before import…` if you had unsaved work. Restoring from History works.
- [ ] Choose a folder inside the vault: a message says to pick a folder outside it.
- [ ] Cancel during a larger import: the vault is clean and the commit says "(cancelled)".
- [ ] The folder you imported from is unchanged.

### 23. Start screen, About and icon

- [ ] When the app starts, the Mimer picture is shown for about two seconds with the version, then fades. A click or any key skips the wait.
- [ ] **File → About Mimer…** shows the picture, the version and build date, a text about the app and the idea behind it, and "Developed by Jesper Ahasverusen Kielsgaard". Esc closes it.
- [ ] The welcome screen (no vault open) has the Mimer picture as background and an **About** link.
- [ ] The window, taskbar and installer use the new "M" icon (check on Windows after installing).

### 24. Formatting toolbar

- [ ] See section 2: the toolbar checks are listed there.

### 25. Merging notes with Mimer

- [ ] Make three small notes. Ask Mimer: "merge these three notes into one note called Summary and remove the old ones" (attach them with `/`). The review card shows **one new note and three deletions**.
- [ ] Reject one deletion and apply: the new note and the other two deletions happen, the rejected note stays. History shows one `AI:` commit and a snapshot before it.
- [ ] Mimer does not ask in the chat whether it may delete; it proposes the deletions.
- [ ] Merging into one of the source notes edits it and deletes the others.
- [ ] After the answer, ask "now delete the old ones" in a new message: Mimer knows which notes it meant.

### 26. Meeting notes, quick notes and standard templates

- [ ] Create a new vault: it has the folders `Meetings` and `Quick notes`, and `.vault/templates/` has `Meeting.md` and `Quick note.md`. History shows `Template: standard templates`.
- [ ] The tree toolbar has a meeting button and a quick-note button. Meeting asks for a title and makes `Meetings/<date> <title>.md` from the template. Quick note makes `Quick notes/<date> <hh-mm>.md` at once and opens it.
- [ ] Making the same meeting title twice gives `… 2`. Two quick notes in the same minute do not clash.
- [ ] Edit the Meeting template, press **Settings → Vault → Add standard folders and templates**: your edit is not overwritten.
- [ ] Change the folders in Settings → Vault: new notes go there.

### 27. Switching vaults

- [ ] The vault name in the header opens a list of recent vaults; the open one has a check mark. Pick another: it opens, the tabs of that vault come back, and the chat history is that vault's.
- [ ] `Ctrl/Cmd+Shift+O` opens the list. **Open another folder as vault…** and **Create new vault…** work.
- [ ] Type in a note and switch at once: the text is saved and the old vault gets an autosave commit.

### 28. Index pages and links

- [ ] Right-click a folder → **Create index page**: `<Folder> index.md` opens with a link to every note and sub-folder. Clicking a link opens the note.
- [ ] Add your own text above the list, add a note to the folder, create the index again: the list is updated and your text is still there. A second run without changes makes no new commit.
- [ ] Right-click an empty area of the tree → **Create index page for the whole vault**.
- [ ] In a note, select a word and press the **Link to a note** button (or `Ctrl/Cmd+Shift+K`): a search opens with the word filled in. Pick a note: `[[Note|word]]` is inserted. A note name that exists in two folders is linked by path.
- [ ] Type a name that does not exist: the last row offers a link to a new note; clicking the link later creates it.

### 29. How-to guide and hints

- [ ] The **?** button in the top bar, **File → How to use Mimer** and **F1** open the guide (F1 and the link at the bottom of the welcome screen also work there). The list has fourteen topics; the search box narrows it ("paperclip" finds _Mimer, the assistant_).
- [ ] Choosing a topic shows its text with tables and lists. Esc closes the guide.
- [ ] Point at a **?** (settings, chat "Include current note", search modes, Images tab, import dialog, toolbar, file tree): a bubble explains it. It also opens with the keyboard (Tab to it) and by clicking, and Esc closes it.
- [ ] **Read more in the guide** in a bubble opens the guide at the right topic.

### 30. A new note is named by its title (replaced in 0.7.1, see section 36)

- [ ] Press `Ctrl/Cmd+N`: a new note opens with the cursor after `# `. Type a title and pause: within about three seconds the file in the tree has that name. The cursor stays where it was.
- [ ] **Name follows title** shows above the note. Click it: the name stays when you change the heading.
- [ ] Make two notes with the same title: the second is called `… 2`.
- [ ] Rename a new note yourself in the tree: it never changes name again.
- [ ] A meeting note, a daily note or a note made with a name keep their names.
- [ ] History does not fill with `Rename` entries while you type a title.

### 31. Pictures

- [ ] **Insert image** in the toolbar: choose two pictures; both appear and are copied into `attachments/`. Choosing the same file again gives `-1`.
- [ ] Paste a screenshot and drag a picture file into a note: both work. Drag a picture and a note from the file tree into a note: a picture and a `[[link]]` appear.
- [ ] Point at a picture: a **Small / Medium / Large / Original** bar appears. Choosing a size changes the picture and the text (`|400`).
- [ ] Settings → Vault → **Insert images as** → short name: new pictures are written as `![[name.png]]` and show the same.
- [ ] **Images** tab: every picture is listed with the notes that use it; **Unused only** shows the rest; **Move to trash** asks first, and History can bring the picture back.

### 32. The file panel

- [ ] **New** menu: Note, Meeting note…, Quick note, Folder…, Project… all work. A project cannot be made inside a project.
- [ ] The filter box narrows the tree while you type; Esc clears it. **Collapse all** closes every folder. **Show the open note** finds the open note in the tree. **Sort** by Last changed puts the newest note first.
- [ ] Folders show how many notes they hold; there are no lock icons on projects.
- [ ] **Recent** lists the notes you opened last; **Projects** lists projects, and clicking one finds its folder. Both can be folded and remember it.
- [ ] A breadcrumb above the note shows `Project › Folder › Note`; clicking a folder shows it in the tree.

### 33. Folders, tasks and projects

- [ ] Type `/` in the message to Mimer: folders are in the list with a folder icon and a note count. Pick one: a chip with a folder icon appears. Ask "List the notes you were given": they are the notes in that folder.
- [ ] Pick a folder with more than 12 notes: Mimer says only their names were attached.
- [ ] Attach that folder and ask Mimer to "structure and sort it into folders": it lists the notes once, then proposes the moves (Review shows Move proposals into new folders). It does not ask which note to start with, and it does not say it has already moved anything. Apply: the folders exist and links still work.
- [ ] In a project, `/` offers only the project folder and what is inside it.
- [ ] **Tasks** over the message box lists ten tasks. Choosing one fills the box; you can edit the text before sending. "Merge notes" with three notes attached gives one review with a new note and three deletions.
- [ ] A project is not in **All files**. It is under **Projects** with its notes, a **+** button and a gear. Click it to fold and open it; the choice is remembered after a restart.
- [ ] **+** next to a project makes a new note inside the project folder. Right-click in the project's tree: New note, New folder, Create index page.
- [ ] Drag a note from All files onto the project: it moves into the project folder (one commit `Rename … → …`, links updated). Drag it back to All files.
- [ ] Drag a project onto another project: refused with "A project cannot be inside another project."
- [ ] A note outside the project links to a note in the project (`[[Name]]`) and back: both links open the note, in the editor.
- [ ] The filter box finds notes inside a project and hides projects with no match.
- [ ] **Recent** lists 4 notes. Settings → General → **Recent notes shown**: 2 shows two, 0 hides the section, 20 is the most.
- [ ] **Meetings** and **Quick notes** are the first two folders in All files, even when other folders sort before them.

- [ ] The attachments folder is not in All files. In the **Images** tab, clicking a picture or its name opens it. Right-click a project: the menu has the same choices as a folder in All files.
- [ ] Right-click in the empty file panel or the status bar: only **Inspect element** appears (no Reload). In the note and in text boxes the normal menu stays. The Backlinks tab is gone.

- [ ] Images tab: click a picture: it opens large in Mimer (Esc closes). Click a picture inside a note: same. **Open in another app** opens it outside Mimer.
- [ ] Click in a note, switch to the Images tab, press **Insert in note** under a picture from another note's folder: the link has the right relative path and the picture shows. Dragging the thumbnail into the note does the same. With no note clicked in, a hint appears.

- [ ] Ctrl/Cmd+click three items in the file tree (one in a project): all are highlighted and nothing opens. Shift+click ticks a range. Esc or a plain click clears it.
- [ ] Right-click a ticked item: **Move 3 items to…** moves them to the chosen folder in one go (links updated, no question per item). **Delete 3 items** asks once; the notes come back with File → Recover deleted notes.
- [ ] Drag one ticked item onto a folder or a project: all ticked items move. A project dragged into another project is refused.

- [ ] Sort button → **My own order**. Drag a note to the top edge of another note: a line shows where it lands, and it goes there. Drag a folder between two notes (top or bottom edge): it goes there. The middle of a folder still moves the item into it.
- [ ] Right-click → **Move up / Move down**, and Alt+Up / Alt+Down, move an item one place. This works inside a project too.
- [ ] Restart the app: the order is still there. `.vault/order.json` exists. Rename a note in the middle: it keeps its place. Create a new note: it is last. Switch to Name: the list is sorted again; switch back: your order returns.
- [ ] With **My own order**, Meetings and Quick notes are not forced to the top.

### 34. Research prompts

- [ ] **File → Write a research prompt…**: enter a topic only, choose "Write the prompt". The prompt names the topic and today's date, and ends with an exact output format (front matter, Summary, Sources, Open questions). **Copy prompt** puts it on the clipboard.
- [ ] Ask Mimer "Write documentation about the Linux firewalld basics" with **Let Mimer write new content from its own knowledge** off: Mimer does not write the document; a prompt card appears with **Copy prompt** and **Import the answer**.
- [ ] Turn the setting on and ask again: Mimer may write the text, and says it comes from memory.
- [ ] Paste the prompt in a cloud AI with internet access. Copy its answer. **Tasks → Import an answer from a cloud AI…**: paste. The title is filled in; with no sources a warning is shown. **Save as note**: a new note opens with `status: needs review`. Importing the same title again gives `… 2`; nothing is overwritten.
- [ ] An answer wrapped in a code fence, or with a sentence before it, is imported without the fence and the sentence.
- [ ] With Raven on, the prompt card has **Send to Raven**: it fills Raven's message box and does not send.

### 35. Raven and local-only notes

- [ ] Settings → AI: the **Mimer's provider** list has no cloud provider (also not an LM Studio provider with a non-local address). **Raven's provider** lists the cloud providers and **Off**.
- [ ] An existing settings file whose default provider was a cloud provider: after the update, Mimer uses a local provider and the old cloud provider is Raven's.
- [ ] Raven **Off**: there is no Raven tab. Choose a cloud provider and Save: the tab appears next to Mimer.
- [ ] Both tabs show a line at the top: "Local AI · your notes stay on this computer" (Mimer) and "Cloud AI · no access to your notes" with "What you type here is sent to <provider>." (Raven).
- [ ] The first time in Raven a notice appears; the message box is locked until **I understand**; it does not come back.
- [ ] Ask Raven about your own notes: it says it cannot see them. There is no attach button, no `/` picker and no "include current note" in Raven.
- [ ] **Save as note** under an answer makes a note with `source: raven` and `status: needs review`. Attach it to Mimer with `/` and ask about it.
- [ ] Stop and **New chat** work in Raven. A cloud answer streams word by word.
- [ ] Project settings have no "Local AI only"; an old project file with `"localOnly": true` still opens.
- [ ] Inline AI (`Ctrl/Cmd+K`) and the project dialog's **Ask AI** use the local provider.
- [ ] Network check: while you chat with Mimer, nothing goes to a cloud host; Raven only talks to its own provider.

### 36. Names and name clashes (0.7.1)

- [ ] `Ctrl/Cmd+N`, **New → Note**, and right-click a folder → **New note** all open the same "New note" window, asking for a name. It starts as `Untitled` (or `Untitled 1` when that exists).
- [ ] **Create** opens the note with `# <name>` as its first line, and the file has that name. Nothing is renamed while you type.
- [ ] Type the name of an existing note in the same folder (also in other upper/lower case, for example `plan` for `Plan`): a red box says "A note called “Plan” already exists in “Work”. Choose another name." while you type, and **Create** is greyed out. Enter does nothing.
- [ ] The same in the vault root, and for **New folder**, **New → Project…** and **Rename**. A folder `Docs` and a note `Docs` also clash. Renaming `plan` to `Plan` (only the case) works.
- [ ] **New → Project…** with a name that another project already has: the project window says so and **Save** is greyed out.
- [ ] Drag a note onto a folder that already has a note with that name: a window opens that you have to close (OK), saying what exists where. Nothing moved.
- [ ] Tick three items, **Move to…** a folder where two of them clash: the third is moved, and one window lists the two clashes.
- [ ] A vault that already has `Docs` and `docs` still opens; the clash is only checked when you create, rename or move.

### 37. The built-in AI (0.8.0)

Run on each combination you can. Only Linux with an AMD graphics card (Vulkan) has been run by the developer; **the rest are untested and need a real machine**: Windows (all of it), Nvidia (CUDA), Intel (Vulkan, SYCL), AMD on Windows, AMD ROCm, and an Intel processor.

- [ ] **Settings → Built-in AI** shows what was found (processor, memory, graphics card) and pre-selects the processor, the graphics card and the engine. Choosing another graphics card picks its default engine (Nvidia → CUDA 12, AMD/Intel → Vulkan, none → CPU only); advanced engines are under "Advanced".
- [ ] Pick a model: the size and the memory it needs are shown; a computer with too little memory gets a yellow warning.
- [ ] **Download**: progress with percentage and sizes for the engine, then the model. **Cancel**, then Download again continues where it stopped. After it finishes, the built-in AI is Mimer's provider (when the box was ticked) and the status says "Mimer is asleep".
- [ ] Disconnect the network during a download: a red box explains it and says to press Download again; reconnect and it continues.
- [ ] The Mimer tab shows a bar: asleep → **Wake Mimer**. The message box says "Wake Mimer to start chatting" and is locked. **Wake Mimer** shows "Loading the model into memory… N s", then "Mimer is awake" and the box opens. Ask a question: it streams an answer. Ask for an edit: a proposal appears (tool calls work).
- [ ] **Sleep Mimer**: the memory is freed (check Task Manager or `top`: no `llama-server`), the box locks again.
- [ ] Close Mimer while awake: `llama-server` is gone. Wake, then kill Mimer (`kill -9` or End task): `llama-server` is gone within a moment. Windows: also check after a crash.
- [ ] Change the context size while awake: the bar says to sleep and wake. Wake again: the new size is used.
- [ ] Set **Sleep after** to 1 minute, wake, do nothing: Mimer goes to sleep by itself.
- [ ] Problems: set the context size to 131072 with the 26B model on a small computer, wake: a red box says there is not enough memory, with steps and the engine's last lines under **Show details**; **Copy details** works. Choose a graphics engine on a computer without the driver: the box says to update the driver or choose CPU only.
- [ ] Break the model file (cut it shorter): the settings show it as not downloaded and Download fetches it again with a checksum check.
- [ ] **Add my own model file…** copies a `.gguf` into the folder and selects it; it is listed as "your own file".
- [ ] **Remove** a model, the engine, and all files (with a confirmation): the folder shown in the settings is cleaned. The built-in AI sleeps first.
- [ ] Windows: after installing, the files are in `%LOCALAPPDATA%\Mimer\mimer-ai`. **Uninstall Mimer** while awake: the folder is gone, `llama-server.exe` is not running. Linux: the files are in `~/.local/share/dk.mdvault.app/mimer-ai`.
- [ ] Nothing from the built-in AI is reachable from outside: `curl http://127.0.0.1:<port>/v1/models` without a key is refused, and the port is not open on the network address.
- [ ] LM Studio still works as before when it is the chosen provider, and no Wake bar is shown then.

### 38. Projects in the vault root (0.8.0)

- [ ] **New → Project…** with a folder selected (for example `Work`): the new project's folder is made in the **vault root**, not inside `Work`.
- [ ] Make a folder `Test`, then try **New → Project…** with the name `test`: a red message says a folder called “Test” already exists in the vault root, and **Save** is greyed out. The same with a note called `Test`.
- [ ] Right-click a folder: there is no **Make project**. A project cannot be made from an existing folder.
- [ ] Drag a project onto a folder: a dialog says a project stays in the vault root. Nothing moved.
- [ ] Rename a project's folder: the project follows (also its name when it matched). Drag notes and folders onto the project: they move into it.
- [ ] A vault with a project made in an older version inside a folder still opens, and the project still works. It can be moved to the root.

### 39. The Microsoft Store package (0.8.1)

Needs Windows (a virtual machine or Windows Sandbox). See docs/MSIX.md.

- [ ] `Build-Msix.ps1 -Version 0.8.1 -TestSign` runs without errors and makes `Mimer_0.8.1.0_x64.msix`, the `_test.msix`, `mimer-test.cer` and `Install-TestMsix.ps1` in `msix-out`.
- [ ] Windows Sandbox: edit `HostFolder` in `mimer-sandbox.wsb`, double-click it. Mimer is installed and starts from the Start menu, with the new icon.
- [ ] In the Store build: open a folder as a vault, write and save a note (`Ctrl+S`), check **History**, and restart Mimer: the settings and the recent vaults are kept.
- [ ] **Settings → Built-in AI** says that the built-in AI is not available in the Store version, and the Mimer tab bar says so too. LM Studio (if installed in the sandbox or reachable) works as the AI.
- [ ] Uninstall from Windows Settings → Apps: Mimer is gone, and the notes folder you opened is untouched.
- [ ] The workflow's `mimer-msix` artifact contains the unsigned `Mimer_<version>_x64.msix` after a tag is built.
- [ ] The Microsoft Store app opens on the computer where you want to use Mimer (an organisation may block it).

## 40. Source view, pictures in the tree, reporting (0.8.5)

- [ ] Click the **</>** button in the editor toolbar: the note shows `#`, `**`, `[[...]]` as typed, in a monospace font. Click the eye: formatted again. **Ctrl+Alt+M** and **File → Show Markdown source** do the same. Restart Mimer: the choice is remembered. Edit in source view and switch back: nothing is lost.
- [ ] With several tabs open, switch the mode and then to another tab: it shows in the same mode and has its text.
- [ ] Import a folder that has notes and pictures (for example a `images` folder): the notes are in the file tree, the pictures are **not**, and a folder with only pictures is not shown. The **Images** tab lists the pictures, and they are still shown inside the notes. Do the same inside a project.
- [ ] **File → Report a bug…** opens GitHub with the bug form, version and system filled in. **File → Suggest a feature…** opens the feature form.
