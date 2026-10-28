# Microsoft Store listing: texts and files to paste into Partner Center

Use this together with [docs/MSIX.md](MSIX.md). Everything below is in English, because the app is. Partner Center shows the exact size and length limits for each field, so trust it over this page if they differ.

## Files

| What                      | File                                                                                                                                                                                                                                                     |
| ------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| App icon, 1:1, 300 × 300  | `docs/store/icon-300x300.png`                                                                                                                                                                                                                            |
| Box art, 1:1, 1080 × 1080 | `docs/store/box-art-1080x1080.png`                                                                                                                                                                                                                       |
| Screenshots               | `docs/screenshots/` (1500 × 950, from a demo vault). The Store wants at least 1366 × 768, so they fit. Good choices: `notes-editor.png`, `tasks-list.png`, `task-page.png`, `field-ai-fix-review.png`, `daily-note-trace.png`. Never use your own notes. |
| The package               | The artifact `mimer-msix` (unsigned) from the release run                                                                                                                                                                                                |

## Product identity and name

- **Name:** Mimer: Markdown Notes (reserved)
- **Category:** Productivity (sub-category: Notes, if offered)

## Short description

Markdown notes with an AI assistant that runs on your own computer. Plain files, a Git history of every change, and an AI that only proposes.

## Description

Mimer is a notes app for people who want to own their notes. Your notes are ordinary Markdown files in ordinary folders, so they work in any other editor too. Every change is saved in a built-in version history, so nothing is ever lost.

**Notes, tasks and ideas in one place**

- A live-preview Markdown editor with a toolbar, tabs, split view and a table editor. Mermaid diagrams are drawn right in the note.
- Tasks are plain checklist lines in your notes, with steps, a note and a log. Epics group them in one outline you can fold, and move to Done when every task is done. A task made from a note gets an epic of its own that points back to the note.
- An ideas list, and a Focus view that shows one task at a time.
- Landing keeps Meetings, Quick notes and Tasks together, with a mark on new notes and a button to move them where they belong.
- Daily notes in a calendar at the top of the file panel. Wiki-links, tags (typing # suggests the ones you already use), images and index pages.
- Full-text search, and search by meaning with a local embedding model.
- Export to HTML, Word and PDF. Import from a folder of Markdown files, for example a OneNote export.

**AI where you work, and only if you want it**

- Select text for quick changes: fix spelling, rewrite, shorten and more. The AI can also point out spelling mistakes as you type, in the language of the text.
- Ready-made commands above each note, on folders, on search answers, on tasks and on ideas: summarise, find a title and tags, suggest the next steps, think an idea through. You review every change before it is written.
- A plain chat to ask about your notes, where you can point at notes or folders with /.
- Skills: ready-made jobs such as fixing spelling, tidying the structure or sorting a folder. Mimer checks every change (links, tags, numbers and dates).
- Your notes are only ever sent to an AI that runs on your own computer: the built-in AI (Microsoft's Foundry Local, which can use a neural processor) or LM Studio.
- Everything else works the same without any AI.

**Safe by design**

- Every vault is a local Git repository: compare, restore and recover deleted notes.
- No account, no telemetry, no ads.
- Free and open source (AGPL-3.0): https://github.com/jkielsgaard/Mimer

**Live generative AI.** Mimer shows answers that an AI model writes in response to what you type. The model runs on your own computer. You can report inappropriate AI content from inside the app: Help → Report inappropriate AI content.

Mimer is a beta version. The app is in English; the assistant answers in the language you write in.

## What's new in this version

Tasks are now one clear outline: fold an epic to a single line with its progress, or fold and unfold them all at once, and open a task's steps right in the list to tick them or add one. There are no due dates or Today/Later lists to manage: each task simply shows the day it was made. A task opens in two columns, with what you write on the left and its status and epic on the right. The task files read well in any other Markdown editor too. Also new: AI in every text box (fix spelling, rewrite, translate), a note on each task and epic, editing and deleting log lines, an optional line in today's daily note for what you worked on, the AI can check its own answer, names Windows cannot keep are refused with the reason, and Mimer is now free software under the AGPL-3.0 licence.

## Search terms (up to seven)

markdown, notes, note taking, local ai, git history, wiki links, knowledge base

## Links and contact

- **Privacy policy URL:** https://github.com/jkielsgaard/Mimer/blob/main/PRIVACY.md
- **Website:** https://github.com/jkielsgaard/Mimer
- **Support contact:** https://github.com/jkielsgaard/Mimer/issues (add an e-mail address if Partner Center requires one)
- **Copyright and trademark info:** © 2026 Jesper Ahasverusen Kielsgaard

## Pricing and availability

- **Price:** Free.
- **Visibility:** to keep it out of the public search at first, choose "Hide this product in the Store, but make it available by direct link".
- **Markets:** all, or only the ones you want.

## Properties and age rating

- **Category:** Productivity.
- **System requirements:** Windows 10 version 1809 or later (Windows 11 recommended: it includes the WebView2 runtime that Mimer uses). 64-bit.
- **Age rating:** answer the questionnaire honestly. Mimer has no violent, sexual or gambling content of its own. Note that it lets the user chat with an AI model that the user chooses, so the "user-generated content / online interaction" questions may apply: the chat is private and goes only to the AI on the user's own computer.

## Notes for certification (paste into "Notes for certification")

```
Mimer is an open-source desktop notes app (Tauri, Rust and a WebView2 front end), packaged as a full-trust desktop app.

How to try it: start the app, choose "Open folder as vault" and pick or create any empty folder. Create a note with Ctrl+N. No account or sign-in is needed.

The AI features use either the optional built-in AI (Foundry Local, see below) or a local AI server (LM Studio) that is not part of the package. Without either, the app is a normal Markdown editor with version history. No data is sent anywhere.

The app shows AI-generated answers (live generative AI). The model is one the user connects themselves. To report inappropriate AI content, use Help > "Report inappropriate AI content…": it opens a pre-filled issue on the developer's GitHub page, and reports are read and acted on.

Built-in AI: the package contains Microsoft's Foundry Local runtime (MIT-licensed SDK and native libraries). It runs in a helper process, which is the same mimer.exe started with the argument --foundry-helper; no other program is started. If the user opens Settings > Built-in AI and presses Download, the runtime fetches (1) the hardware components for the neural processor or graphics card, and (2) a model chosen by the user, from Microsoft's Foundry Local catalog. Nothing is downloaded unless the user presses the button, and the screen says what will be downloaded before that. Only data is downloaded, no programs. The app works fully without it. The llama.cpp engine that the GitHub installer offers is disabled in this build.

The app does not collect any data. Privacy policy: https://github.com/jkielsgaard/Mimer/blob/main/PRIVACY.md
```

## Why the app needs "runFullTrust" (if asked)

```
Mimer is a classic desktop application. It reads and writes the Markdown files and Git repositories in folders the user opens anywhere on their disk (for example Documents or a synced folder), watches those folders for changes, and starts nothing else. These operations are not possible from a sandboxed UWP app, so the package uses the full-trust (desktop bridge) model.
```

## Required for apps with AI content (Store policy 11.16, "Live Generative AI Content")

Microsoft's policy says a product that contains content that a generative AI model creates in response to user input must do four things. Mimer does:

1. **Disclose it in the metadata**: the paragraph "Live generative AI." in the description above. Keep it.
2. **Note it in Partner Center** during the submission: tick the box or answer the question that says the product uses live generative AI.
3. **Follow the other Store policies**: the user chooses the model, and every change the AI proposes is shown for review before anything is written.
4. **Give users a way to report inappropriate content to the developer**: **Help → Report inappropriate AI content…** opens a pre-filled issue at https://github.com/jkielsgaard/Mimer/issues. Read the reports there and act on them. Say in the certification notes where the menu item is.

## Things Microsoft may ask about

- **AI content:** see the four points above. The package contains no AI model. The user downloads one (built-in AI) or connects a local AI of their choice.
- **WebView2:** Windows 11 includes it. On Windows 10 the Edge WebView2 runtime may have to be installed.
- If the review is rejected, read the message, fix the cause, and submit a new package: the version number must be higher each time.
