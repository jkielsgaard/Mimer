> **Status: implemented in 0.3.0.** See docs/DECISIONS.md (section Version 0.3.0) and CHANGELOG.md. The text below is the original plan.

# Feature 9 – Mention notes in chat with `/`

Branch: `feat/chat-mentions`. Read [README.md](README.md) first (rules, definition of done).

## What the user gets

- In the message box, typing `/` (at the start of a word) opens a list of notes. Typing narrows it (`/pag` finds `Pages/page.md`, fuzzy on name and path). Arrow keys move, **Enter** or **Tab** picks, **Esc** closes.
- A picked note becomes a **chip** above the message box (with an × to remove). The `/text` the user typed is removed from the message.
- Mimer gets the content of every chip's note and treats them as "the pages to work on", so it can summarise, edit or restructure exactly those. Edits still come back as proposals to review.
- A **paperclip button** next to the box opens the same list, for users who do not know the `/` trick.

## Decisions (already made – do not change)

| Question                     | Decision                                                                                                                   | Why                                                                             |
| ---------------------------- | -------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| Text token or chip?          | **Chip.** The message text stays free of paths; mentions travel as a separate list.                                        | Paths with spaces break text parsing; chips are unambiguous and removable.      |
| Which notes are offered?     | Markdown notes only, and only inside the active project's folder (the whole vault when there is no project).               | The agent scope rule (§8.2/§8.15). Out-of-scope notes would be rejected anyway. |
| Limits                       | Max **5** mentions per message; each note is cut at **12,000** characters (same as the `read_note` tool).                  | Keeps the prompt inside the context budget.                                     |
| Budget order                 | Truncate in this order: older messages, tool results, **mentioned notes (from the last one)**, then the current note.      | Extends §8.12; record in DECISIONS.md.                                          |
| Current note also mentioned? | Sent once. The mention wins and "Include current note" is ignored for that note.                                           | No duplicate text.                                                              |
| Where is it validated?       | In Rust, with `paths::resolve(root, path, scope)`. A rejected or unreadable note is skipped and shown as an activity line. | The frontend is never trusted (§8.2).                                           |
| Stored in chat history?      | Yes: `mentions: string[]` on stored user messages (optional field, default empty).                                         | Reopened chats show which notes were attached. `schemaVersion` stays 1.         |
| Folders (`/Work/`)?          | Not in v1. Note it in DECISIONS.md as a possible follow-up.                                                                | Keep it simple.                                                                 |

## Tasks (in order)

### Task 1 – Request type and prompt (M)

1. `src-tauri/src/ai/mod.rs`: add `#[serde(default)] pub mentions: Vec<String>` to `ChatRequest`.
2. `ai/prompt.rs`: add `mentions: &[(String, String)]` (path, content) to `PromptInput`. New section after the project instructions:

   ````
   ## Notes attached by the user
   The user attached these notes. They are the pages to work on.
   ### Work/Plan.md
   ```markdown
   …
   ````

   ```

   In `assemble`, drop/truncate mentions as described in the decisions table.
   ```

3. `ai/agent.rs`: before the loop, resolve and read the mentions (a small function `load_mentions(vault, scope, &req.mentions, &req.note_path) -> (Vec<(String,String)>, Vec<String>)` returning the notes and a list of skipped-path messages). Use `paths::resolve` and `fs_ops::read_note`. Send a `ChatEvent::ToolCall { name: "attach", summary }` for each skipped note, for example "Could not attach Secret/Keys.md (outside this project)".
4. Tests (no Tauri needed – test `load_mentions` and `build_system_prompt`): out-of-scope rejected; `..` rejected; non-Markdown rejected; more than 5 cut; duplicate of the current note sent once; long note truncated; prompt contains the section only when there are mentions.

Done when: tests pass and a mention outside a local-only project's folder never reaches the prompt.

### Task 2 – Stored chats (S)

`src-tauri/src/chats/mod.rs`: add `#[serde(default)] pub mentions: Vec<String>` to `StoredMessage`. Test: an old chat file without the field still loads. Regenerate bindings (from `src-tauri/`).

### Task 3 – Store (S)

`src/stores/chatStore.ts`: `ChatMessage` gets `mentions: string[]`; the store gets `draftMentions: string[]` with `addMention`, `removeMention`, `clearMentions`. `send` includes `mentions` in the request, stores them on the user message, and clears the draft chips. Store tests: add/remove, max 5, no duplicates, payload contains mentions.

### Task 4 – Picker UI (M)

1. New `src/features/chat/mentionQuery.ts` (pure): `findMentionQuery(text, caret) -> { start, query } | null`. A `/` only counts at the start of the text or after whitespace, so URLs and dates (`1/2`) do not open the list. Unit tests.
2. New `src/features/chat/MentionPicker.tsx` (one component): props `{ query, files, onPick, onClose }`. Uses `src/lib/fuzzy.ts` (already used by quick open) on markdown paths inside the active scope, shows at most 8 rows (name bold, folder muted), `role="listbox"`, keyboard handled by the textarea (↑ ↓ Enter Tab Esc) so focus never leaves the box.
3. New `src/features/chat/MentionChips.tsx`: the chip row with × buttons (`aria-label="Remove Plan"`).
4. `ChatPanel.tsx`: on each change and caret move, call `findMentionQuery`; when the picker is open, Enter/Tab pick instead of sending. Picking removes `/query` from the draft and adds the chip. Add the paperclip button (`aria-label="Attach a note"`) which opens the picker with an empty query.
5. `Bubble.tsx`: show the mention chips (read-only) above a user message.
6. Component tests: `/pla` shows the list and picks with Enter; Esc closes; `1/2` does not open it; chip removal; the paperclip opens the list; out-of-scope notes are not offered.

### Task 5 – Docs (S)

README (chat quick start), `docs/MANUAL_TESTS.md` (section "Mention notes"), `docs/DECISIONS.md`, `CHANGELOG.md`.

## Manual test

- [ ] Type `/` in the chat box: the list opens. Type a few letters of a note: it narrows. Enter adds a chip and removes the typed text.
- [ ] Add two notes, ask "merge these into one summary": Mimer uses both; a proposal appears and nothing is written until applied.
- [ ] Remove a chip with ×: it is no longer used.
- [ ] In a project, notes outside its folder are not in the list.
- [ ] Type a URL or `1/2`: the list does not open.
- [ ] Reopen the chat from History: the chips are shown on the earlier message.

## Definition of done

`pnpm check` green, bindings regenerated, tests for every task, CHANGELOG and DECISIONS updated, manual list ticked.
