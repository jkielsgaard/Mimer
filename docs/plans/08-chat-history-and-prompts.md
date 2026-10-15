> **Status: implemented.** See docs/DECISIONS.md and docs/START-GUIDE.md. The text below is the original plan.

# Feature 8 – Persisted chat history and saved prompts

Branch: `feat/chat-history`. Read [README.md](README.md) first (rules, recipes, definition of done).

## What the user gets

- Chats survive restarts. A **History** menu in the chat header lists earlier chats (newest first); pick one to continue it, delete one, or delete all.
- **Saved prompts**: a **Prompts** menu above the message box inserts a saved prompt into the box; "Save current text as prompt…" stores the text for reuse.

## Decisions (already made – do not change)

| Question                        | Decision                                                            | Why                                                                                                        |
| ------------------------------- | ------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| Where are chats stored?         | One JSON file per chat in `.vault/chats/<uuid>.json`                | Plain files, per vault, no new dependency                                                                  |
| Are chats committed to Git?     | **No.** Add `.vault/chats/` to `.gitignore`                         | Chats are private, large and change constantly; they would flood the history and leak into any future sync |
| Where are saved prompts stored? | `.vault/prompts.json`, **committed**                                | Small, useful to share with the vault; recoverable through Git                                             |
| Are proposals persisted?        | No. Only text, tool-activity lines and errors                       | Proposal sets live in memory (`AppState.proposals`) and cannot be applied after a restart                  |
| Chat id                         | A UUID v4 string, validated on every command (stops path traversal) | Safety                                                                                                     |
| Title                           | First user message, trimmed to 60 characters                        | Simple                                                                                                     |
| Max size                        | 5 MB per chat file (reject larger with `AppError::Io`)              | Prevents runaway files                                                                                     |

## Data format

`.vault/chats/<id>.json`:

```json
{
  "schemaVersion": 1,
  "id": "3f6c1e2a-…",
  "title": "Summarize the firewall policy",
  "projectId": null,
  "createdAt": "2026-10-13T15:00:00Z",
  "updatedAt": "2026-10-13T15:04:10Z",
  "messages": [
    { "id": 1, "role": "user", "content": "Summarize…", "activity": [], "error": null },
    {
      "id": 2,
      "role": "assistant",
      "content": "…",
      "activity": ["Read Work/Policy.md"],
      "error": null
    }
  ]
}
```

`.vault/prompts.json`:

```json
{
  "schemaVersion": 1,
  "prompts": [
    {
      "id": "…",
      "title": "Check against template",
      "text": "Compare this note with …",
      "createdAt": "2026-10-13T15:00:00Z"
    }
  ]
}
```

---

## Tasks

### Task 8.1 – `.gitignore` line for chats

**Files:** `src-tauri/src/git/repo.rs`

1. Change `GITIGNORE_LINES` from `[&str; 3]` to `[&str; 4]` and add `".vault/chats/"`.
2. The existing test `gitignore_is_appended_not_overwritten` only checks the first lines – extend it: after `ensure_gitignore`, the file must contain `.vault/chats/` exactly once, also after calling it twice.
3. Existing vaults get the line automatically (`ensure_gitignore` runs on every vault open and only appends missing lines).

**Done when:** `cargo test git::repo` passes.

### Task 8.2 – New commit kind for prompts

**Files:** `src-tauri/src/git/mod.rs`

1. Add `Prompts` to `CommitKind` (the enum is `camelCase` in TypeScript → `"prompts"`).
2. In `CommitReason::message`: `CommitKind::Prompts => with("Prompts")` → `Prompts: added "Check against template"`.
3. Extend the test `commit_messages_match_the_spec` with an assertion for it.

**Done when:** test passes; `pnpm bindings` updates `CommitKind.ts`.

### Task 8.3 – `chats` module

**Files:** create `src-tauri/src/chats/mod.rs`; add `pub mod chats;` to `src-tauri/src/lib.rs`.

Types (all `#[derive(Debug, Clone, Serialize, Deserialize, TS)]`, `#[serde(rename_all = "camelCase")]`, `#[ts(export)]`):

```rust
pub struct StoredMessage { pub id: u32, pub role: crate::ai::ChatRole, pub content: String,
                           pub activity: Vec<String>, pub error: Option<String> }
pub struct StoredChat   { pub schema_version: u32, pub id: String, pub title: String,
                           pub project_id: Option<String>, pub created_at: String, pub updated_at: String,
                           pub messages: Vec<StoredMessage> }
pub struct ChatSummary  { pub id: String, pub title: String, pub project_id: Option<String>,
                           pub updated_at: String, pub message_count: u32 }
```

Functions (all take `root: &Path`, all have `///` docs, all return `AppResult`):

| Function                                                | Behaviour                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| ------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `validate_id(id: &str) -> AppResult<()>`                | `uuid::Uuid::parse_str(id)` must succeed, else `AppError::InvalidPath("Invalid chat id")`                                                                                                                                                                                                                                                                                                                                                                                        |
| `save(root, chat: StoredChat) -> AppResult<StoredChat>` | validate id; reject empty `messages`; if `title` is empty use the first user message (60 chars, `chars().take(60)`); set `updated_at = projects::now()`; keep `created_at` from the existing file if there is one; serialize with `serde_json::to_vec_pretty`; reject if > 5 MB; create `.vault/chats/` with `create_dir_all`; write **atomically** (write `<id>.json.tmp` then `std::fs::rename`); use `paths::resolve_internal(root, ".vault/chats/<id>.json")` for the target |
| `load(root, id) -> AppResult<StoredChat>`               | validate; missing file → `AppError::NotFound`                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| `list(root) -> Vec<ChatSummary>`                        | read every `*.json` in the folder; skip files that fail to parse (do not error); sort by `updated_at` descending                                                                                                                                                                                                                                                                                                                                                                 |
| `delete(root, id) -> AppResult<()>`                     | validate; missing file is OK                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| `delete_all(root) -> AppResult<u32>`                    | delete every `*.json` in the folder, return the count                                                                                                                                                                                                                                                                                                                                                                                                                            |

**Tests (in the same file, use `tempfile::tempdir()`):**

- save → load round trip (all fields equal, `updated_at` set).
- `created_at` is preserved when saving the same id twice.
- title is filled from the first user message and truncated to 60 chars (use a 100-char message).
- `list` is sorted newest first and ignores a corrupt JSON file you write by hand.
- invalid ids are rejected: `"../x"`, `"a/b"`, `""`, `"not-a-uuid"` for `save`, `load` and `delete`.
- empty `messages` rejected.
- `delete_all` returns the right count.

**Done when:** `cargo test chats` passes and clippy is clean.

### Task 8.4 – `prompts` module

**Files:** create `src-tauri/src/prompts/mod.rs`; add `pub mod prompts;` to `lib.rs`.

```rust
pub struct SavedPrompt { pub id: String, pub title: String, pub text: String, pub created_at: String }   // + derives as above
const FILE: &str = ".vault/prompts.json";
pub fn list(root: &Path) -> Vec<SavedPrompt>                         // [] if the file is missing or unreadable
pub fn add(root: &Path, title: &str, text: &str) -> AppResult<SavedPrompt>   // trims; empty title or text → AppError::InvalidPath("…is empty"); title max 80 chars; new uuid id; appends; writes atomically
pub fn remove(root: &Path, id: &str) -> AppResult<Option<String>>   // returns the removed prompt's title, or None if not found
```

The file wrapper struct is private: `struct PromptFile { schema_version: u32, prompts: Vec<SavedPrompt> }` (`#[serde(rename_all = "camelCase", default)]`).

**Tests:** add/list/remove round trip; empty title/text rejected; removing an unknown id returns `None` and does not error; order is insertion order.

### Task 8.5 – Commands

**Files:** create `src-tauri/src/commands/chats.rs`; add `pub mod chats;` to `commands/mod.rs`; register in `lib.rs`.

| Command            | Signature                                      | Notes                                                                                                                                                          |
| ------------------ | ---------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `list_chats`       | `() -> Vec<ChatSummary>`                       | `chats::list(&v.root)`                                                                                                                                         |
| `load_chat`        | `(id: String) -> StoredChat`                   |                                                                                                                                                                |
| `save_chat`        | `(chat: StoredChat) -> StoredChat`             |                                                                                                                                                                |
| `delete_chat`      | `(id: String) -> ()`                           |                                                                                                                                                                |
| `delete_all_chats` | `() -> u32`                                    |                                                                                                                                                                |
| `list_prompts`     | `() -> Vec<SavedPrompt>`                       |                                                                                                                                                                |
| `add_prompt`       | `(title: String, text: String) -> SavedPrompt` | after `prompts::add`, call `v.commit(CommitReason::new(CommitKind::Prompts, Some(format!("added \"{title}\""))), Some(&[".vault/prompts.json".to_string()]))?` |
| `remove_prompt`    | `(id: String) -> ()`                           | commit `removed "<title>"` only if something was removed                                                                                                       |

Remember: bind `let v = state.current_vault()?;` first.

**Done when:** `cargo clippy … -D warnings` is clean; `pnpm bindings` produced `StoredChat.ts`, `StoredMessage.ts`, `ChatSummary.ts`, `SavedPrompt.ts`.

### Task 8.6 – API wrappers

**Files:** `src/lib/api.ts`

Import the new types and add to the `api` object:

```ts
listChats: () => call<ChatSummary[]>("list_chats"),
loadChat: (id: string) => call<StoredChat>("load_chat", { id }),
saveChat: (chat: StoredChat) => call<StoredChat>("save_chat", { chat }),
deleteChat: (id: string) => call<undefined>("delete_chat", { id }),
deleteAllChats: () => call<number>("delete_all_chats"),
listPrompts: () => call<SavedPrompt[]>("list_prompts"),
addPrompt: (title: string, text: string) => call<SavedPrompt>("add_prompt", { title, text }),
removePrompt: (id: string) => call<undefined>("remove_prompt", { id }),
```

### Task 8.7 – `chatStore` persistence

**Files:** `src/stores/chatStore.ts`, new `src/stores/chatStore.persist.test.ts` (or extend `chatStore.test.ts`).

1. Add state: `chatId: string | null`, `chats: ChatSummary[]`.
2. Add a private helper `toStored(state): StoredChat | null`: returns `null` when there are no user messages; otherwise builds the object from `messages`: drop assistant messages that are empty **and** have no activity and no error; map `{ id, role, content, activity, error }`; `projectId: null` (not tracked yet); `title: ""` (the backend fills it); `createdAt/updatedAt: new Date().toISOString()` (the backend overwrites `updatedAt`, keeps the stored `createdAt`); `schemaVersion: 1`.
3. Add action `persist()`: `const stored = toStored(get())`; if null return; if `chatId` is null set it to `crypto.randomUUID()`; call `api.saveChat`; on success `refreshChats()`; on failure call `reportError` (import from `uiStore`) **once** (do not toast on every retry – keep a module flag).
4. Call `persist()`:
   - in `send` right after the user message was added (so a crash does not lose the question),
   - in `applyEvent` when `e.type` is `"done"` or `"error"`,
   - in `stop()` after `set({ streaming: false })`.
5. Add actions:
   - `refreshChats()` → `api.listChats()` into `chats` (swallow errors with `reportError`).
   - `openChat(id)` → refuse if `streaming`; `api.loadChat(id)`; set `messages` from the stored messages (add `proposalSetId: null`), `chatId: id`; set the module counter `nextId` to `max(message ids) + 1` so new ids never collide.
   - `deleteChat(id)` → `api.deleteChat`; if `id === chatId` call `newChat()`; `refreshChats()`.
   - `deleteAllChats()` → `api.deleteAllChats()`; `newChat()`; `refreshChats()`.
6. `newChat()` must also set `chatId: null`. If a chat is streaming, cancel it as it does now.
7. When the vault changes, chat state must reset (today messages leak into the next vault). Add an exported function `resetChatForVault()` = `newChat()` + `set({ chats: [] })` and call it from `vaultStore.openVault` (after success) and `closeVault`.

**Tests (mock `@/lib/api` with `vi.hoisted`, see `App.test.tsx`):**

- `send` → after `applyEvent({type:"done"})`, `api.saveChat` was called with the user and assistant messages and the same `id` as the first call (same chat, not a new one per save).
- empty assistant placeholder is not persisted.
- `openChat` replaces messages and sets `chatId`; ids of later messages are higher than loaded ones.
- `openChat` while streaming does nothing.
- `deleteChat(currentId)` clears the conversation.

**Done when:** tests pass.

### Task 8.8 – History menu

**Files:** create `src/features/chat/ChatHistoryMenu.tsx`; edit `src/features/chat/ChatPanel.tsx`.

1. Component uses `DropdownMenu` from `@/components/ui/dropdown-menu`. Trigger: a ghost `Button` with the lucide `History` icon and text "History" (`aria-label="Chat history"`).
2. Content: if `chats` is empty show a disabled item "No earlier chats". Otherwise one `DropdownMenuItem` per chat: title (truncate), `relativeTime(Date.parse(updatedAt) / 1000)` from `@/lib/utils` below it, and a small trash button on the right (`aria-label="Delete chat"`, `onClick` → `e.stopPropagation(); void deleteChat(id)`). Selecting the item calls `openChat(id)`. Highlight the current chat.
3. Last item (after a separator): "Delete all history…" → opens `ConfirmDialog` (`@/components/ConfirmDialog`, `destructive`, text "All saved chats in this vault will be deleted. This cannot be undone.").
4. Disable the trigger while `streaming`.
5. In `ChatPanel`, render it next to "New chat", and call `refreshChats()` in an effect that depends on the vault path (`useVaultStore((s) => s.vault?.path)`).

**Done when:** a component test renders the menu with two chats from the mocked store, opens it, clicks a chat and sees `openChat` called; deleting calls `deleteChat`.

### Task 8.9 – Prompts menu

**Files:** create `src/features/chat/PromptsMenu.tsx`; edit `ChatPanel.tsx`.

1. Props: `draft: string`, `onInsert: (text: string) => void`.
2. State: `prompts: SavedPrompt[]` loaded with `api.listPrompts()` when the menu opens (use `onOpenChange`) and after add/remove.
3. Items: each prompt (title; second line = first 60 chars of text, muted) → `onInsert(prompt.text)`; small trash button → `api.removePrompt(id)` then reload. Last items: "Save current text as prompt…" (disabled when `draft.trim() === ""`) → opens `PromptDialog` asking for a title (validate non-empty) → `api.addPrompt(title, draft)`; toast "Prompt saved".
4. In `ChatPanel`, `onInsert={(t) => setDraft((d) => (d.trim() === "" ? t : `${d}\n${t}`))}` and focus the textarea.
5. Place the menu in the row with the "Include current note" checkbox (right-aligned).

**Done when:** component test: with mocked api, open menu, click a prompt → `onInsert` called with its text; "Save current text…" disabled with empty draft; saving calls `api.addPrompt`.

### Task 8.10 – Privacy note

**Files:** `src/features/settings/SettingsDialog.tsx` (tab "AI")

Add a small muted paragraph under the global instructions: "Chats are saved in this vault under .vault/chats/ (not committed to Git). Use History → Delete all history to remove them."

### Task 8.11 – Docs and manual tests

Update `CHANGELOG.md`, `README.md` (feature list), `docs/DECISIONS.md` (the decisions table above + the new commit kind), and add the manual tests below to `docs/MANUAL_TESTS.md` and the README checklist (new section "13. Chat history and saved prompts").

---

## Tests summary (automated)

Rust: chats round trip / created_at kept / title / sorting / corrupt file ignored / invalid ids / delete_all; prompts add/list/remove/validation; gitignore line; commit message.
Frontend: chatStore persistence (5 cases above), ChatHistoryMenu, PromptsMenu.

## Manual tests to add

- [ ] Send two messages in a chat, quit and restart the app, open **History**: the chat is listed with a sensible title; opening it restores both messages and you can continue the conversation.
- [ ] `git status` in the vault does not list `.vault/chats/` (ignored) and no commit is made when you chat.
- [ ] **New chat** starts an empty conversation; the old one stays in History.
- [ ] Delete one chat from History → it disappears. **Delete all history…** asks for confirmation and clears everything.
- [ ] Open a different vault: the chat panel starts empty and History shows only that vault's chats.
- [ ] While an answer is streaming the History menu is disabled.
- [ ] Type a text, **Prompts → Save current text as prompt…**, give it a title: it appears in the menu; `git log` shows `Prompts: added "…"`. Clicking it inserts the text. Removing it creates `Prompts: removed "…"`.
- [ ] Press **Prompts → Save…** with an empty message box: it is disabled.

## Pitfalls

- The frontend `ChatMessage` type (in `chatStore.ts`) is **not** the generated `StoredMessage`; convert explicitly.
- Do not persist while `messages` only has the user's question and an empty assistant placeholder **and** the request failed before anything arrived – that still counts as a chat (the question is worth keeping). The filter in 8.7 step 2 handles it.
- `crypto.randomUUID()` exists in the Tauri webview (secure context); in jsdom tests it exists in Node 22.
