## Meet Mimer

**Mimer** is the AI in the app. It is not one chat you have to type into: it is buttons where you work, and each one does one fixed thing. You never have to write a prompt.

**Mimer only proposes changes. Nothing is written until you accept it.**

## AI where you work

- **Selected text:** the bar over the selection has **Fix**, **Rewrite** and **Shorten**, and **AI ▾** for more: rewrite with simpler words, more formal or friendlier (always the same meaning), make it a list, translate to Danish or English, **Explain this** (an answer next to the text, nothing changes) and **Find tasks in it**. You see the change before it is written, with a check that numbers, links and names are still there. **Ctrl/Cmd+K** opens the same menu.
- **The whole note:** the **AI** button above the note: fix spelling and grammar (in the whole note), improve the structure, a short summary at the top, a title and tags, find tasks, split into notes, and an e-mail from the note. **Link related notes** opens the Links panel; it finds notes by the title and tags and needs no AI.
- **A folder:** right-click it → **AI**: sort into folders, find duplicates, an index page and more. **Make an index page** right under it makes a list of links without AI.
- **Search:** a search that reads like a question ("what is the service desk number?") shows **Answer from my notes**. Press **Get an answer**: the AI reads the notes that fit and answers, with the notes it used.
- **A task:** Break it down, **Write a status line from the log**, and in Focus **Help me start**.
- **An idea:** **Think it through** (three questions) and **Suggest first steps** (they become one task with those steps).
- **Any text box:** select text in a box (a task's note, the log, an idea, a project's instructions) and the same small bar appears, or press **Ctrl/Cmd+K** in the box. Name, search and password boxes have no AI.
- **Spelling help** (made for dyslexia): turn it on in the status bar or in Settings. A moment after you stop typing, misspelt words get a wavy line. Click a word to fix it, ignore it or add it to your words. Nothing changes by itself.

## When there is no AI

Everything that is not AI works as always: notes, search, tasks, ideas, the outline, links, history and images. The AI buttons are greyed out and say why (for example "No AI is set up" or "The built-in AI is asleep"), with **Set up AI**. The system spellcheck still works.

## Ask about my notes

For a free question, press **Ctrl/Cmd+L** or the speech bubble at the right edge. The chat opens as a window over the note; **Esc** or **×** closes it, and the chat is kept. Type a question and press **Enter**. Mimer reads the open note (untick **Include the open note** for general questions) and searches your notes to answer. The chat only answers: it never changes a note. **History** in its header reopens earlier chats; **New chat** starts over.

## Review what Mimer proposes

The AI commands that change notes (the note's **AI** button and right-click → **AI** on a folder) open the chat window to show their progress, then a **Review changes** card. Open it to see every file, what changes, and why. Accept or reject each file, then **Apply selected**. Before anything is applied Mimer saves a snapshot, and afterwards all changes are one entry in the history, so everything can be undone. **File → Undo the last AI change** takes the last one back.

**Mimer checks every change** before you see it: are the links, tags, numbers and dates, names, properties and code the same, did a part go missing, did the AI add words of its own in front? A change that fails a check is still shown, but it is not selected in the review and the review says why. **Fix spelling** only lets the AI send back the words that are wrong; nothing else in the note can change.

**Long runs start with three notes.** When a command works on more than five notes, Mimer does the first three and stops. Look at those changes, then press **Looks good, do the other …**, or reject them and stop there. A run handles up to 50 notes when changing text, 300 when sorting and 30 when writing one note from many.

You see what Mimer is doing while it works, and **Stop** cancels at any time.

## New facts

Mimer has no internet access and only knows what it learned in training, so it can be out of date or wrong. It **does not write new documentation or facts** for you: if you ask, it says so. It works with what is in your notes: structure, merging, correcting, summarising, linking. For new facts, find them yourself and paste them into a note; Mimer can then help you structure them.

## Choose which AI Mimer uses

Mimer uses an AI that runs on your own computer: the **built-in AI** (Phi Silica on a Copilot+ PC in the Store version, Foundry Local, or llama.cpp), **LM Studio** or another OpenAI-compatible server on this computer. **Settings → AI** lists them in the order that suits where Mimer runs, with the state of each; choose one there, and set it up under **Built-in AI** or **AI providers** (when you pick the kind of provider, the settings list what you have to do to get it working).

**Cloud AI, as a last resort.** If no AI on your computer is good enough, an OpenAI-compatible cloud service (added under AI providers with its address and key) can be Mimer's AI. Mimer asks first: your notes, the text you select and your questions are then sent to that company, under its terms, and it is your responsibility. You must tick "I understand" before it is used. While it is on, the status bar says **Cloud AI** and the chat shows it in orange. A project marked **Local AI only** never uses it, and choosing another AI turns it off again.

**Add provider** asks which kind you want (LM Studio or another server on this computer). The model is chosen in the settings. A built-in AI that is asleep is woken by itself when you ask it something.

## More

- **Settings → AI** has Mimer's base instruction (who Mimer is), your own instructions, and **Let the AI check its own answer** (off by default): the AI is asked once more whether its answer to a text command is right, which is slower but helps with small models.
- A small model sometimes answers with nothing useful (an empty text, or most of the text gone). Mimer then tries once more and says so instead of offering it.
- Mimer uses an AI **on your own computer**: LM Studio, or his own **built-in AI** (see the Built-in AI topic). Your notes are only sent to a cloud AI if you turn one on yourself under Settings → AI, after a warning.
