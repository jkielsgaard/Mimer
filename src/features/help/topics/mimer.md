## Meet Mimer

**Mimer** is the assistant on the right. It helps you write, correct, restructure and find things in your notes. Type a question or a task in the box and press **Enter**.

**Mimer only proposes changes. Nothing is written until you accept it.**

## Tell Mimer which notes to work on

- Keep **Include current note** ticked to let Mimer see the note you have open.
- Type **/** in the message box and pick a note, or click the **paperclip**. The note becomes a chip above the box. Attach up to five notes. Remove one with the **×**.
- You can also attach a **whole folder or project**: folders are in the same list, with a folder icon and a note count. Mimer then works on the notes in it. A folder of up to 12 notes is attached with its text (each shortened if very long). A bigger folder is attached as a list of its note names only, and Mimer reads the notes it needs. To sort a big folder, attach it and ask Mimer to organise it: Mimer proposes the moves (new folders are made by moving notes into them), and you apply them in the review.
- In a project, only notes inside the project are offered.

## Review what Mimer proposes

When Mimer wants to change files you get a **Review changes** card. Open it to see every file, what changes, and why. Accept or reject each file, then **Apply selected**. Before anything is applied Mimer saves a snapshot, and afterwards all changes are one entry in the history, so everything can be undone.

Ask Mimer for bigger jobs too, for example:

- "Merge these three notes into one called Summary and remove the old ones." The review shows one new note and three deletions.
- "Split this note into one note per heading and link them from an index."

## While Mimer works

You see what it is doing: waiting for the model, writing, or reading a note, and **Step 3 of 15** for longer tasks. A local model can be slow to load; after a quiet moment Mimer tells you. Press **Stop** at any time.

## Skills

A small model often answers in the chat instead of changing your notes. A **skill** takes that choice away: Mimer does the work itself, one note at a time, and the model only writes the text for each step. You still review every change before anything is written.

1. Attach the notes or a folder with `/` (or open a note).
2. Press **Skills** over the message box and choose one, for example **Fix spelling and grammar**, **Improve the structure**, **Sort into folders** or **Summarise**.
3. Add extra instructions if you want (for example "keep British spelling"), then press Enter.

**Fix small mistakes** works differently from the rest: the AI only sends back the words that are wrong, and Mimer puts them in. Nothing else in the note can change.

**Mimer checks every change** before you see it: are the links, tags, numbers and dates, names, properties and code the same, did a part go missing, did the AI add words of its own in front? A change that fails a check is still shown, but it is not selected in the review and the review says why.

**Long runs start with three notes.** When a skill works on more than five notes, Mimer does the first three and stops. Look at those changes; press **Looks good, do the other …** to go on, or **Not right, change the skill**.

A run handles up to 50 notes when changing text, 300 when sorting and 30 when writing one note from many; Mimer says if more were chosen.

You can also right-click a note or a folder in the file tree and choose **AI**: the menu lists the skills that fit what you clicked and starts one at once. A skill needs a local AI that is running (the built-in AI awake, or LM Studio started); otherwise Mimer says what to start.

Make your own in **Settings → Skills** in two steps:

1. **Say what it should do** in your own words, for example "Translate my meeting notes to English and keep the names", and choose what should happen to the notes: fix small mistakes, change the text, move them into folders, make one new note, or just answer in the chat.
2. **Try it on a note.** You see the note before and after and Mimer's checks. Nothing is changed. If it looks right, give it a name and save it.

Your skills are kept with your settings and work in every vault.

## New facts: use a cloud AI with internet

Mimer has no internet access and only knows what it learned in training, so it can be out of date or wrong. By default it **does not write new facts** for you. It works with what is in your notes: structure, merging, correcting, summarising, linking.

When you need new documentation about a subject, ask Mimer for it, or choose **Skills → Write a research prompt…**. Mimer writes a prompt for a cloud AI that can search the web. The prompt also tells that AI how to answer (title, sections, sources with links, open questions). Send it to **Raven** (see the Raven topic), or copy it, paste it in any cloud AI, copy the answer back and choose **Skills → Import an answer from a cloud AI…**. The answer becomes a new note marked **needs review**; nothing existing is changed.

If you prefer, **Settings → AI → Let Mimer write new content from its own knowledge** lets Mimer write from memory too. It will then say so, and you should check the result.

## Choose which AI Mimer uses

Mimer uses an AI that runs on your own computer: the **built-in AI**, **LM Studio**, **Foundry Local** (Windows and macOS; it can use a neural processor, an NPU) or another OpenAI-compatible server on this computer. Add and choose them under **Settings → AI providers**: when you pick the kind of provider, the settings list what you have to do to get it working. A cloud AI (Anthropic, or an OpenAI-compatible cloud service) is only for **Raven**, which cannot see your notes. A local AI cannot be used by Raven: Raven works only with a cloud AI, because only a cloud AI can look things up on the internet.

**Add provider** asks which kind you want and tells you whether it is local (for Mimer) or cloud (for Raven only). To switch AI or model quickly, click the AI name under the tab's title (for example _LM Studio · qwen_) and choose from the menu: no need to open Settings. The choice is saved and applies to everything you ask from then on.

## More

- **History** in the chat header reopens earlier chats. **Prompts** saves texts you use often.
- Select text in a note and press **Ctrl/Cmd+K** for quick changes: fix spelling, rewrite, shorten and more. You review the result before it is used.
- **Settings → AI** has Mimer's base instruction (who Mimer is), your own instructions, and the AI providers.
- Mimer only ever uses an AI **on your own computer**: LM Studio, or his own **built-in AI** (see the Built-in AI topic). Your notes are never sent to a cloud AI. For a cloud AI there is a separate tab, **Raven**, that cannot see your notes.
