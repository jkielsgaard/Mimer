# Store listing for the package WITH the built-in AI: complete texts to replace

Use this for `mimer-msix-with-ai` (`Mimer_<version>.0_x64_with-ai.msix`). Every block below replaces the whole field in Partner Center: select everything in the field, paste the block. To go back to the package without the built-in AI, use the blocks in [STORE-LISTING.md](STORE-LISTING.md) instead (see [MSIX.md](MSIX.md), "Going back").

## Short description

```
Markdown notes with a built-in local AI assistant. Plain files, a Git history of every change, and an AI that only proposes.
```

## Description

```
Mimer is a notes app for people who want to own their notes. Your notes are ordinary Markdown files in ordinary folders, so they work in any other editor too. Every change is saved in a built-in version history, so nothing is ever lost.

An assistant that works for you, not on your behalf

- Ask Mimer to find, restructure, merge, correct or summarise notes. It can search and read your notes, and it proposes changes that you review file by file. Nothing is written until you accept it.
- Select text and press Ctrl+K for quick changes: fix spelling, rewrite, shorten and more.
- Your notes are only ever sent to an AI that runs on your own computer: the built-in AI that Mimer can download for you (Settings → Built-in AI, Gemma models from Google, Apache-2.0), or LM Studio. A separate chat, Raven, can use a cloud AI of your choice for knowledge from the internet, and it never sees your notes.

Built-in AI, no extra program needed

In Settings → Built-in AI, Mimer can download an open-source AI engine and a model (a few GB) and run it on your computer. Nothing is downloaded until you press Download, and the screen says what is fetched and from where. Wake it when you need it, put it to sleep to free memory.

Write and organise

- A live-preview Markdown editor with a toolbar, tabs, split view and a table editor, and a Markdown source view.
- Wiki-links, tags, images, templates, daily notes, meeting notes and index pages.
- Projects: folders with their own instructions for the assistant.
- Full-text search, and search by meaning with a local embedding model.
- Export to HTML, Word and PDF. Import from a folder of Markdown files, for example a OneNote export.

Safe by design

- Every vault is a local Git repository: compare, restore and recover deleted notes.
- No account, no telemetry, no ads. API keys are stored in the Windows Credential Manager.
- Open source (Apache-2.0): https://github.com/jkielsgaard/Mimer

Live generative AI. Mimer shows answers that an AI model writes in response to what you type. The model is one you connect yourself (it runs on your own computer, or is a cloud service you choose). You can report inappropriate AI content from inside the app: File → Report → Report inappropriate AI content.

Mimer is a beta version. The app is in English; the assistant answers in the language you write in.
```

## Product features (one line per feature)

```
Plain Markdown notes in normal folders, so your files work in any other editor
Live preview: write Markdown and see it formatted as you type, or switch to the Markdown source
Every change is saved in a built-in Git history, so you can restore any version or deleted note
Wiki-links, backlinks and tags to connect your notes
Fast full-text search across the whole vault
AI assistant that proposes edits, and nothing is written until you approve it
Built-in local AI: download a model once and use it with no account and no cloud (or use LM Studio)
Projects with their own AI instructions for different kinds of work
Raven: optional chat with a cloud AI of your own, with no access to your notes
Paste or drag in images and files as attachments
Import a folder of Markdown files, for example a OneNote export
No account, no ads and no data collection
```

## What's new in this version

```
New: a built-in AI that runs on your computer (Settings → Built-in AI). Markdown source view (Ctrl+Alt+M). File → Report to send a bug or an idea. Sorting a big imported folder into folders now works. Pictures are listed in the Images tab only.
```

## Search terms (seven, one per box)

```
markdown
notes
note taking
local ai
git history
wiki links
knowledge base
```

## Notes for certification

```
Mimer is an open-source desktop notes app (Tauri, Rust and a WebView2 front end), packaged as a full-trust desktop app.

How to try it: start the app, choose "Open folder as vault" and pick or create any empty folder. Create a note with Ctrl+N. No account or sign-in is needed.

The AI features use either the optional built-in AI (see below) or a local AI server (LM Studio) that is not part of the package. Without either, the app is a normal Markdown editor with version history. The "Raven" tab is off until the user enters an API key for a cloud AI provider of their own. No data is sent anywhere unless the user does that.

The app shows AI-generated answers (live generative AI). The model is one the user connects themselves. To report inappropriate AI content, use File > Report > "Report inappropriate AI content…": it opens a pre-filled issue on the developer's GitHub page, and reports are read and acted on.

Optional built-in AI: if the user opens Settings > Built-in AI and presses Download, the app downloads (1) the open-source llama.cpp engine (llama-server, MIT licence) from github.com/ggml-org/llama.cpp and (2) a model file (Google Gemma, Apache-2.0) from huggingface.co. Nothing is downloaded unless the user presses the button, and the screen says what will be downloaded and from where before that. Every file is a fixed release whose SHA-256 and size are written in the app's source code (src-tauri/src/engine/catalog.rs); a file that does not match is deleted. The downloaded program is not an add-on to the app's features: it is only the engine that runs the user's chosen model, it listens on 127.0.0.1 only with a random key, it starts when the user presses "Wake Mimer" and stops with "Sleep Mimer" or when the app closes. The app works fully without it (an LM Studio server can be used instead). If the policy for downloaded executables does not allow this, please tell us and we will remove the download.

The app does not collect any data. Privacy policy: https://github.com/jkielsgaard/Mimer/blob/main/PRIVACY.md
```
