import { EditorView, WidgetType } from "@codemirror/view";
import {
  deleteColumn,
  deleteRow,
  insertColumn,
  insertRow,
  parseTable,
  serializeTable,
  setAlign,
  type Align,
  type Table,
} from "@/lib/markdownTable";
import { tableAt } from "./tableRange";

interface CellPos {
  row: number;
  col: number;
}

/** Cell to focus after the next rebuild of the widget (set by a commit). */
let pendingFocus: CellPos | null = null;

/** Reads the table as the user sees it in the DOM. */
export function readTableFromDom(dom: HTMLElement, base: Table): Table {
  const headerCells = Array.from(dom.querySelectorAll("thead th"));
  const header = headerCells.map((c) => (c.textContent as string | null) ?? "");
  const rows = Array.from(dom.querySelectorAll("tbody tr")).map((tr) =>
    Array.from(tr.querySelectorAll("td")).map((td) => (td.textContent as string | null) ?? ""),
  );
  return {
    header: header.length > 0 ? header : base.header,
    align: base.align,
    rows: rows.length > 0 ? rows.map((r) => r.slice(0, base.header.length)) : base.rows,
  };
}

/**
 * Writes an edited table back into the document, replacing the table at the widget's position.
 * Does nothing when the text would not change. Exported for tests.
 */
export function commitTable(
  view: EditorView,
  dom: HTMLElement,
  table: Table,
  focus?: CellPos,
): void {
  // A widget that was already replaced must not write its stale content back.
  if (!dom.isConnected) return;
  const range = tableAt(view.state, view.posAtDOM(dom));
  if (!range) return;
  const text = serializeTable(table);
  if (text === range.text) return;
  pendingFocus = focus ?? null;
  view.dispatch({ changes: { from: range.from, to: range.to, insert: text } });
}

/** Builds the table element for a parsed table (no event wiring). Exported for tests. */
export function buildTableElement(table: Table): HTMLTableElement {
  const el = document.createElement("table");
  const thead = document.createElement("thead");
  const headRow = document.createElement("tr");
  table.header.forEach((text, col) => {
    const th = document.createElement("th");
    th.setAttribute("contenteditable", "plaintext-only");
    th.dataset.row = "-1";
    th.dataset.col = String(col);
    th.style.textAlign = alignToCss(table.align[col] ?? null);
    th.textContent = text;
    headRow.appendChild(th);
  });
  thead.appendChild(headRow);
  el.appendChild(thead);
  const tbody = document.createElement("tbody");
  table.rows.forEach((cells, row) => {
    const tr = document.createElement("tr");
    cells.forEach((text, col) => {
      const td = document.createElement("td");
      td.setAttribute("contenteditable", "plaintext-only");
      td.dataset.row = String(row);
      td.dataset.col = String(col);
      td.style.textAlign = alignToCss(table.align[col] ?? null);
      td.textContent = text;
      tr.appendChild(td);
    });
    tbody.appendChild(tr);
  });
  el.appendChild(tbody);
  return el;
}

function alignToCss(a: Align): string {
  return a ?? "left";
}

/** The rendered table shown in place of Markdown when the cursor is outside it. */
export class TableWidget extends WidgetType {
  constructor(readonly source: string) {
    super();
  }

  override eq(other: TableWidget): boolean {
    return other.source === this.source;
  }

  override ignoreEvent(): boolean {
    return true;
  }

  override toDOM(view: EditorView): HTMLElement {
    const root = document.createElement("div");
    root.className = "cm-table-widget";
    const table = parseTable(this.source);
    if (!table) {
      const pre = document.createElement("pre");
      pre.textContent = this.source;
      root.appendChild(pre);
      return root;
    }

    let last: CellPos = { row: 0, col: 0 };
    const toolbar = document.createElement("div");
    toolbar.className = "cm-table-toolbar";
    const scroll = document.createElement("div");
    scroll.className = "cm-table-scroll";
    const el = buildTableElement(table);
    scroll.appendChild(el);

    // Applies a structural edit to the table as currently shown (edits typed but not yet
    // committed are included), then commits it.
    const edit = (fn: (t: Table, at: CellPos) => { table: Table; focus?: CellPos }): void => {
      const current = readTableFromDom(el, table);
      const result = fn(current, last);
      commitTable(view, root, result.table, result.focus);
    };

    const button = (label: string, title: string, run: () => void): HTMLButtonElement => {
      const b = document.createElement("button");
      b.type = "button";
      b.textContent = label;
      b.title = title;
      b.setAttribute("aria-label", title);
      b.addEventListener("mousedown", (e) => {
        e.preventDefault(); // keep focus where it is
      });
      b.addEventListener("click", run);
      return b;
    };

    const actions: [string, string, () => void][] = [
      [
        "Row ↑",
        "Insert row above",
        () => {
          edit((t, at) => ({ table: insertRow(t, Math.max(at.row - 1, -1)) }));
        },
      ],
      [
        "Row ↓",
        "Insert row below",
        () => {
          edit((t, at) => ({ table: insertRow(t, at.row) }));
        },
      ],
      [
        "−Row",
        "Delete row",
        () => {
          edit((t, at) => ({ table: at.row < 0 ? t : deleteRow(t, at.row) }));
        },
      ],
      [
        "Col ←",
        "Insert column left",
        () => {
          edit((t, at) => ({ table: insertColumn(t, at.col - 1) }));
        },
      ],
      [
        "Col →",
        "Insert column right",
        () => {
          edit((t, at) => ({ table: insertColumn(t, at.col) }));
        },
      ],
      [
        "−Col",
        "Delete column",
        () => {
          edit((t, at) => ({ table: deleteColumn(t, at.col) }));
        },
      ],
      [
        "Left",
        "Align column left",
        () => {
          edit((t, at) => ({ table: setAlign(t, at.col, "left") }));
        },
      ],
      [
        "Center",
        "Align column center",
        () => {
          edit((t, at) => ({ table: setAlign(t, at.col, "center") }));
        },
      ],
      [
        "Right",
        "Align column right",
        () => {
          edit((t, at) => ({ table: setAlign(t, at.col, "right") }));
        },
      ],
      [
        "Markdown",
        "Edit as Markdown",
        () => {
          const range = tableAt(view.state, view.posAtDOM(root));
          if (range) view.dispatch({ selection: { anchor: range.from } });
          view.focus();
        },
      ],
    ];
    for (const [label, title, run] of actions) toolbar.appendChild(button(label, title, run));
    root.appendChild(toolbar);
    root.appendChild(scroll);

    el.addEventListener("focusin", (e) => {
      const target = e.target as HTMLElement;
      if (target.dataset.col !== undefined) {
        last = { row: Number(target.dataset.row), col: Number(target.dataset.col) };
      }
    });
    el.addEventListener("focusout", (e) => {
      const next = e.relatedTarget as Node | null;
      if (next && root.contains(next)) return; // still inside the widget
      commitTable(view, root, readTableFromDom(el, table));
    });
    el.addEventListener("keydown", (e) => {
      const target = e.target as HTMLElement;
      if (target.dataset.col === undefined) return;
      const row = Number(target.dataset.row);
      const col = Number(target.dataset.col);
      const cols = table.header.length;
      const bodyRows = table.rows.length;
      if (e.key === "Escape") {
        e.preventDefault();
        target.blur();
        view.focus();
      } else if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        if (row + 1 < bodyRows) focusCell(el, row + 1, col);
        else target.blur();
      } else if (e.key === "Tab") {
        e.preventDefault();
        const forward = !e.shiftKey;
        let nextRow = row;
        let nextCol = col + (forward ? 1 : -1);
        if (nextCol >= cols) {
          nextCol = 0;
          nextRow = row + 1;
        } else if (nextCol < 0) {
          nextCol = cols - 1;
          nextRow = row - 1;
        }
        if (nextRow > bodyRows - 1 && forward) {
          // Tab in the last cell adds a row and moves into it.
          const current = readTableFromDom(el, table);
          commitTable(view, root, insertRow(current, bodyRows - 1), { row: bodyRows, col: 0 });
          return;
        }
        if (nextRow < -1) return;
        focusCell(el, nextRow, nextCol);
      }
    });
    el.addEventListener("paste", (e) => {
      e.preventDefault();
      const text = (e.clipboardData?.getData("text/plain") ?? "").replace(/\r?\n|\r/g, " ");
      const sel = window.getSelection();
      if (sel && sel.rangeCount > 0) {
        sel.deleteFromDocument();
        sel.getRangeAt(0).insertNode(document.createTextNode(text));
        sel.collapseToEnd();
      }
    });

    if (pendingFocus) {
      const focus = pendingFocus;
      pendingFocus = null;
      queueMicrotask(() => {
        if (root.isConnected) focusCell(el, focus.row, focus.col);
      });
    }
    return root;
  }
}

function focusCell(el: HTMLTableElement, row: number, col: number): void {
  const selector = `[data-row="${row}"][data-col="${col}"]`;
  const cell = el.querySelector<HTMLElement>(selector);
  cell?.focus();
}
