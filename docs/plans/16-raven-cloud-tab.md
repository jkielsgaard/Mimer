> **Status: implemented in 0.7.0.** See docs/DECISIONS.md (section Version 0.7.0) and CHANGELOG.md. Differences from the text below: `InlineRequest.provider_id` was kept (checked by `select_local`) and only `local_only` was removed; Task 7 (web search) was not built.

# Feature 16 – Notes are local only, and a separate "Raven" tab for cloud AI

Branch: `feat/raven`. Read [README.md](README.md) first (rules, definition of done).

## Why

Today a project can be "locked to local AI", and the lock is checked per request. A review found three holes in that model: the lock only follows the _active_ project (a note from a locked project can be attached or read from outside it and then go to a cloud provider), inline AI trusts the `local_only` flag sent by the UI, and a provider of kind `lmstudio` is always treated as local whatever its address is.

Instead of patching the rule, this feature changes the structure so the holes cannot exist:

- **Everything that touches notes is local only.** The Mimer tab, inline AI, project instructions help, semantic search. No cloud provider can be selected for any of them.
- **Cloud AI lives in its own tab, Raven, and has no access to notes at all.** It is a plain chat for knowledge from the internet. The command behind it does not receive the vault, so it cannot read a note even by mistake.

Raven is named after Odin's two ravens, who fly out into the world and come back with news. Mimer guards the well of wisdom, the ravens fetch what the well does not know.

## What the user gets

- **Mimer tab** (as today, local AI only). A small line at the top: **"Local AI · your notes stay on this computer"**.
- **Raven tab**, next to Mimer, shown only when a cloud provider has been chosen for it in Settings. A small line at the top: **"Cloud AI · no access to your notes"**, followed by the provider name and a hint that what you type is sent to that provider.
- Answers in Raven have **Copy** and **Save as note**. A saved note starts with `status: needs review` and says where it came from, so Mimer can use it later (attach it with `/`), but only after the user has put it there.
- A one-time notice the first time Raven is opened: what is sent, to whom, and that the user is responsible for what they type or paste there.
- The research prompt card in Mimer gets a button **Send to Raven** (when Raven is on), which puts the prompt in the Raven message box. The user still presses send.
- "Local AI only" disappears from project settings, because nothing in the notes can reach the cloud any more. One setting less.

## Decisions (already made – do not change)

| Question                                                 | Decision                                                                                                                                                                                                                                                              |
| -------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| What is "local"?                                         | `effective_location() == Local`. **Both** `lmstudio` and `openai_compatible` must have a loopback address (`localhost`, `127.0.0.1`, `::1`). The `lmstudio` exception is removed. The settings file cannot override this.                                             |
| Which providers can Mimer, inline AI and embeddings use? | Local only. Checked in `ai::router` with a new `LocalProvider` type that is the only thing the note-related code accepts. A cloud provider is never an option, not even with a flag.                                                                                  |
| How does Raven stay away from notes?                     | Structurally: `ai/raven.rs` and `commands/raven.rs` take a list of chat messages and a `CloudProvider`, and nothing else. No `AppState` vault, no tools, no mentions, no current note. A reviewer can see in one file that there is no path to the notes.             |
| Which providers can Raven use?                           | Cloud only (`effective_location() == Cloud`), chosen in **Settings → AI → Raven provider** (a list of the cloud providers plus "Off"). New field `ai.ravenProviderId: string \| null`, default `null` (Raven hidden).                                                 |
| Can Raven use a local provider?                          | No. A local model has no internet, and keeping the tabs strict keeps the rule simple: Mimer = local, Raven = cloud.                                                                                                                                                   |
| Does Raven have tools?                                   | No. Plain streaming chat. Internet access depends on the provider and model. A web-search option for Anthropic is Task 9 and must be checked against the provider's current documentation before it is built.                                                         |
| Can the user put note text in Raven?                     | Only by copying and pasting it themselves. Raven has no attach picker and no "include current note". The first-use notice says that this is the user's responsibility.                                                                                                |
| Is the Raven chat saved?                                 | No. It lives in memory, "New chat" clears it. Cloud conversations are not written into the vault history. A saved _answer_ (Save as note) is an ordinary note.                                                                                                        |
| System prompt of Raven                                   | Short and fixed in code: Raven is a research assistant inside Mimer, has no access to the user's notes, answers in the user's language, gives source URLs when it uses web knowledge, says when it is unsure. Not editable.                                           |
| What happens to existing settings?                       | `normalize()` migrates: if `defaultProviderId` points to a cloud provider, that provider becomes `ravenProviderId` (when none is set) and the default becomes the first local provider. Project `providerId` values that are cloud are ignored (the default is used). |
| What happens to `localOnly` in project files?            | The field is removed from the `Project` struct and the UI. Old project files still load (unknown fields are ignored; a test proves it) and the field is dropped on the next save. No schema bump.                                                                     |
| Research prompt and import answer                        | Kept. They work without any API key (the user pastes into a browser AI) and they stay useful. Only the card gets the extra button.                                                                                                                                    |
| Schema version                                           | Stays 1. New field has a serde default.                                                                                                                                                                                                                               |
| Version                                                  | **0.7.0** (behaviour change in settings and projects).                                                                                                                                                                                                                |
| Spec deviation                                           | CLAUDE.md §8.10, §8.11 and §6.3 describe the per-project lock. Record the replacement in `docs/DECISIONS.md` (section Version 0.7.0).                                                                                                                                 |

## Tasks (in order)

### Task 1 – Strict locality in the backend (M)

1. `settings/mod.rs`: `effective_location()` for `LmStudio` returns `Local` only when `is_loopback_url(&base_url)`, else `Cloud`. Add `ai.raven_provider_id: Option<String>` (doc comment, serde default, `#[ts(optional)]` as the other optionals are done).
2. `normalize()`: the migration in the table above. A cloud `defaultProviderId` is replaced by the first local provider (or the LM Studio default if none exists). `ravenProviderId` is cleared when it points to a missing or local provider. `embeddings.providerId` must be local, else embeddings are turned off (the existing check only excludes Anthropic).
3. `ai/router.rs`: replace `select_provider(settings, id, local_only)` by `select_local(settings, id) -> AppResult<LocalProvider>` (error `ProviderBlocked` with a clear message when the provider is cloud) and add `select_cloud(settings) -> AppResult<CloudProvider>` (uses `ravenProviderId`; error when Raven is off or the provider is not cloud). `providers::chat` takes one of the two through a small trait or enum, so the compiler stops a cloud provider from reaching the agent.
4. `ai/agent.rs`, `ai/inline.rs`: use `select_local`. Remove `provider_id` and `local_only` from `InlineRequest` (the project dialog's "Ask AI" also uses `select_local`). The UI can no longer influence locality.
5. `embeddings/mod.rs`: `semantic_allowed` no longer needs the project flag; embeddings use a local provider only.
6. `projects/mod.rs`, `projects/service.rs`, `commands/projects.rs`: remove `local_only`. Keep `provider_id` (must be local; a cloud value is ignored).
7. Regenerate bindings (`cargo test export_bindings`, from `src-tauri/`).

Tests: router rejects cloud for notes (Anthropic, a non-loopback `openai_compatible` that claims `local`, and an `lmstudio` provider with a non-loopback address); accepts loopback; `select_cloud` rejects local and rejects "Raven off"; migration cases; an old project file with `"localOnly": true` still loads; an old settings file without `ravenProviderId` loads.

Done when: `cargo test` passes, and `grep -rn "local_only" src-tauri/src` finds nothing outside migration tests and comments.

### Task 2 – Raven backend (M)

1. New `ai/raven.rs`: `run(app/settings snapshot, request: RavenRequest, channel, cancel)`. `RavenRequest { messages: Vec<ChatMessageIn> }` and nothing else. Builds the fixed system prompt, trims the history with the existing helper in `ai/prompt.rs` to 75% of `contextTokens`, sends with **no tools**, streams `ChatEvent::TextDelta`, `Done`, `Error` (reuse the existing events).
2. New `commands/raven.rs`: `raven_chat(request, channel) -> Uuid`, registered in `lib.rs` and `commands/mod.rs`. It takes **no vault state**. Cancel uses the existing `ai_cancel`.
3. `ts-rs` export for `RavenRequest`; wrapper `api.ravenChat` in `src/lib/api.ts`.

Tests: the request type has no field that can carry a path or note; the system prompt says Raven has no access to notes; no tools are sent (use the provider test double the agent tests use); an empty message list is an error.

Done when: a test shows Raven works with no vault open.

### Task 3 – Settings (S)

1. `features/settings/SettingsContent.tsx`, tab **AI**: the **Default provider** list shows local providers only. Add **Raven provider (cloud AI)**: the cloud providers plus "Off". Helper text: "Raven is a separate chat for knowledge from the internet. It never sees your notes."
2. `features/settings/ProviderEditor.tsx`: show for each provider whether it is "Local (notes allowed)" or "Cloud (Raven only)". Adding a cloud provider no longer touches the default.
3. `SemanticSearchSettings.tsx`: only local providers in the list.
4. Project settings (`features/projects/ProjectForm.tsx`): remove the "Local AI only" checkbox and the "Lock to local AI?" prompt on create; the provider list shows local providers only.

Tests: lists are filtered; Raven "Off" hides the tab (Task 4).

### Task 4 – The Raven tab and the two notices (M)

1. `stores/uiStore.ts`: `RightTab` gets `"raven"`. `features/chat` header: a shared small component `PrivacyNote` (`kind: "local" | "cloud"`, `providerName`) shown at the **top of both tabs**: Mimer "Local AI · your notes stay on this computer", Raven "Cloud AI · no access to your notes · what you type is sent to {providerName}". Replace the old lock icon in the chat header and the status bar by "Local AI".
2. New `features/raven/RavenPanel.tsx` and `stores/ravenStore.ts` (messages, streaming, stop, new chat; no persistence). Reuse `Bubble.tsx` and the message box pieces from the chat panel where it is simple; do not copy the mention picker, the tasks menu or "include current note" (Raven has none).
3. The tab is shown only when `ai.ravenProviderId` is set and points to a valid cloud provider. The tab strip becomes Mimer | Raven | Images | History.
4. First-use notice (a dialog shown once, remembered with `safeStorage`): what is sent, to which provider, that it can be stored by that provider, and that note text pasted here is the user's own decision.
5. Each answer: **Copy**, and **Save as note** (a small dialog: title, folder; creates a note with frontmatter `source: raven`, `status: needs review`, `created`, then opens it). Reuse `lib/researchAnswer.ts` for the note layout.
6. `features/chat/ResearchPromptCard.tsx`: when Raven is on, a **Send to Raven** button puts the prompt in the Raven message box and switches tab. It does not send.
7. Keyboard: `Mod+L` still focuses Mimer. Raven has no shortcut in 0.7.0.

Tests (Vitest/RTL, `api` mocked): both notices render with the right text; Raven tab absent when off; no mention picker in Raven; Save as note writes `status: needs review`; Send to Raven fills but does not send.

### Task 5 – Prompt and tool text (S)

`ai/prompt.rs`: the knowledge rule and the research-prompt tool text say that for new facts Mimer writes a prompt the user can paste into a cloud AI or send to Raven (when Raven is on). No other change. Update the prompt tests that mention the old wording.

### Task 6 – Docs, help and version (S)

README (the "Why Mimer?" section can now say it without caveats: the notes AI only ever talks to local models, and the cloud tab has no access to notes), `docs/START-GUIDE.md`, help topics `mimer.md` and `projects.md` (remove "Local AI only", add a Raven topic `raven.md`), `docs/MANUAL_TESTS.md` (new section), `docs/DECISIONS.md` (Version 0.7.0: the table above, why the per-project lock was replaced, the loopback rule for `lmstudio`), `CHANGELOG.md` (`## [0.7.0]`: Added Raven; Changed notes AI is local only, `localOnly` removed; Security: the three holes closed), version to **0.7.0** in `package.json` and `Cargo.toml`, README version line. Update CLAUDE.md §8.10/§8.11 with a pointer to the decision.

### Task 7 – Optional: web search in Raven (S–M, only if wanted)

Check the provider's **current** documentation first (for Anthropic: whether a server-side web search tool is available on the API, its price and how results are returned). If it is available, add an opt-in switch "Let Raven search the web" for that provider kind. Otherwise leave Raven as a plain chat and say in the first-use notice that internet access depends on the model.

## Open questions

- **A company-hosted model** (for example `https://llm.company.example`) has a non-loopback address, so under the strict rule it counts as cloud and could only be used in Raven, never for notes. That is safe, but it may be wrong for a model on the user's own network. A later version could let the user mark a network provider as "trusted for notes" with a clear warning. Not in 0.7.0.
- Should Raven chats be saved like Mimer chats? Decided no for 0.7.0; revisit if it is missed.

## Manual test

- [ ] Settings → AI: the default provider list has no cloud provider; add an Anthropic provider: it appears under Raven provider only.
- [ ] An existing settings file whose default provider is a cloud provider: after the update, Mimer uses the local provider and the old cloud provider is Raven's.
- [ ] Raven off: no Raven tab. Raven on: the tab is next to Mimer.
- [ ] Both tabs show their line at the top ("Local AI · your notes stay on this computer", "Cloud AI · no access to your notes").
- [ ] First time in Raven the notice appears once.
- [ ] Ask Raven about your own notes: it says it cannot see them. Attach and mention pickers are not there.
- [ ] Save as note creates a note with `status: needs review`; attach it to Mimer with `/` and ask a question about it.
- [ ] Mimer asks to write a research prompt: **Send to Raven** fills Raven's message box and does not send.
- [ ] An `lmstudio` provider with a non-local address is shown as Cloud and cannot be chosen for Mimer.
- [ ] Project settings no longer show "Local AI only"; an old project file with it still opens.
- [ ] Inline AI (`Mod+K`) and the project "Ask AI" button work with the local provider and never offer a cloud one.
- [ ] Stop and New chat work in Raven.

## Definition of done

`pnpm check` is green (Rust part inside the container), bindings regenerated, CHANGELOG and DECISIONS updated, help topics and README updated, manual list ticked. No code path from a note, mention, search result or inline selection to a cloud provider exists (`select_local` is the only way into the agent, inline AI and embeddings).
