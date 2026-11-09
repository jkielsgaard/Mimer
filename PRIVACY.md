# Mimer privacy policy

_Last updated: 9 November 2026. Mimer is made by Jesper Ahasverusen Kielsgaard (https://github.com/jkielsgaard/Mimer)._

Mimer is a notes app that runs on your own computer. This page says what it does with your data.

## What Mimer collects

**Nothing.** Mimer has no account, no analytics, no telemetry, no advertising and no automatic update check. The author does not receive any data from the app. **Help → Check for new version…** only opens the releases page in your web browser.

## Where your data is

- Your **notes** are ordinary Markdown files in folders you choose, and each folder is also a local Git repository. They stay on your computer.
- Your **settings** and chat history are files on your computer (the app's data folder, and `.vault` inside your notes folder).
- **API keys** you enter (for a local AI server that asks for one) are stored in the Windows Credential Manager (or the keychain of your system), never in a file.

## When data leaves your computer

Only when you choose it:

- **The AI ("Mimer")** runs on your own computer by default: the built-in AI, LM Studio or another local server. The AI reads your notes only on your own machine. A cloud AI is possible, but only after you say yes, and never in a project you lock to local. You turn it on yourself in Settings → AI, in a window that says what is sent (the open note and the text you select, the notes the chat searches and reads, your questions and the chat history) and that it is your responsibility; it is used only after you tick "I understand". The status bar shows **Cloud AI** while it is on, and what the cloud company does with the text is governed by its own terms.
- **The built-in AI download** (when you press Download) fetches, for llama.cpp, the engine from `github.com` and the model from `huggingface.co`; for Foundry Local, the hardware parts and the model from Microsoft's Foundry Local catalog. Those sites see your internet address, as for any download.
- **A backup** (Settings → Vault → Backup) copies your notes and their history only to the folder you choose on your own computer or a disk or synced folder you connect; Mimer sends it nowhere itself.
- **Export and import** write and read files on your computer only.
- **Links** you click in Mimer (for example **Report a bug…**) open in your web browser; Mimer itself sends nothing.

## Children

Mimer does not collect any data, from anyone.

## Changes and contact

If this policy changes, the new text is published here with a new date. Questions: open an issue at https://github.com/jkielsgaard/Mimer/issues.
