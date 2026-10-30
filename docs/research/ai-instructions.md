# Research: AI instructions (global, project, base)

Status: option 1 was chosen and built (see CHANGELOG and docs/DECISIONS.md). Question: do the instructions still make sense now that Mimer's AI commands are fixed commands?

## What exists today

| Instruction              | Where it is set                            | Where it is used                                                                                                                                                     |
| ------------------------ | ------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Base instruction**     | Settings → AI → Mimer's instruction        | The chat only (`ai/prompt.rs`). It replaces Mimer's identity line; the rules (only propose, stay in the project) cannot be replaced.                                 |
| **Global instructions**  | Settings → AI                              | The chat, the fixed commands on text (`ai/inline.rs`) and skills (`ai/skill_run.rs`). Not used when the AI is Phi Silica (the small-model path sends only the task). |
| **Project instructions** | Project settings (a folder made a project) | The same three places, for notes inside the project folder. Each project also has an "Ask AI to change the instructions" box (`RefineInstructions`).                 |

A project is more than instructions: it is a folder with its own tree, an AI scope (the chat reads only that folder), an optional own AI provider, and the "Local AI only" lock. Those parts are independent of the instruction text.

## What the code tells us

- The instructions are **not dead**: for models other than Phi Silica they are appended to the system prompt of every fixed command and every skill, after the command's own task. A global instruction such as "Reply in Danish" does change a rewrite.
- They are also **risky next to fixed commands**. A command says "return only the replacement text"; a free-text instruction that says "start with a short summary" fights that, and the output rules (`ai/clean.rs`) then have to clean up. This is the likely cause of some of the "extra text around the answer" the owner has seen.
- A fixed command already carries its own language rule (`language_rule`), so the one common use of a global instruction (language) is covered.
- Phi Silica ignores them, so behaviour differs by AI.
- The "Ask AI to change the instructions" box in projects is a second AI feature that exists only to maintain the text.

## Options

1. **Keep, but narrow (recommended).** Replace the three free-text fields with one short, clearly named field: **"About me and my notes"** (global, optional, a few lines: who you are, preferred language, terms). It is shown to the chat and skills only, not appended to the fixed commands, because a command has one job. Remove the base instruction and the project "Ask AI" box. Keep projects as folders with scope, provider and the local-only lock, and rename the instructions field to "About this project" (also chat and skills only).
2. **Remove all instructions.** Simplest, fewest surprises. Loses the use "always answer in Danish and use these terms" in the chat and in skills.
3. **Keep as is.** Cheapest, but the confusion remains, and instructions keep leaking into fixed commands.

## Recommendation and what a change touches

Option 1. It makes the setting mean what the owner expects (context for the chat and skills) and stops it from interfering with fixed commands. Areas: AI (prompt assembly, inline, skills, `projects`), Settings (the AI tab), Built-in AI (none). Files kept: the settings fields stay in the file for compatibility (old values are read, the base instruction is ignored). A short design is needed for the settings tab and the project dialog.

## Questions for the owner

- Is the chat ("Ask about my notes") used enough to keep a place for instructions there?
- Should "answer in this language" be its own setting (language of the AI's answers), instead of a sentence in a text box?
