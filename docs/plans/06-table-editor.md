> **Status: implemented.** See docs/DECISIONS.md and docs/START-GUIDE.md. The text below is the original plan.

# Feature 6 – Table editor

Branch: `feat/table-editor`. Read [README.md](README.md) first. Do this **after** feature 1 (tabs), because both change the editor.

## What the user gets

- Markdown tables are shown as a real table (a widget) when the cursor is not inside them. Cells can be edited directly; a small toolbar adds/removes rows and columns and sets column alignment.
- Keyboard: `Tab` / `Shift+Tab` move between cells, `Enter` moves down, `Tab` in the last cell adds a row.
- **Insert → Table** (`Mod+Alt+T`) inserts a 3×3 table at the cursor.
- A button "Edit as Markdown" switches the table back to raw text; moving the cursor into the raw table keeps working as today.
- The saved file is always clean, aligned GitHub-flavoured Markdown.

This **reverses** the v1 rule "Tables: shown as raw Markdown, no table widget" – record that in `docs/DECISIONS.md`.

## Decisions (already made)

| Question                   | Decision                                                                                                                                                                                     |
| -------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Cell content               | Cells show and edit **raw Markdown text** (`**bold**` stays `**bold**`). No inline rendering in cells in this version                                                                        |
| Pipes in cells             | Written as `\|` when saving; read back as `                                                                                                                                                  | `   |
| Line breaks in cells       | Not supported: pasted newlines become a space                                                                                                                                                |
| Cell editing               | `contenteditable="plaintext-only"` (falls back to `"true"`). Changes are **committed to the document on blur / Enter / Tab**, not on every keystroke (a rebuilt widget would lose the caret) |
| Where do widgets come from | The existing `StateField` in `livePreview.ts` (block decorations must come from a state field, not a plugin)                                                                                 |
| Saved formatting           | Columns padded to the widest cell, alignment row `:---`, `:---:`, `---:` – done by a pure `serializeTable` function                                                                          |
| Ragged rows                | Missing cells are added, extra cells are cut when the table is parsed (header defines the column count)                                                                                      |

---

## Tasks

### Task 6.1 – Pure table model (no CodeMirror yet)

**Files:** create `src/lib/markdownTable.ts` and `src/lib/markdownTable.test.ts`.

```ts
export type Align = "left" | "center" | "right" | null;
export interface Table {
  header: string[];
  align: Align[];
  rows: string[][];
}

export function parseTable(text: string): Table | null; // null if it is not a valid GFM table
export function serializeTable(t: Table): string; // aligned, no trailing newline
export function splitRow(line: string): string[]; // cells of one line, handles \| and leading/trailing pipes
export function escapeCell(text: string): string; // | → \|, newlines → space, trim
export function emptyTable(cols: number, rows: number): Table;

// Pure edit operations – each returns a NEW Table
export function setCell(t: Table, row: number, col: number, value: string): Table; // row -1 = header
export function insertRow(t: Table, afterRow: number): Table; // afterRow -1 inserts at the top of the body
export function deleteRow(t: Table, row: number): Table; // keeps at least 1 body row
export function insertColumn(t: Table, afterCol: number): Table; // afterCol -1 inserts first
export function deleteColumn(t: Table, col: number): Table; // keeps at least 1 column
export function setAlign(t: Table, col: number, align: Align): Table;
```

Parsing rules:

1. Split text into lines; need at least 2 (header + delimiter row).
2. The delimiter row cells match `^\s*:?-{1,}:?\s*$`; otherwise return `null`.
3. `splitRow`: strip one leading and one trailing `|` (not escaped), split on `|` that is **not** preceded by `\`, trim each cell, replace `\|` by `|`.
4. Column count = header length; pad/cut body rows and the alignment array to it.
5. Alignment from the delimiter: `:--` left, `:-:` center, `--:` right, `---` null.

`serializeTable` rules: escape every cell with `escapeCell`; width of a column = max(3, longest cell); pad with spaces (use `padEnd`, for center/right alignment still pad on the right – the Markdown renderers do not care); delimiter cells are `:` + dashes + `:` according to alignment with the same width; each line is `| a | b |`.

**Tests (write them first):**

- parse a simple table; with alignments; with escaped pipes (`a \| b`); without leading/trailing pipes; ragged rows; invalid (no delimiter row, `---` row with letters) → `null`.
- `serializeTable(parseTable(x))` is **idempotent** (running it twice gives the same text) and keeps the content.
- widths: `| a | longer |` columns padded; cells with 1–2 chars still produce `---` minimum.
- every edit operation incl. edges (insert at top, delete last row/col keeps minimum, setAlign).
- `escapeCell("a|b\nc")` → `a\|b c`.

**Done when:** `pnpm test markdownTable` passes. No other file is touched yet.

### Task 6.2 – Find the table around a position

**Files:** create `src/features/editor/extensions/tableRange.ts` + test.

```ts
export function tableAt(
  state: EditorState,
  pos: number,
): { from: number; to: number; text: string } | null;
```

Use `syntaxTree(state).resolveInner(pos, 1)` and walk `.parent` until `node.name === "Table"`; return its `from`/`to` and `state.sliceDoc(from, to)`. Also export `tableNodes(state): {from,to}[]` iterating the tree (used by the decoration builder).

**Test:** build a state with the markdown language (see `livePreview.test.ts`) and a doc with a table; `tableAt` inside the table returns the range, outside returns `null`.

### Task 6.3 – The table widget

**Files:** create `src/features/editor/extensions/tableWidget.ts`.

```ts
export class TableWidget extends WidgetType {
  constructor(readonly source: string) { super(); }
  eq(other: TableWidget) { return other.source === this.source; }   // unchanged tables are not re-rendered
  toDOM(view: EditorView): HTMLElement { … }
  ignoreEvent() { return true; }          // we handle events ourselves
}
```

`toDOM` builds:

```html
<div class="cm-table-widget">
  <div class="cm-table-toolbar">…buttons…</div>
  <div class="cm-table-scroll">
    <table>
      <thead>
        <tr>
          <th contenteditable…>…</th>
        </tr>
      </thead>
      <tbody>
        …
      </tbody>
    </table>
  </div>
</div>
```

1. `const table = parseTable(this.source)`; if `null` render a `<pre>` with the raw text (never crash).
2. Header and body cells are `<th>` / `<td>` with `contenteditable="plaintext-only"`, `data-row` (`-1` for header) and `data-col`, `style.textAlign` from `align`. Text is set with `textContent` (**never `innerHTML`**).
3. **Commit helper:** `commit(view, dom, nextTable)`:
   ```ts
   const pos = view.posAtDOM(dom); // start of the widget = start of the table in the document
   const range = tableAt(view.state, pos); // fresh range from the current document
   if (!range) return;
   view.dispatch({
     changes: { from: range.from, to: range.to, insert: serializeTable(nextTable) },
   });
   ```
   Comparing: if `serializeTable(nextTable) === range.text` do nothing (avoids needless history entries).
4. Cell events:
   - `blur` (use `focusout` on the table): read **all** cell texts from the DOM into a `Table` copy (header, body) and `commit`. This is simpler than tracking individual changes: `readTableFromDom(tableEl, align)`.
   - `keydown` `Enter` (no Shift): `preventDefault`, move focus to the cell below (or blur if last row).
   - `Tab` / `Shift+Tab`: `preventDefault`; compute next/previous cell; at the very last cell, `Tab` calls `insertRow(table, lastRow)` and commits, then focuses the new row's first cell (see "pending focus" below).
   - `Escape`: blur the cell and `view.focus()`.
   - `paste`: `preventDefault`, insert `text/plain` with newlines replaced by spaces via `document.execCommand("insertText", false, text)`.
5. **Pending focus:** when a commit rebuilds the widget the DOM focus is lost. Keep a module variable `pendingFocus: { row: number; col: number } | null`; after `view.dispatch` set it; at the end of `toDOM` (use `queueMicrotask`) if `pendingFocus` is set, focus that cell in the new DOM and clear it.
6. **Toolbar** (buttons are real `<button type="button">` with `aria-label`, lucide icons are not available outside React – use short text/Unicode): _Row above_, _Row below_, _Delete row_, _Column left_, _Column right_, _Delete column_, _Align left/center/right_, _Edit as Markdown_. They act on the **last focused cell** (store it on the widget DOM in `dom.dataset.row/col` on `focusin`; default row 0 col 0). Each button builds the new `Table` with the pure functions and calls `commit`. _Edit as Markdown_: `view.dispatch({ selection: { anchor: range.from } }); view.focus()`.
7. The toolbar is only visible while the widget has focus or hover (CSS `:focus-within`, `:hover`).

### Task 6.4 – Use the widget in the live preview

**Files:** `src/features/editor/extensions/livePreview.ts`

In `buildDecorations`, replace

```ts
case "Table":
  addLines(node.from, node.to, "cm-table");
  return;
```

with:

```ts
case "Table": {
  if (!lineActive(node.from, node.to)) {
    ranges.push(Decoration.replace({ widget: new TableWidget(doc.sliceString(node.from, node.to)), block: true }).range(node.from, node.to));
  } else {
    addLines(node.from, node.to, "cm-table");   // raw text while the cursor is inside
  }
  return false;                                  // do not descend into the table's children
}
```

Important details:

- `return false` also stops the wiki-link/tag scan? **No** – that scan works on raw lines. Add a `tableRanges` array (like `codeRanges`) and skip wiki-link/tag decorations for lines inside a table that is shown as a widget (they are replaced and cannot carry marks).
- A block replace decoration must start at the beginning of a line and end at the end of a line – a Lezer `Table` node does.
- While a widget is shown the cursor can never be "inside" the table with the keyboard; arrow keys jump over it. That is intended; the user uses a cell or "Edit as Markdown".
- If the table is **invalid** per `parseTable` (e.g. half-typed), show raw lines: `if (!parseTable(text)) { addLines(…); return false; }`.

**Tests:** extend `livePreview.test.ts`: a doc with a table and the cursor elsewhere → one block widget; cursor inside the table → no widget and `cm-table` line decorations; invalid table → no widget.

### Task 6.5 – Styles

**Files:** `src/features/editor/editorTheme.ts`

Add rules for `.cm-table-widget`, `.cm-table-scroll` (`overflow-x: auto`), `table` (`border-collapse: collapse`, `width: 100%`), `th, td` (`border: 1px solid var(--border)`, `padding: 4px 8px`, `min-width: 4ch`, `outline: none`), `td:focus, th:focus` (`box-shadow: inset 0 0 0 2px var(--ring)`), `th` (`background: var(--muted)`, `font-weight: 600`), toolbar (`display: none` → `flex` on hover/focus-within, small buttons). Use only the existing CSS variables so dark mode works.

### Task 6.6 – Insert table command

**Files:** `src/features/editor/extensions/commands.ts`, `Editor.tsx`, `Header.tsx`, `src/App.tsx`

1. `insertTable(view, cols = 3, rows = 2)`: builds `serializeTable(emptyTable(cols, rows))`, makes sure it starts on its own line (add `\n` before if the cursor is not at a line start) and ends with a blank line after; inserts it at the selection; moves the cursor to the end.
2. Editor keymap: `{ key: "Mod-Alt-t", run: insertTable }`.
3. A File/Insert menu item "Insert table" in `Header.tsx` – it needs the active `EditorView`: expose it through a tiny module `src/features/editor/activeView.ts` (`setActiveView(view)` / `getActiveView()`) that `Editor.tsx` updates on focus (`onFocusCapture` → `setActiveView(viewRef.current)`).

**Test:** `insertTable` on an empty state yields a parseable table; in the middle of a line it starts a new line first.

### Task 6.6b – Format raw tables on Tab (small, optional but recommended)

When the user types in the **raw** table (cursor inside) and presses `Tab`, format the table and move to the next cell. Implement `formatTableAtCursor(view)` in `commands.ts` using `tableAt` + `parseTable` + `serializeTable`; bind `Tab` in the keymap **only when the cursor is inside a table node** (return `false` otherwise so normal Tab behaviour stays).

### Task 6.7 – Widget DOM tests

**Files:** create `src/features/editor/extensions/tableWidget.test.ts`.

Create an `EditorView` in jsdom with the markdown language, `livePreview()` and a document `"intro\n\n| a | b |\n| --- | --- |\n| 1 | 2 |\n\noutro"` and the selection at 0. Then:

- the DOM contains `.cm-table-widget td` with text `1` and `2`;
- set the text of the first body cell to `x` and dispatch a `focusout` event → the document now contains `| x |` and is still a valid table (`parseTable`);
- clicking the toolbar "Row below" button adds a row (document has one more line);
- a cell containing `|` is stored as `\|`.

If a jsdom limitation blocks `posAtDOM` (it needs layout), call the exported `commit` helper directly in the test with the widget's DOM – make `commit` accept `(view, dom, table)` and export it for this purpose.

### Task 6.8 – Docs and manual tests

Update `CHANGELOG.md`, README (feature list, shortcut `Mod+Alt+T`), `docs/DECISIONS.md` (the decision table + "reverses the v1 table rule"), manual tests below.

---

## Tests summary (automated)

markdownTable (parse/serialize/idempotent/all operations) · tableRange · livePreview table decorations · tableWidget DOM edits · insertTable · formatTableAtCursor.

## Manual tests to add (README section "16. Table editor")

- [ ] Type a Markdown table (header, `---` row, two rows) and move the cursor away: it turns into a real table.
- [ ] Click a cell, change the text, click elsewhere: the Markdown text is updated and aligned (switch to raw with "Edit as Markdown" to check).
- [ ] `Tab` moves right, `Shift+Tab` left, `Enter` down; `Tab` in the last cell adds a row and puts the caret in it.
- [ ] Toolbar: add row above/below, delete row, add column left/right, delete column, alignment buttons – each change shows in the Markdown. Deleting the last remaining row/column does nothing.
- [ ] Type `a|b` in a cell: it is saved as `a\|b` and displays as `a|b` again.
- [ ] Paste text with line breaks into a cell: it becomes one line.
- [ ] **Undo** (`Ctrl+Z`) after a cell edit restores the previous table text.
- [ ] `Mod+Alt+T` inserts a new table at the cursor on its own line.
- [ ] A half-typed table (no `---` row yet) stays as plain text until it is valid.
- [ ] Wide tables scroll horizontally inside the editor instead of breaking the layout.
- [ ] Dark theme: borders, header background and focus ring are visible.
- [ ] A table inside a fenced code block is **not** turned into a widget.
- [ ] Open a note with a table in the **secondary pane** (split view) and edit it there.

## Pitfalls

- Never use `innerHTML` for cell text (note content is untrusted text).
- `view.posAtDOM(dom)` must be called with the **widget's root** element so it returns the table start.
- Do not dispatch on every `input` event; that destroys the widget and the caret.
- The undo history works automatically because the edit is a normal transaction; do **not** add `Transaction.addToHistory.of(false)`.
- ts-eslint `no-unnecessary-condition` will complain about `m[1] ?? ""` on regex groups typed as `string`; destructure with defaults instead (see `tags.ts`).
