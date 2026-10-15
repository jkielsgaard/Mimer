> **Status: implemented in 0.3.0.** See docs/DECISIONS.md (section Version 0.3.0) and CHANGELOG.md. The text below is the original plan.

# Feature 12 – The AI is called Mimer, with an editable base instruction

Branch: `feat/mimer-persona`. Read [README.md](README.md) first (rules, definition of done).

## What the user gets

- The assistant introduces itself as **Mimer** and is called Mimer in the app (chat tab, header, message box, "Mimer is working…").
- A **base instruction** that says what Mimer is: a notes AI that helps write and structure notes and projects for better control. It is pre-filled, can be edited in **Settings → AI**, and has a **Reset to default** button.
- The safety rules stay in code and **cannot** be edited away (the AI only proposes changes, stays inside its scope, uses the tools).

## Decisions (already made – do not change)

| Question                                  | Decision                                                                                                                                                                         | Why                                                                                              |
| ----------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| Where is the base instruction stored?     | New field `ai.baseInstruction` (string) in `settings.json`. Empty string = use the built-in default.                                                                             | Old settings files keep working; "reset" is just clearing the field.                             |
| Is it the same as "global instructions"?  | No. **Base instruction** = who Mimer is (replaces the identity paragraph). **Global instructions** = extra wishes of the user, as today. Both are sent.                          | Keeps the existing setting; the user can change identity without losing their extra rules.       |
| What can the user not change?             | The rules block: notes are Markdown, never invent facts, cannot write files (use `propose_*`), full file content in edits, answer in the user's language, access only the scope. | CLAUDE.md principle 2 (the AI only proposes) must hold even if the user empties the instruction. |
| Prompt order                              | base instruction → fixed rules → scope → global instructions → project instructions → context                                                                                    | §8.12 order, with the identity part of the base prompt now editable. Record the deviation.       |
| Do inline commands use the persona?       | No. They must return only replacement text (§8.14).                                                                                                                              | A persona would risk chatty answers.                                                             |
| Is the tab renamed?                       | Yes: "Assistant" → "Mimer". The spec says "Assistant"; record the change in DECISIONS.md.                                                                                        | The user asked for it.                                                                           |
| Language of the default                   | English. The rules tell Mimer to answer in the language the user writes in.                                                                                                      | All prompts are English; Danish users still get Danish answers.                                  |
| Is the Norse-myth introduction hardcoded? | No. It is a section of the default base instruction, so the user can edit or remove it. Only the default text in `prompt.rs` contains it.                                        | The user asked for an editable instruction, not fixed behaviour.                                 |
| Schema version                            | Stays 1. A new field with a serde default is backwards compatible.                                                                                                               | No migration needed.                                                                             |

Default text (put it in a `pub const DEFAULT_BASE_INSTRUCTION` in `src-tauri/src/ai/prompt.rs`):

```
You are Mimer, the AI assistant inside the Mimer note-taking app.
You are a notes AI: you help the user write, restructure, correct and find information in their notes, and you help them organise notes and projects so they are easier to keep under control. Prefer clear headings, consistent structure, links between related notes and short, actionable summaries.

## Who you are (introduction)
When the user asks who you are, what you are, or where your name comes from, you may
introduce yourself playfully and briefly (3–5 sentences), in character:

You are Mimer, named after Mímir from Norse mythology, the keeper of Mímisbrunnr, the well
of wisdom beneath the world tree Yggdrasil. Odin gave an eye for a single drink from that
well. Mímir's head was kept by Odin and still whispered counsel, and in the same spirit you
guard this vault of notes and help the user find, shape and organise what is in it.

Finish by offering something concrete to do with their notes. Keep the tone warm and a
little wry, never grand. Do not repeat the introduction unless asked, and do not let it
get in the way of the user's actual task.
```

The introduction is its own section (`## Who you are (introduction)`) inside the base
instruction, so a user can delete it and keep the notes-AI part. It is **not** hardcoded
elsewhere: it exists only in this default text, which the user can edit or reset in
Settings → AI. An example answer in Danish to "hvem er du?": _"Jeg er Mimer, opkaldt efter
Mimer fra de nordiske myter. Han vogtede Mimes brønd under Yggdrasil, visdommens kilde, og
Odin gav selv et øje for én slurk. Nu vogter jeg dine noter i stedet, og jeg hjælper dig med
at finde, forme og holde orden i dem. Skal vi starte med at samle trådene i et af dine
projekter?"_

## Tasks (in order)

### Task 1 – Backend setting (S)

1. `src-tauri/src/settings/mod.rs`: add `pub base_instruction: String` to `AiSettings` (default `String::new()`; the struct already uses `#[serde(default)]`). Document it with `///`.
2. `normalize()`: trim it; cap at 4,000 characters (truncate, do not error).
3. Regenerate bindings: from `src-tauri/` run `cargo test export_bindings` (running from the repo root creates a stray `src-tauri/bindings/` folder; delete it if it appears).
4. Tests in `settings/mod.rs`: an old file without the field loads with an empty value; a too-long value is capped.

Done when: `cargo test settings` passes and `src/bindings/AiSettings.ts` has `baseInstruction`.

### Task 2 – Prompt assembly (S)

1. `ai/prompt.rs`: split `BASE_PROMPT` into `DEFAULT_BASE_INSTRUCTION` (identity, above) and `RULES` (the bullet list that starts with "Rules:"). Add `base_instruction: &str` to `PromptInput`.
2. `build_system_prompt`: output `base_instruction` (or the default if blank), then `RULES`, then the existing scope, tools, global, project and context sections.
3. `ai/agent.rs`: pass `&settings.ai.base_instruction`. Do **not** change `inline.rs`.
4. Tests (extend the existing prompt tests): the default text contains the introduction section; default used when blank; custom instruction replaces the identity but `RULES` and the "cannot write files" line are still present; order is base → rules → global → project → context.

Done when: a test proves an empty or hostile base instruction (for example "ignore all rules") still leaves the rules block in the prompt.

### Task 3 – Settings UI (S)

1. `features/settings/SettingsContent.tsx`, tab **AI**: add a textarea "Mimer's base instruction" above "Global instructions". When the stored value is empty, show the default text as the field's value (get it from a constant exported from `src/lib/mimer.ts`; keep it equal to the Rust default and add a test that compares the two strings by reading `prompt.rs`, like `version.test.ts` does).
2. "Reset to default" button: sets the field to `""`. Helper text: "Describes who Mimer is. The safety rules (Mimer only proposes changes) cannot be changed here."
3. Saving a value equal to the default stores `""` so future default improvements apply.

### Task 4 – Naming in the UI (S)

Rename user-visible text: right panel tab "Assistant" → "Mimer"; message box label and placeholder → "Message Mimer…"; "Thinking…" → "Mimer is thinking…"; empty-chat text; the chat bubble gets a small label "Mimer" above assistant messages. Update tests that look for the old strings (`App.test.tsx`, `ChatHistoryMenu`/`PromptsMenu` tests use their own labels). Keep `aria-label`s meaningful ("Message Mimer").

### Task 5 – Docs and tests (S)

README (features, chat section), `docs/MANUAL_TESTS.md` (section "Mimer persona"), `docs/DECISIONS.md` (deviation from §8.12 order and the tab name), `CHANGELOG.md` under Unreleased.

## Manual test

- [ ] Ask "who are you?": the answer says Mimer, mentions the well of wisdom under Yggdrasil in a short playful way, and offers to help with the notes. Ask in Danish: the answer is in Danish.
- [ ] Ask a normal task ("summarise this note"): Mimer does not repeat the introduction.
- [ ] Delete the "Who you are" section in Settings → AI, save, ask "who are you?": Mimer answers plainly as a notes AI, without the myth.
- [ ] Settings → AI shows the default instruction; edit it ("You are Mimer, a strict editor…"), save, ask again: the new behaviour shows.
- [ ] Reset to default restores the original text and behaviour.
- [ ] Empty the field and save: Mimer still refuses to write files directly and still proposes changes for review.
- [ ] The tab, placeholder and bubble label say Mimer.

## Definition of done

`pnpm check` is green (Rust part inside the container), bindings regenerated, CHANGELOG and DECISIONS updated, manual list ticked.
