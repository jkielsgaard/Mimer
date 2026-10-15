## Raven, the cloud AI

**Mimer** works on your notes and only ever talks to an AI **on your own computer**, for example LM Studio. **Raven** is the other way round: a separate chat with a **cloud AI** that has **no access to your notes at all**. Use it when you want knowledge from the world outside your notes: a fact, an explanation, a comparison.

Raven is named after Odin's two ravens, who fly out into the world and come back with news.

## Turn it on

Raven needs a **cloud** AI, because it is meant for knowledge from the internet. LM Studio and the built-in AI run on your computer and cannot search the internet, so they cannot be used for Raven. The Raven tab is only there when you have chosen a cloud AI for it:

1. **Settings → AI providers**: add an **Anthropic** or **OpenAI-compatible** provider with an address that is not on your computer, and store its API key.
2. **Settings → AI → Raven's provider (cloud AI)**: choose it. Choose **Off** to hide the tab again.

## What Raven sees

- Only what you type in the Raven chat. It cannot read, search or change your notes, and it has no tools.
- Everything you type is sent to the provider you chose, and that company may keep it. Do not write anything you would not want them to have.
- If you paste text from a note into Raven, that text leaves your computer. That is your own decision.

Whether Raven can look things up on the internet depends on the provider and the model.

## Keep an answer

Under each answer:

- **Copy** copies the text.
- **Save as note** makes a new note marked **needs review**, so you know it came from a cloud AI and has not been checked. Then you can attach the note to Mimer with `/` and work on it there.

The chat is not saved: **New chat** clears it.

## From Mimer

When Mimer writes a **research prompt**, a **Send to Raven** button puts it in Raven's message box. You still press send yourself. Without Raven you can copy the prompt into any cloud AI and bring the answer back with **File → Import an answer from a cloud AI…**.
