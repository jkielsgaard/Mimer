> **Status: implemented.** See docs/DECISIONS.md and docs/START-GUIDE.md. The text below is the original plan.

# Feature 5 – Export to HTML, PDF and Word

Branch: `feat/export`. Read [README.md](README.md) first.

## What the user gets

**File → Export…** (also right-click on a note or folder → Export…) opens a dialog:

- **What:** this note, or this folder (all notes in it, in name order, as one document with an optional table of contents). For a project folder this is "export the whole project".
- **Format:** HTML (one self-contained file), PDF, or Word (`.docx`).
- Options: include table of contents (folder export), include frontmatter properties (off by default).

## Decisions (already made)

| Question                      | Decision                                                                                                                                                                                                        | Why                                                                                   |
| ----------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| HTML generation               | `pulldown-cmark` (already a dependency) → HTML in Rust                                                                                                                                                          | No new crate, fast, testable                                                          |
| Raw HTML inside notes         | **Escaped, never passed through** (map `Event::Html`/`InlineHtml` to escaped text)                                                                                                                              | Notes can contain anything; the output must never run scripts                         |
| Images                        | Embedded as `data:` URIs (HTML) or bytes (Word). Only files inside the vault (`paths::resolve`), max 10 MB each; otherwise the alt text is shown                                                                | Self-contained files; no path leaks; no network                                       |
| Wiki-links                    | `[[Note]]`/`[[Note\|alias]]` become the alias/target text. In a **folder** export a link to a note that is part of the export becomes an in-document anchor link                                                | Works offline                                                                         |
| `![[image.png]]` embeds       | Become normal images                                                                                                                                                                                            | Same as in the editor                                                                 |
| Frontmatter                   | Removed unless "include properties" is on (then a small table at the top)                                                                                                                                       | Usually noise                                                                         |
| PDF                           | **Not generated in Rust.** The app shows the HTML in a print view and opens the **system print dialog** (`Save as PDF` is offered by every OS). Uses the Tauri window print call                                | No heavy PDF crate, perfect layout from the same HTML/CSS                             |
| PDF fallback                  | If the print call turns out unavailable on a platform (see Task 5.0 spike) write the HTML to a temp file, open it in the browser with `tauri-plugin-opener` (`open_path`) and tell the user to print from there | Always works                                                                          |
| Word                          | `docx-rs` crate, built from the same Markdown events. Lists use text prefixes (`• `, `1. `) with indentation instead of Word numbering definitions (limitation – document it)                                   | Keeps it small                                                                        |
| Where is the file written?    | The user picks the path with the **save dialog** (`@tauri-apps/plugin-dialog` `save`). The backend writes there. Add capability `dialog:allow-save`                                                             | Standard OS behaviour; no new write scope needed because the backend does the writing |
| Does export modify the vault? | No. No commits                                                                                                                                                                                                  | Read-only feature                                                                     |

---

## Tasks

### Task 5.0 – Spike: can the app print? (½ day, do this first)

1. In the Fedora container run `grep -rn "pub fn print" ~/.cargo/registry/src/*/tauri-2*/src/webview/*.rs` to confirm `WebviewWindow::print()` exists (it opens the system print dialog).
2. Create a throw-away Tauri command `print_window(window: tauri::WebviewWindow) -> Result<(), AppError> { window.print().map_err(|e| AppError::Io(e.to_string())) }`, call it from the dev tools console / a temporary button, and check on **Linux** (and Windows if you have access) that a print dialog appears with a "Print to file / Save as PDF" option.
3. Write the result in `docs/DECISIONS.md` ("PDF export: print dialog works on …"). If it does **not** work on a platform, implement the fallback in Task 5.9.
4. Keep `print_window` (it becomes a real command in 5.8); delete the temporary button.

### Task 5.1 – Add dependencies

**Files:** `src-tauri/Cargo.toml`, `docs/DECISIONS.md`

```bash
cargo add docx-rs
cargo add --dev zip        # tests unzip the generated .docx
cargo add base64
```

`base64` encodes images for HTML; `docx-rs` writes Word files; `zip` (dev only) lets tests read the `.docx`. Add one line each to `DECISIONS.md` with the reason. Run `cargo check` – if `docx-rs` pulls a very new edition requirement fix versions with `cargo add docx-rs@<latest 0.4.x>`.

### Task 5.2 – Relative path resolution in Rust

**Files:** `src-tauri/src/vault/paths.rs`

Add (a Rust twin of `resolveRelativePath` in `src/lib/utils.ts`):

```rust
/// Resolves a link relative to a note (`../attachments/a%20b.png`) to a vault-relative path.
/// Returns None for URLs, `#anchors`, or paths that escape the vault.
pub fn resolve_relative(note_path: &str, href: &str) -> Option<String>
```

Rules: reject anything matching `^[a-zA-Z][a-zA-Z0-9+.-]*:` (URL scheme), starting with `#` or `//`; percent-decode (write a tiny decoder for `%XX`; invalid sequences stay as is); drop `#…` and `?…`; start from the note's folder (or root if href starts with `/`); apply `.`/`..`; `..` above the root → `None`; empty result → `None`.

**Tests:** same cases as `src/lib/utils.test.ts` (`../attachments/my%20pic.png` from `Work/n.md` → `attachments/my pic.png`; `https://x` → None; `../../etc/passwd` → None; `#h` → None).

### Task 5.3 – Markdown → HTML core

**Files:** create `src-tauri/src/export/mod.rs`, `src-tauri/src/export/html.rs`; add `pub mod export;` to `lib.rs`.

Types in `mod.rs` (derive `Serialize, Deserialize, TS`, camelCase, `#[ts(export)]`):

```rust
pub enum ExportFormat { Html, Pdf, Docx }          // serde lowercase
pub enum ExportScope  { Note, Folder }             // serde lowercase
pub struct ExportRequest { pub scope: ExportScope, pub path: String, pub format: ExportFormat,
                           pub include_toc: bool, pub include_properties: bool }
pub struct ExportResult { pub notes_included: u32, pub bytes_written: u32 }   // u32 is fine (≤ 4 GB)
```

`html.rs` – the central function:

```rust
pub struct Doc { pub path: String, pub title: String, pub markdown: String }   // one note

/// Converts notes to a complete, self-contained HTML document.
pub fn render_html(v: &OpenVault, docs: &[Doc], opts: &RenderOptions) -> String
```

Steps inside (implement as small private functions, each with tests):

1. `strip_frontmatter(markdown)` – use `markdown::frontmatter::split`; if `include_properties` keep the YAML and render it as a two-column `<table class="properties">` (parse with `yaml_rust2`; if parsing fails show nothing).
2. `rewrite_wikilinks(markdown, resolver, exported_paths, note_path) -> String` – iterate `markdown::links::parse_wikilinks` **from the end to the start** (so byte offsets stay valid) and replace each range:
   - embed of an image file (`resolver.resolve(target)` ends with an image extension) → `![alt](<resolved path with spaces as %20>)` where alt = the target;
   - otherwise → if the target resolves to a path that is in `exported_paths` **and** this is a folder export → `[text](#note-<slug(path)>)`; else plain `text`, where `text` = alias without the leading `|`, else target (+ heading if present).
     (`parse_wikilinks` already ignores code blocks and frontmatter.)
3. Parse with `pulldown_cmark::Parser::new_ext(&md, Options::ENABLE_STRIKETHROUGH | ENABLE_TABLES | ENABLE_TASKLISTS | ENABLE_FOOTNOTES)`; map the event stream:
   - `Event::Html(s)` / `Event::InlineHtml(s)` → `Event::Text(s)` (**escaping happens in `push_html`**);
   - `Event::Start(Tag::Image { dest_url, .. })` → replace `dest_url` with `image_data_uri(v, note_path, &dest_url)` (below) – if it returns `None` keep an empty URL and the alt text still shows;
   - `Event::Start(Tag::Link { dest_url, .. })`: only allow `http:`, `https:`, `mailto:` and `#…`; anything else (`javascript:`, `file:`, relative paths) → `dest_url = "#"`.
4. `pulldown_cmark::html::push_html(&mut body, events)`.
5. `image_data_uri(v, note_path, href) -> Option<String>`: if `href` starts with `data:` return it; `resolve_relative(note_path, href)?` (for links already rewritten from `![[ ]]` the path is vault-relative – try `resolve_relative` first, then the path as-is); `paths::resolve(&v.root, &rel, None).ok()?`; metadata size ≤ 10 MB; read; mime from extension (png, jpg/jpeg, gif, webp, svg → `image/svg+xml`, bmp, avif); `format!("data:{mime};base64,{}", base64::engine::general_purpose::STANDARD.encode(bytes))`.
6. Wrap in the template: `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>…</title><style>CSS</style></head><body><main>…</main></body></html>`. Put the CSS in `src-tauri/src/export/style.css` and include it with `include_str!("style.css")`. The CSS: readable typography (system font stack, max-width 780px, line-height 1.6), tables with borders, code blocks with background, blockquote bar, `img { max-width: 100% }`, task list checkboxes, and a `@media print` block (`@page { margin: 18mm }`, no max-width, `h1,h2,h3 { break-after: avoid }`, `pre, table, img { break-inside: avoid }`, `a { color: inherit; text-decoration: none }`, `.doc { break-before: page }` for folder exports except the first).
7. Folder export: for each doc emit `<section class="doc" id="note-<slug>"><h1 class="doc-title">title</h1>…</section>`; with `include_toc` put `<nav class="toc"><h2>Contents</h2><ul><li><a href="#note-…">title</a></li>…</ul></nav>` first. `slug(path)` = lowercase, non-alphanumerics → `-`, collapse repeats. Single note export: no wrapper heading unless the note has no `# ` heading (then add `<h1>` with the title).
8. Escape the document `<title>` text.

**Tests (use `open_for_test` + write notes with `ops::write_note`):**

- headings, bold, lists, tables, task list (`<input disabled …>`), strikethrough, fenced code (`<pre><code class="language-rust">`) render;
- **raw HTML is escaped**: a note containing `<script>alert(1)</script>` and `<img src=x onerror=…>` produces `&lt;script&gt;` and never a real `<script` tag (assert `!html.contains("<script")`);
- `javascript:` link becomes `#`;
- frontmatter removed by default; with the option a properties table appears;
- wiki-links: alias used; link to a note in a folder export becomes `href="#note-…"`; link to a missing note is plain text; links inside code are untouched;
- images: a PNG in `attachments/` is embedded as `data:image/png;base64,`; `![[pic.png]]` too; an image outside the vault (`../../etc/passwd`) and one over 10 MB are **not** embedded; an `http://` image is not fetched (kept as is is fine – but the CSP blocks it; prefer dropping it: `None`);
- folder export order is alphabetical by path, with TOC links matching section ids;
- title escaping (`<` in a note title).

### Task 5.4 – Collect notes for an export

**Files:** `src-tauri/src/export/mod.rs`

```rust
/// Notes for the request: one note, or every `.md` under a folder sorted by path (case-insensitive).
pub fn collect(v: &OpenVault, req: &ExportRequest) -> AppResult<Vec<Doc>>
```

- Note scope: `paths::resolve(&v.root, &req.path, None)?`, must be a file ending in `.md` (else `InvalidPath`), read with `fs_ops::read_note`.
- Folder scope: `paths::resolve_dir`; use `v.file_list()` filtered by `is_inside(path, folder)` and `tree::is_markdown`; error `NotFound` if empty ("No notes in this folder").
- Title = first heading (`markdown::first_heading`) else file stem (`links::resolve::note_stem`).

**Tests:** order, hidden files excluded (`file_list` already excludes them), empty folder error, non-md file error.

### Task 5.5 – Word (`.docx`) writer

**Files:** create `src-tauri/src/export/docx.rs`.

```rust
/// Builds a .docx from the same notes. Returns the file bytes.
pub fn render_docx(v: &OpenVault, docs: &[Doc], opts: &RenderOptions) -> AppResult<Vec<u8>>
```

Reuse steps 1–2 of `render_html` (strip frontmatter, rewrite wiki-links) by moving them into a shared `prepare_markdown(v, doc, …) -> String` in `export/mod.rs`.

Walk the pulldown-cmark events and build with `docx_rs::Docx`:

| Markdown                             | Word                                                                                                                                                                                                                                                                                                                                                                             |
| ------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `# … ######`                         | paragraph with style `Heading1`…`Heading6` (`Docx::add_style` for Heading1–3 with larger bold runs; others bold)                                                                                                                                                                                                                                                                 |
| paragraph                            | `Paragraph::new()` with runs                                                                                                                                                                                                                                                                                                                                                     |
| `**bold**`, `*italic*`, `~~strike~~` | `Run::bold()`, `.italic()`, `.strike()` (track a stack of active styles while walking)                                                                                                                                                                                                                                                                                           |
| inline code                          | run with `fonts(RunFonts::new().ascii("Consolas"))` and light shading                                                                                                                                                                                                                                                                                                            |
| fenced / indented code               | one paragraph per line, monospace, shaded, `Run::add_text` and `Run::add_break` avoided                                                                                                                                                                                                                                                                                          |
| link                                 | `Hyperlink::new(url, HyperlinkType::External).add_run(…)` for `http(s)`/`mailto`; otherwise plain text                                                                                                                                                                                                                                                                           |
| image                                | `Pic::new(&bytes)` from the vault file (same 10 MB/inside-vault rules) with the width limited to 15 cm (`size()` takes EMU: width/height of the image – read dimensions with the `image`-free approach: use `Pic::new` defaults then scale `.size(w, h)` keeping aspect ratio if you can read PNG/JPEG headers; if not, fixed `w = 5_400_000` EMU and keep the library's aspect) |
| bullet / ordered list                | paragraphs with `indent(Some(360 * depth), …)` and a text prefix `• ` or `1. ` (a counter per list)                                                                                                                                                                                                                                                                              |
| blockquote                           | paragraph indented by 720 with italic runs                                                                                                                                                                                                                                                                                                                                       |
| horizontal rule                      | paragraph containing `────────`                                                                                                                                                                                                                                                                                                                                                  |
| table                                | `Table::new(rows)` with `TableRow`/`TableCell` and borders; header row bold                                                                                                                                                                                                                                                                                                      |
| task item                            | prefix `☐ ` / `☑ `                                                                                                                                                                                                                                                                                                                                                               |

Between notes in a folder export add a page break (`Paragraph::new().add_run(Run::new().add_break(BreakType::Page))`). TOC: a simple list of titles (not a Word field).

Finish with `docx.build().pack(&mut cursor)` into a `Cursor<Vec<u8>>`; map errors to `AppError::Io`.

**Tests:** call `render_docx`, then open the bytes with `zip::ZipArchive`, read `word/document.xml` to a string and assert it contains the heading text, a bold run (`<w:b`), a table (`<w:tbl>`), a hyperlink for `https://example.com`, and that raw HTML text appears **as text** (the XML escaped). Assert the zip also contains `[Content_Types].xml`. A note with an image adds `word/media/`.

### Task 5.6 – The export command

**Files:** create `src-tauri/src/commands/export.rs`; add to `commands/mod.rs`; register in `lib.rs`.

```rust
/// Renders the notes and writes the result to `target_path` (chosen by the user in the save dialog).
#[tauri::command]
pub async fn export_document(state: State<'_, AppState>, request: ExportRequest, target_path: String) -> Result<ExportResult, AppError>

/// Returns the HTML for the print view (PDF export).
#[tauri::command]
pub async fn export_preview_html(state: State<'_, AppState>, request: ExportRequest) -> Result<String, AppError>

#[tauri::command]
pub async fn print_window(window: tauri::WebviewWindow) -> Result<(), AppError>
```

`export_document` rules:

- `ExportFormat::Pdf` is not valid here → `AppError::InvalidPath("PDF is exported through the print view")`.
- `target_path` must be absolute, its parent must exist, and its extension must be `.html` (Html) or `.docx` (Docx) – append it if missing. It must **not** be inside the vault's `.git` or `.vault` folders (`!path.components().any(|c| c == ".git" || c == ".vault")`).
- Heavy work (`collect`, rendering, file writing) runs in `tauri::async_runtime::spawn_blocking` so the UI stays responsive.
- Write with `std::fs::write` to a temp name next to the target then `rename` (atomic).
- Overwrite confirmation is done by the OS save dialog.

Commands must stay thin: all logic is in `export::mod` functions (`export::run(v, request, target) -> AppResult<ExportResult>`), tested directly.

**Tests:** `export::run` writes a file for Html and Docx (check the content), refuses Pdf, refuses a relative target path, refuses a target containing `.git`.

### Task 5.7 – Frontend API, capability, dialog

**Files:** `src/lib/api.ts`, `src-tauri/capabilities/default.json`, create `src/features/export/ExportDialog.tsx` and `ExportDialog.test.tsx`, `src/stores/uiStore.ts`, `src/App.tsx`, `Header.tsx`, `FileTree.tsx`

1. `api.exportDocument(request, targetPath)`, `api.exportPreviewHtml(request)`, `api.printWindow()`.
2. Capabilities: add `"dialog:allow-save"` to `permissions` (next to `dialog:allow-open`).
3. `uiStore`: `exportDialog: { path: string; isFolder: boolean } | null` + `openExportDialog(state)`.
4. `ExportDialog`: radio group Format (HTML / PDF / Word), checkbox "Include table of contents" (only for folders), checkbox "Include properties". Shows what will be exported ("Note: Work/Plan.md" or "Folder: Work (12 notes)" – count from `vaultStore.files`).
   - HTML/Word: `const target = await save({ defaultPath: \`${basename}.${ext}\`, filters: [{ name, extensions: [ext] }] })`(from`@tauri-apps/plugin-dialog`); if `null`(cancelled) do nothing; call`await flushPendingWrites()`**before** exporting so the file on disk is current; call`api.exportDocument`; toast `Exported N note(s) to <file>`.
   - PDF: `flushPendingWrites()`, then `printStore.start(request)` (Task 5.8) and close the dialog.
5. Entry points: File menu "Export…" (uses the active note; disabled if none) and file tree context menu "Export…" on notes and folders.

**Test:** mock `@/lib/api` and `@tauri-apps/plugin-dialog`; choose HTML, click Export → `save` called with `.html` default name and `exportDocument` called with `format: "html"`; cancelling the dialog makes no API call; PDF does not call `save`.

### Task 5.8 – PDF through the print view

**Files:** create `src/stores/printStore.ts`, `src/features/export/PrintView.tsx`, edit `src/index.css`, `src/App.tsx`.

1. `printStore`: `{ html: string | null; start(request): Promise<void>; finish(): void }`. `start` calls `api.exportPreviewHtml(request)` and stores the HTML (errors → `reportError`).
2. `PrintView` renders only when `html !== null`: a fixed full-screen overlay (`fixed inset-0 z-[70] overflow-auto bg-white`) with a top bar (title, **Print / Save as PDF** button, **Close** button, hint text) and `<div id="print-root" dangerouslySetInnerHTML={{ __html: bodyHtml }} />`. Safety: the HTML comes from our own backend which escapes raw HTML (Task 5.3). Extract the `<style>` and `<body>` content: parse with `new DOMParser().parseFromString(html, "text/html")`, inject `doc.head.querySelector("style")?.textContent` into a `<style>` tag inside the overlay and use `doc.body.innerHTML` for the body. Add a code comment explaining why `dangerouslySetInnerHTML` is acceptable here.
3. The **Print** button calls `api.printWindow()`. Also call it automatically once the view is shown? **No** – let the user check the preview first.
4. CSS in `index.css`:
   ```css
   @media print {
     html,
     body,
     #root {
       height: auto !important;
       overflow: visible !important;
     }
     body > #root > *:not(.print-overlay) {
       display: none !important;
     } /* hide the app */
     .print-overlay {
       position: static !important;
       overflow: visible !important;
     }
     .print-bar {
       display: none !important;
     }
   }
   ```
   (adjust selectors to the real DOM: render `PrintView` as a sibling of the app inside `#root`, i.e. in `App.tsx` next to `<Toasts />`, and give the overlay the class `print-overlay`.)
5. `Esc` closes the view.

**Done when:** exporting a note as PDF shows the preview; **Print / Save as PDF** opens the system dialog; the resulting PDF contains only the note (no app chrome).

### Task 5.9 – Fallback if printing is unavailable (only if the spike failed)

In `print_window` (or the frontend) if the call errors: write the HTML to the OS temp dir (`std::env::temp_dir().join("mimer-export-<uuid>.html")`), open it with `app.opener().open_path(...)`, and show the toast "Your browser opened the document. Use its Print command to save a PDF." Add one unit test for the temp file writer function.

### Task 5.10 – Docs and manual tests

`CHANGELOG.md`, README (feature list; mention the PDF route), `docs/DECISIONS.md` (decision table, dependencies, spike result), manual tests below.

---

## Tests summary (automated)

Rust: `resolve_relative`; html conversion (all cases in 5.3, especially XSS and image rules); `collect`; docx structure; `export::run` safety (format, path rules). Frontend: ExportDialog (HTML, cancel, PDF).

## Manual tests to add (README section "17. Export")

Prepare a note with: heading, **bold**, a table, a task list, a code block, an `![[image.png]]`, a pasted screenshot, a `[[link]]` to another note, a `https://` link, and some raw HTML like `<b>x</b><script>alert(1)</script>`.

- [ ] **Export → HTML**: open the file in a browser: looks clean, the images show (even after moving the file to another computer/folder), the `[[link]]` is plain text, raw HTML is visible as text, **no alert appears**.
- [ ] **Export → Word**: open in Word/LibreOffice: headings, bold, table, list, code and images are there; the https link is clickable.
- [ ] **Export → PDF**: the preview appears; **Print / Save as PDF** opens the system dialog; the saved PDF has only the note, readable page breaks (no table split across pages when it fits).
- [ ] Right-click a folder → Export → HTML with table of contents: one document, notes in name order, TOC links jump to the notes; `[[links]]` between exported notes jump too.
- [ ] Cancel the save dialog: nothing is written and no error appears.
- [ ] Export while the open note has unsaved edits: the export contains the latest text.
- [ ] A note referencing an image outside the vault (`![](../../secret.png)`) does not embed it.
- [ ] Exporting does not create any commit (`git log` unchanged) and does not change the vault (`git status` clean).
- [ ] Exporting a folder with 200 notes keeps the UI responsive (you can type while it runs).

## Pitfalls

- `push_html` escapes `Event::Text`, so converting raw HTML events to text is enough – do **not** add a sanitising crate.
- Rewrite wiki-links from the **end** of the string to the start so earlier byte offsets stay valid.
- `docx-rs` APIs change between 0.4.x versions; follow the compiler errors and keep to the table in 5.5. Do not try to implement real Word numbering.
- Never let the frontend choose a path inside `.git`/`.vault`; the check lives in Rust.
- The print CSS must hide the app; test with the **real** print dialog, not just the preview.
