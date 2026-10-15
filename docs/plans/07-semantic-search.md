> **Status: implemented.** See docs/DECISIONS.md and docs/START-GUIDE.md. The text below is the original plan.

# Feature 7 – Semantic search and "ask my vault"

Branch: `feat/semantic-search`. Read [README.md](README.md) first. This is the largest feature; follow the task order exactly.

## What the user gets

- **Search by meaning.** The search panel gets a mode switch: **Keyword** (today), **Meaning**, **Both** (default when semantic search is on). "How do we handle lost laptops?" finds the note titled "Device loss procedure" even if no word matches.
- **Ask my vault.** The AI assistant gets a new tool, `semantic_search`, so questions are answered from the most relevant passages and the answer cites the notes (`[[Work/Policy]]`).
- **Settings → AI → Semantic search:** switch on/off, pick the embedding provider and model, see progress, rebuild the index.
- Works **locally** with LM Studio's embedding models. Nothing leaves the machine unless the user chooses a cloud provider – and even then notes inside **local-only projects are never embedded or sent**.

## Background (read this once)

An _embedding_ is a list of numbers (a vector, e.g. 768 floats) that an embedding model produces for a piece of text. Texts with similar meaning get vectors that point in similar directions. We store one vector per **chunk** (a paragraph-sized piece of a note). To search, we embed the query, then compute the **cosine similarity** between the query vector and every chunk vector and return the best matches. If all vectors are scaled to length 1, cosine similarity is just the **dot product** (multiply pairwise and add). That is all the "AI" there is in the search itself.

LM Studio exposes `POST http://localhost:1234/v1/embeddings` with body `{"model": "<embedding model id>", "input": ["text 1", "text 2"]}` and answers `{"data": [{"index": 0, "embedding": [0.01, …]}, …]}` (OpenAI format). The user must load an embedding model in LM Studio (for example _nomic-embed-text-v1.5_).

## Decisions (already made)

| Question                        | Decision                                                                                                                                                                                                                                | Why                                                                                                                         |
| ------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| Where are vectors stored?       | A **separate** SQLite file `.vault/embeddings.db` (add `.vault/embeddings.db*` to `.gitignore`)                                                                                                                                         | The FTS index (`index.db`) is rebuilt whenever its schema changes; vectors are expensive to recompute and must survive that |
| Vector format                   | `f32` little-endian BLOB, **normalised to length 1** before storing                                                                                                                                                                     | Cosine = dot product; compact                                                                                               |
| Search algorithm                | Brute-force dot product over all vectors cached in memory                                                                                                                                                                               | 25 000 chunks × 768 floats ≈ 77 MB and ~20 ms; no vector DB needed                                                          |
| Chunking                        | Split by headings, then paragraphs; max ~1 000 characters per chunk; each chunk text is prefixed `"<note title> > <heading>\n"`                                                                                                         | Keeps context; fits embedding model limits                                                                                  |
| Providers allowed               | `lmstudio` and `openai_compatible` only (Anthropic has no embeddings endpoint)                                                                                                                                                          | Reality of the APIs                                                                                                         |
| Privacy                         | If the embedding provider's **effective location is cloud**, notes in a **local-only project are skipped** (not embedded) and the `semantic_search` tool is disabled for local-only projects. Enabling a cloud provider shows a warning | Core principle 3                                                                                                            |
| Model change                    | Vectors store their model id; changing the model deletes the old vectors and re-indexes                                                                                                                                                 | Vectors of different models are not comparable                                                                              |
| When does indexing run?         | In the background after a vault opens (if enabled), and again after file changes (debounced); the user can press **Rebuild**                                                                                                            | Never blocks the UI                                                                                                         |
| Hybrid ranking                  | **Reciprocal Rank Fusion** of the FTS list and the semantic list: `score = Σ 1 / (60 + rank)`                                                                                                                                           | Simple, no tuning                                                                                                           |
| Settings location               | `settings.json` → `ai.embeddings` `{ enabled, providerId, model }` (new struct with `#[serde(default)]`; schemaVersion stays 1)                                                                                                         | Global like other AI settings                                                                                               |
| `tools::execute` is synchronous | The new tool is **handled in `agent.rs`** (async), not in `tools.rs`; `tools.rs` only provides the schema                                                                                                                               | Embedding the query needs an HTTP call                                                                                      |

---

## Tasks

### Task 7.1 – Settings struct

**Files:** `src-tauri/src/settings/mod.rs`

```rust
#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase", default)]
#[ts(export)]
pub struct EmbeddingSettings { pub enabled: bool, pub provider_id: String, pub model: String }
impl Default for EmbeddingSettings { fn default() -> Self { Self { enabled: false, provider_id: "lmstudio-default".into(), model: String::new() } } }
```

Add `pub embeddings: EmbeddingSettings` to `AiSettings` (and its `Default`). In `Settings::normalize`: if `embeddings.enabled` and the provider is missing or `kind == Anthropic`, set `enabled = false`.

**Tests:** old settings JSON without the field loads with `enabled == false`; Anthropic provider disables it.

Update the TypeScript side later when `pnpm bindings` runs (Task 7.9 uses it). Existing frontend tests that build a `Settings` object (`App.test.tsx`) need `embeddings: { enabled: false, providerId: "lmstudio-default", model: "" }` in `ai`.

### Task 7.2 – Gitignore

**Files:** `src-tauri/src/git/repo.rs`

Add `".vault/embeddings.db"` and `".vault/embeddings.db-*"` to `GITIGNORE_LINES` (update the array length) and extend the gitignore test.

### Task 7.3 – Chunker (pure function)

**Files:** create `src-tauri/src/embeddings/mod.rs` and `src-tauri/src/embeddings/chunker.rs`; add `pub mod embeddings;` to `lib.rs`.

```rust
pub struct Chunk { pub index: u32, pub heading: String, pub text: String /* what is embedded and shown */, pub hash: String }

/// Splits a note into chunks of at most `max_chars` (default 1000).
pub fn chunk_note(title: &str, content: &str, max_chars: usize) -> Vec<Chunk>
```

Algorithm:

1. Remove frontmatter (`markdown::frontmatter::split`).
2. Walk lines; a line starting with `#` (outside fenced code – track ``` toggling) starts a new **section** with `heading` = the line text without `#`s (empty before the first heading).
3. Within a section, split the text on blank lines into paragraphs; accumulate paragraphs into a chunk until adding the next would exceed `max_chars`; then start a new chunk. A single paragraph longer than `max_chars` is split at sentence ends (`. `, `? `, `! `, newline) and as a last resort hard-cut at a char boundary (use `char_indices`).
4. Skip chunks with fewer than 20 alphanumeric characters.
5. `text = format!("{title} > {heading}\n{body}")` (omit ` > heading` when empty); `hash` = SHA-256 hex of `text` (use `crate::ai::proposals::hash`).
6. Number chunks from 0.

**Tests:** short note → 1 chunk; headings create separate chunks with correct `heading`; frontmatter excluded; code fences with `#` comments inside do not create headings; long paragraph is split and every chunk ≤ `max_chars + title prefix`; unicode (`åäö…`) is never cut mid-character; tiny chunks dropped; hashes differ for different text and are stable for the same text.

### Task 7.4 – Vector math (pure)

**Files:** create `src-tauri/src/embeddings/vector.rs`.

```rust
pub fn normalize(v: &mut [f32])                       // scale to length 1; all-zero stays zero
pub fn dot(a: &[f32], b: &[f32]) -> f32               // zip + sum; mismatched lengths → 0.0
pub fn to_blob(v: &[f32]) -> Vec<u8>                  // little-endian bytes
pub fn from_blob(b: &[u8]) -> Option<Vec<f32>>        // None if len % 4 != 0
pub fn top_k(scores: impl Iterator<Item = (usize, f32)>, k: usize) -> Vec<(usize, f32)>   // best k, descending; use BinaryHeap with a wrapper that orders f32 via total_cmp
```

**Tests:** normalize makes `dot(v,v) ≈ 1`; blob round trip; `from_blob` rejects odd lengths; `top_k` returns the right order, handles `k > n`, handles NaN without panicking (`total_cmp`).

### Task 7.5 – Embedding client

**Files:** create `src-tauri/src/embeddings/client.rs`; fixture `src-tauri/tests/fixtures/embeddings_response.json`.

```rust
/// Boxed async embedding function, so the indexer can be tested with a fake.
pub type EmbedFn = Arc<dyn Fn(Vec<String>) -> BoxFuture<'static, AppResult<Vec<Vec<f32>>>> + Send + Sync>;   // futures_util::future::BoxFuture

/// Builds the real function for an OpenAI-compatible endpoint.
pub fn http_embedder(base_url: String, model: String, api_key: Option<String>) -> EmbedFn
pub fn parse_response(body: &str, expected: usize) -> AppResult<Vec<Vec<f32>>>
```

`http_embedder` (returns a closure that clones what it needs): batches of **16** inputs per request; `POST {base_url}/embeddings` with `{"model": model, "input": batch}`; `bearer_auth` only when a key is present; client from `ai::providers::http_client()`; wrap the call in `tokio::time::timeout(Duration::from_secs(60), …)`; on non-2xx use `providers::openai_compat::error_from_response` (it is `pub(crate)`); after each response call `parse_response`; concatenate batches in order.

`parse_response`: JSON `{"data":[{"index":i,"embedding":[…]}]}`; sort by `index`; error `AppError::Provider("Unexpected embeddings response")` if `data` is missing or the count ≠ `expected` or any vector is empty; all vectors must have the same length.

**Tests (no network):** `parse_response` with the fixture (two vectors, out of order → sorted); wrong count → error; missing `data` → error; mixed dimensions → error.

### Task 7.6 – Vector store (SQLite)

**Files:** create `src-tauri/src/embeddings/store.rs`.

Schema (`PRAGMA user_version = 1`):

```sql
CREATE TABLE files  (path TEXT PRIMARY KEY, mtime INTEGER NOT NULL, model TEXT NOT NULL);
CREATE TABLE chunks (id INTEGER PRIMARY KEY, path TEXT NOT NULL, idx INTEGER NOT NULL, heading TEXT NOT NULL,
                     text TEXT NOT NULL, hash TEXT NOT NULL, model TEXT NOT NULL, vector BLOB NOT NULL);
CREATE INDEX chunks_path ON chunks(path);
```

API (all take `&Connection`):

```rust
pub fn open(path: &Path) -> AppResult<Connection>        // like search::open_index: recreate the file on corruption/version mismatch
pub fn open_memory() -> AppResult<Connection>            // tests
pub fn file_state(c, path) -> Option<(i64 /*mtime*/, String /*model*/)>
pub fn existing_hashes(c, path, model) -> HashMap<String /*hash*/, Vec<u8> /*vector blob*/>   // reuse vectors of unchanged chunks
pub fn replace_file(c, path, mtime, model, chunks: &[(Chunk, Vec<u8>)]) -> AppResult<()>       // one transaction: delete old rows, insert new, upsert files
pub fn remove_file(c, path) -> AppResult<()>
pub fn remove_other_models(c, keep_model: &str) -> AppResult<()>
pub fn clear(c) -> AppResult<()>
pub fn all_paths(c) -> AppResult<Vec<String>>
pub fn stats(c, model) -> AppResult<(u32 /*notes*/, u32 /*chunks*/)>
pub fn load_all(c, model) -> AppResult<Vec<StoredChunk>>   // StoredChunk { path, heading, text, vector: Vec<f32> }
```

**Tests:** replace_file twice leaves only the new rows; `existing_hashes` returns reusable vectors; `remove_other_models`; `stats`; corrupt file (write garbage bytes into a temp file) is recreated by `open`.

### Task 7.7 – Indexer (background job)

**Files:** create `src-tauri/src/embeddings/indexer.rs`; add to `OpenVault` (in `vault/mod.rs`) the fields `pub embeddings: Mutex<Option<Connection>>` and `pub vector_cache: RwLock<Option<Arc<Vec<StoredChunk>>>>` (opened lazily by `OpenVault::with_embeddings(|conn| …)` helper, path `.vault/embeddings.db` via `resolve_internal`). Add to `AppState`: `pub embedding_job: Mutex<Option<CancellationToken>>` and `pub embedding_status: Mutex<EmbeddingStatus>`.

```rust
pub struct IndexJob { pub notes_total: u32, pub notes_done: u32 }

/// Indexes every note whose mtime changed (or all when `rebuild`). Cancellable. Reports progress through `progress`.
pub async fn run_index(
    v: Arc<OpenVault>, embed: EmbedFn, model: String, cloud: bool,
    rebuild: bool, cancel: CancellationToken, progress: impl Fn(u32, u32) + Send,
) -> AppResult<()>
```

Steps:

1. `list_files` → markdown notes. Load projects (`v.project_list()`); a note is **excluded** when `cloud` is true and `projects::for_path(&projects, path)` is a project with `local_only == true`. Excluded notes that are already stored are removed from the store (important when the user later locks a project).
2. If `rebuild`: `store::clear`. Always: `store::remove_other_models(&model)`; remove stored paths that no longer exist.
3. For each remaining note (check `cancel.is_cancelled()` between notes): skip if `file_state == Some((mtime, model))`; read the file; `chunk_note`; `existing_hashes` → collect chunks whose hash is new; embed **only the new ones** in one `embed(texts)` call (the client batches); normalise each vector, `to_blob`; build the final list (old vectors reused by hash) and `replace_file`. Call `progress(done, total)` after each note.
4. A failing embed call stops the job with the error (`AppError::Provider`) – notes already done are kept.
5. At the end set `v.vector_cache` to `None` (invalidate).
6. Blocking SQLite calls inside the async function are fine for short transactions; do heavy file reading before awaiting.

Wrapper used by commands: `spawn_index_job(app: AppHandle, rebuild: bool)`:

- reads settings; builds `ResolvedProvider` via `router::select_provider(&settings, Some(&cfg.provider_id), false)` (never blocked – the per-note rule above handles local-only);
- refuses (error) when `enabled == false`, the provider is Anthropic, or `model` is empty;
- gets the key with `keychain::get_key`; builds `http_embedder(provider.base_url, model, key)`;
- stores a new `CancellationToken` in `AppState.embedding_job` (cancel the old one first – only one job at a time);
- spawns with `tauri::async_runtime::spawn`; updates `AppState.embedding_status` and emits the event `embeddings://status` with the `EmbeddingStatus` payload on every progress step (throttle: at most every 250 ms) and at the end (`idle` or `error`).

`EmbeddingStatus` (`TS`, camelCase): `{ enabled: bool, state: "disabled" | "idle" | "indexing" | "error", notesDone: u32, notesTotal: u32, chunks: u32, notes: u32, model: String, lastError: Option<String> }`.

**Tests (fake embedder, no network):** define in the test module a deterministic embedder: `fn fake_embedder() -> EmbedFn` that maps text to a 32-dim bag-of-words vector (hash each lowercase word with a simple hash `% 32`, count, no normalisation – the indexer normalises). Then with `open_for_test` and a memory store:

- indexing 3 notes stores chunks for all; running again embeds **nothing** (assert the fake embedder's call counter stays);
- editing one note re-embeds only its changed chunks;
- deleting a note removes it from the store;
- `cloud = true` skips a note in a local-only project and **never passes its text to the embedder** (record all inputs the fake sees and assert the secret text is absent); `cloud = false` embeds it;
- locking a project after indexing (cloud = true) removes its rows;
- cancel stops the job (cancel from the progress callback after the first note);
- changing the model clears old vectors.
  (`run_index` takes the `Connection` through `OpenVault`; for tests construct `open_for_test(dir)` and use a memory connection stored in `v.embeddings`.)

### Task 7.8 – Search

**Files:** create `src-tauri/src/embeddings/search.rs`.

```rust
pub struct SemanticHit { pub path: String, pub title: String, pub heading: String, pub snippet: String, pub score: f32 }   // TS, camelCase

/// Embeds the query and returns the best notes (one hit per note, the best chunk), highest score first.
pub async fn semantic_search(v: &Arc<OpenVault>, embed: &EmbedFn, model: &str, query: &str, folder: Option<&str>, limit: usize) -> AppResult<Vec<SemanticHit>>

/// Reciprocal Rank Fusion of two ranked path lists.
pub fn fuse(keyword: &[String], semantic: &[String], limit: usize) -> Vec<String>
```

`semantic_search`:

1. Empty query → empty result. `embed(vec![query])`, normalise.
2. Get the cached vectors: `v.vector_cache` or load with `store::load_all(conn, model)` and fill the cache (`Arc<Vec<StoredChunk>>`).
3. If `folder` is `Some`, only consider chunks with `paths::is_inside(&path, folder)` (project scope!).
4. `top_k` over `dot(query, chunk.vector)` with `k = limit * 4`, keep the best chunk per path, take `limit`. Drop hits with `score < 0.2` (tunable constant `MIN_SCORE`).
5. Title from the FTS `notes` table (`SELECT title FROM notes WHERE path = ?`) or the file stem. Snippet = first 240 chars of the chunk text after the title line.

`fuse`: standard RRF, `k = 60`, stable ordering for ties.

**Tests:** with the fake embedder and 4 stored notes, "firewall rules" ranks the firewall note first; `folder` restricts results; one hit per note; `MIN_SCORE` removes noise; `fuse` merges lists (an item in both lists ranks first), handles empty lists; cache invalidation works (re-index → new content found).

### Task 7.9 – Commands and events

**Files:** create `src-tauri/src/commands/embeddings.rs`; add to `commands/mod.rs`; register in `lib.rs`; trigger indexing from `commands/vault.rs` and the watcher.

Commands:

| Command                                                                  | Behaviour                                                                                                                                                 |
| ------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `get_embedding_status() -> EmbeddingStatus`                              | current status (+ stats from the store)                                                                                                                   |
| `start_embedding_index(rebuild: bool) -> ()`                             | calls `spawn_index_job`                                                                                                                                   |
| `cancel_embedding_index() -> ()`                                         | cancels the token                                                                                                                                         |
| `semantic_search(query: String, limit: Option<u32>) -> Vec<SemanticHit>` | builds the embedder like `spawn_index_job`; project scoping is **not** applied to the user's own search                                                   |
| `hybrid_search(query: String) -> Vec<SearchHit>`                         | runs keyword `search::search` and `semantic_search`, fuses with `fuse`, returns `SearchHit`s (title, path, snippet = keyword snippet or semantic snippet) |

Triggers:

- end of `open_inner` in `commands/vault.rs`: if settings enable embeddings, `spawn_index_job(app, false)` after the FTS sync thread was started.
- `update_settings`: if the `embeddings` block changed (enabled / provider / model) cancel the running job and start a new one (`rebuild` when the model changed; the store removes other models anyway).
- Watcher (`vault/watcher.rs`): after emitting `vault://index-updated`, if embeddings are enabled call a **debounced** (10 s) `spawn_index_job(app, false)` – implement the debounce with a `static LAST: Mutex<Option<Instant>>` or a flag in `AppState`; never start a job while one runs (the job function cancels/ignores).
- `close_vault`: cancel the job.

**Test (Rust):** `fuse`-based `hybrid_search` helper function tested without Tauri; settings change detection helper `embeddings_changed(old, new) -> Option<bool /*rebuild*/>` unit-tested.

### Task 7.10 – Agent tool "semantic_search"

**Files:** `src-tauri/src/ai/tools.rs`, `src-tauri/src/ai/agent.rs`, `src-tauri/src/ai/prompt.rs`

1. `tools.rs`: add `semantic_search_definition() -> ToolDef` (name `semantic_search`, description "Find notes by meaning. Use for questions where the exact words are unknown. Returns the most relevant passages with their note path.", parameters `{ query: string }`). Do **not** add it to `definitions()`; `agent.rs` appends it only when allowed.
2. `agent.rs`: compute `semantic_allowed`:
   - embeddings enabled, model set, the index has at least one chunk, **and**
   - not (`project.local_only` and the embedding provider's `effective_location() == Cloud`).
     When allowed, push the definition into `tool_defs`.
3. In the tool loop, **before** calling `tools::execute`, branch: `if call.name == "semantic_search" { … }` – parse the args with `parse_args`, call `embeddings::search::semantic_search(&vault, &embed, &model, query, scope.as_deref(), 5).await`, format the result as text:
   ```
   [1] Work/Policy.md — Passwords
   <snippet>
   ```
   Send the usual `ChatEvent::ToolCall { name, summary: format!("Searched by meaning for '{query}'") }`. Errors become `"Error: …"` tool results (same as other tools). When not allowed and the model calls it anyway, return `"Error: semantic search is not available in this project."`.
4. `prompt.rs`: when the tool is offered, append to the base prompt: `- When you use information from search results, cite the note as [[path without .md]].` (pass a flag in `PromptInput`: `semantic_enabled: bool`; update all constructors, including tests).

**Tests:** `semantic_allowed` pure function: enabled+local → true; cloud+localOnly → false; cloud+not-local-only → true; disabled → false; no chunks → false. Prompt contains the citation rule only when the flag is true. Tool result formatting function.

### Task 7.11 – Frontend API and store

**Files:** `src/lib/api.ts`, `src/lib/events.ts`, create `src/stores/embeddingStore.ts`

1. `api.getEmbeddingStatus`, `startEmbeddingIndex(rebuild)`, `cancelEmbeddingIndex`, `semanticSearch(query, limit?)`, `hybridSearch(query)`.
2. `events.ts`: `onEmbeddingStatus(handler)` listening to `embeddings://status`.
3. `embeddingStore`: `{ status: EmbeddingStatus | null; load(); start(rebuild); cancel() }`; subscribe to the event once when a vault is open (in `App.tsx`'s `useBackendEvents`).

### Task 7.12 – Search panel modes

**Files:** `src/features/search/SearchPanel.tsx`, `SearchPanel.test.tsx` (new)

1. Add a segmented control **Keyword | Meaning | Both** above the results. Show it only when `embeddingStore.status?.enabled && status.chunks > 0`; default `both`; remember the choice in `uiStore` (`searchMode`).
2. Modes: keyword → `api.search` (as today); meaning → `api.semanticSearch(text)` mapped to the same list item shape (`title`, `path`, snippet without highlighting + a muted heading line); both → `api.hybridSearch(text)`.
3. Debounce stays 200 ms for keyword; for meaning/both use **500 ms** (each query costs an embedding call). Show a small "Searching…" text while pending. Errors (provider offline) show an inline message "Semantic search is unavailable: <message>" and fall back to keyword results.
4. `tag:`/`path:` tokens: if the text contains them, always use keyword mode (they are keyword filters).
5. When indexing is running show "Indexing 120/800 notes… results may be incomplete" under the control.

**Tests (mock api + store):** control hidden when disabled; visible when enabled; choosing "Meaning" calls `semanticSearch`; text with `tag:x` calls plain `search`; semantic error falls back to keyword results and shows the message.

### Task 7.13 – Settings UI

**Files:** create `src/features/settings/SemanticSearchSettings.tsx`; edit `SettingsDialog.tsx` (tab "AI") and `ProviderEditor.tsx` (no change needed).

Inside the **AI** tab add a section "Semantic search":

1. Checkbox "Enable semantic search" (`draft.ai.embeddings.enabled`).
2. Provider select: only providers with `kind !== "anthropic"`. When the selected provider's `location` is `cloud`, show a warning box: "Note contents are sent to this provider to create embeddings. Notes in projects marked _Local AI only_ are never sent."
3. Model input with the existing `datalist` pattern + **Load models** (calls `api.listModels(providerId)` – requires the provider saved; reuse the `persist()` approach from `ProviderEditor`). Helper text: "Load an embedding model in LM Studio (for example nomic-embed-text) and select it here."
4. Status block from `embeddingStore`: state, `notes`/`chunks` counts, progress bar while indexing, last error in red; buttons **Index now**, **Rebuild index** (confirm dialog: "This re-reads all notes and recreates all embeddings"), **Cancel** while indexing. Buttons call the store; they must first `save(draft)` so the backend has the new settings.
5. The Save button of the dialog saves settings as before; the backend (Task 7.9) starts the job when the block changed.

**Test:** component test with mocked store: warning appears for a cloud provider; Anthropic is not offered; "Rebuild" asks for confirmation before calling `start(true)`.

### Task 7.14 – Docs, manual tests

`CHANGELOG.md`; README (feature + "Set up embeddings in LM Studio" paragraph under _Set up LM Studio_); `docs/DECISIONS.md` (everything in the decisions table, the separate DB, `tools.rs` vs `agent.rs`); manual tests below.

---

## Tests summary (automated)

Rust: settings migration; gitignore; chunker; vector math; response parsing; store; indexer (incremental, deletion, local-only privacy, cancel, model change); search + RRF; `semantic_allowed`; prompt rule; settings-change detection.
Frontend: SearchPanel modes; SemanticSearchSettings; (App smoke test updated for the new settings field).

## Manual tests to add (README section "18. Semantic search") – needs LM Studio with an embedding model loaded

- [ ] Settings → AI → Semantic search: enable, pick LM Studio, **Load models**, choose the embedding model, Save. The status block shows "Indexing…" with a moving progress bar, then "Idle – N notes, M chunks".
- [ ] Open the search panel: the **Keyword | Meaning | Both** control is visible. Search a phrase that appears in no note but is described by one (e.g. "stolen computer" for a note about lost laptops): **Meaning** finds it, **Keyword** does not, **Both** shows it.
- [ ] `tag:something` in the box still works (keyword filter).
- [ ] Edit a note and save: after a few seconds searching for the new text by meaning finds it; the indexing did not freeze typing.
- [ ] Delete a note: it no longer appears in meaning search.
- [ ] Quit and restart: no full re-index (status quickly shows Idle with the same counts); `.vault/embeddings.db` is ignored by Git (`git status` clean).
- [ ] Stop LM Studio's server and search by meaning: a clear message appears and keyword results are still shown.
- [ ] Change the embedding model: the index rebuilds automatically.
- [ ] Assistant: ask "What do our notes say about losing a laptop?": the tool line "Searched by meaning for …" appears and the answer cites `[[…]]` notes.
- [ ] Project chat: the assistant only finds notes from that project folder.
- [ ] **Privacy:** add an OpenAI-compatible **cloud** provider as the embedding provider. A warning is shown. For a project with **Local AI only** ticked: after indexing, notes from that project are **absent** from meaning search results, and the assistant in that project does not offer the tool (ask it to search by meaning; it reports it is unavailable). (Optional proof: run a local HTTP proxy or check the provider's request log – no text from that project is sent.)
- [ ] Locking a project to local AI after it was indexed with a cloud provider removes its vectors (search no longer returns it).
- [ ] **Rebuild index** asks for confirmation, then re-reads everything. **Cancel** stops indexing.
- [ ] 1,000-note vault (`node scripts/gen-vault.mjs …`): indexing completes; a meaning search returns in well under a second.

## Pitfalls

- Never hold a SQLite `MutexGuard` across an `.await`; load what you need, drop the guard, then await.
- `f32` ordering: use `f32::total_cmp`, never `partial_cmp().unwrap()` (NaN would panic – clippy and the no-unwrap rule forbid it).
- The embedding model's input limit is often ~512 tokens: keep chunks ≤ 1 000 characters.
- Do not embed `.vault/` or hidden files: `list_files` already excludes them.
- Do not log note text or vectors (privacy).
- `index.db` and `embeddings.db` are different files with different lifetimes – do not merge them.
- The "local-only" rule is enforced in **three** places: the indexer skips notes, `semantic_allowed` hides the tool, and settings show the warning. Test all three.
