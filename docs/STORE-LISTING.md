# Microsoft Store listing: texts and files to paste into Partner Center

Use this together with [docs/MSIX.md](MSIX.md). Everything below is in English, because the app is. Partner Center shows the exact size and length limits for each field, so trust it over this page if they differ.

## Files

| What                      | File                                                                                                                                                                                                                                                          |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| App icon, 1:1, 300 × 300  | `docs/store/icon-300x300.png`                                                                                                                                                                                                                                 |
| Box art, 1:1, 1080 × 1080 | `docs/store/box-art-1080x1080.png`                                                                                                                                                                                                                            |
| Screenshots               | **Take new ones on Windows**, 1920 × 1080 or at least 1366 × 768, PNG. Three to five: a note in the editor, the Mimer tab with an answer, a proposed change under review, the file panel with a project, the history. Use a demo vault, never your own notes. |
| The package               | The artifact `mimer-msix` (unsigned) from the release run                                                                                                                                                                                                     |

## Product identity and name

- **Name:** Mimer: Markdown Notes (reserved)
- **Category:** Productivity (sub-category: Notes, if offered)

## Short description

Markdown notes with a local-first AI assistant. Plain files, a Git history of every change, and an AI that only proposes.

## Description

Mimer is a notes app for people who want to own their notes. Your notes are ordinary Markdown files in ordinary folders, so they work in any other editor too. Every change is saved in a built-in version history, so nothing is ever lost.

**An assistant that works for you, not on your behalf**

- Ask Mimer to find, restructure, merge, correct or summarise notes. It can search and read your notes, and it proposes changes that you review file by file. Nothing is written until you accept it.
- Select text and press Ctrl+K for quick changes: fix spelling, rewrite, shorten and more.
- Your notes are only ever sent to an AI that runs on your own computer (LM Studio). A separate chat, Raven, can use a cloud AI of your choice for knowledge from the internet, and it never sees your notes.

**Write and organise**

- A live-preview Markdown editor with a toolbar, tabs, split view and a table editor.
- Wiki-links, tags, images, templates, daily notes, meeting notes and index pages.
- Projects: folders with their own instructions for the assistant.
- Full-text search, and search by meaning with a local embedding model.
- Export to HTML, Word and PDF. Import from a folder of Markdown files, for example a OneNote export.

**Safe by design**

- Every vault is a local Git repository: compare, restore and recover deleted notes.
- No account, no telemetry, no ads. API keys are stored in the Windows Credential Manager.
- Open source (Apache-2.0): https://github.com/jkielsgaard/Mimer

Mimer is a beta version. The app is in English; the assistant answers in the language you write in.

## What's new in this version

First release in the Microsoft Store. Beta.

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
- **Age rating:** answer the questionnaire honestly. Mimer has no violent, sexual or gambling content of its own. Note that it lets the user chat with an AI model that the user chooses, so the "user-generated content / online interaction" questions may apply: the chat is private and goes only to the user's own computer or to the cloud AI the user chose.

## Notes for certification (paste into "Notes for certification")

```
Mimer is an open-source desktop notes app (Tauri, Rust and a WebView2 front end), packaged as a full-trust desktop app.

How to try it: start the app, choose "Open folder as vault" and pick or create any empty folder. Create a note with Ctrl+N. No account or sign-in is needed.

The AI features need a local AI server (LM Studio) that is not part of the package. Without one, the app is a normal Markdown editor with version history. The "Raven" tab is off until the user enters an API key for a cloud AI provider of their own. No data is sent anywhere unless the user does that.

The Microsoft Store build does not download or run any additional programs. The built-in AI engine that the GitHub installer offers is disabled in this build.

The app does not collect any data. Privacy policy: https://github.com/jkielsgaard/Mimer/blob/main/PRIVACY.md
```

## Why the app needs "runFullTrust" (if asked)

```
Mimer is a classic desktop application. It reads and writes the Markdown files and Git repositories in folders the user opens anywhere on their disk (for example Documents or a synced folder), watches those folders for changes, and starts nothing else. These operations are not possible from a sandboxed UWP app, so the package uses the full-trust (desktop bridge) model.
```

## Things Microsoft may ask about

- **AI content:** the app contains no AI model of its own in this build. It lets the user connect to an AI of their choice. If asked about safeguards, say that the user is in control of the model and that every change the AI proposes is reviewed by the user before it is written.
- **WebView2:** Windows 11 includes it. On Windows 10 the Edge WebView2 runtime may have to be installed.
- If the review is rejected, read the message, fix the cause, and submit a new package: the version number must be higher each time.
