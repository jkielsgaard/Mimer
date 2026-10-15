# Mimer privacy policy

_Last updated: 15 October 2026. Mimer is made by Jesper Ahasverusen Kielsgaard (https://github.com/jkielsgaard/Mimer)._

Mimer is a notes app that runs on your own computer. This page says what it does with your data.

## What Mimer collects

**Nothing.** Mimer has no account, no analytics, no telemetry, no advertising and no automatic update check. The author does not receive any data from the app.

## Where your data is

- Your **notes** are ordinary Markdown files in folders you choose, and each folder is also a local Git repository. They stay on your computer.
- Your **settings** and chat history are files on your computer (the app's data folder, and `.vault` inside your notes folder).
- **API keys** you enter are stored in the Windows Credential Manager (or the keychain of your system), never in a file.

## When data leaves your computer

Only when you choose it:

- **The notes AI ("Mimer")** only talks to an AI that runs on your own computer: LM Studio, or the built-in AI. Your notes are never sent to a cloud service.
- **Raven** (off until you turn it on) is a separate chat with a cloud AI that you choose and give an API key to. What you type in the Raven chat is sent to that company, and their privacy policy applies. Raven cannot see your notes.
- **The built-in AI download** (when you press Download) fetches the engine from `github.com` and the model from `huggingface.co`. Those sites see your internet address, as for any download.
- **Export and import** write and read files on your computer only.

## Children

Mimer does not collect any data, from anyone.

## Changes and contact

If this policy changes, the new text is published here with a new date. Questions: open an issue at https://github.com/jkielsgaard/Mimer/issues.
