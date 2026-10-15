// Pure model of a GitHub-flavoured Markdown table: parse, serialize and edit.
// Every edit returns a new table; nothing is mutated.

export type Align = "left" | "center" | "right" | null;

export interface Table {
  header: string[];
  align: Align[];
  rows: string[][];
}

/** Splits one table line into trimmed cells. `\|` stays a literal pipe inside a cell. */
export function splitRow(line: string): string[] {
  let text = line.trim();
  if (text.startsWith("|")) text = text.slice(1);
  if (text.endsWith("|") && !text.endsWith("\\|")) text = text.slice(0, -1);
  const cells: string[] = [];
  let current = "";
  for (let i = 0; i < text.length; i++) {
    const ch = text[i] ?? "";
    if (ch === "\\" && text[i + 1] === "|") {
      current += "|";
      i++;
    } else if (ch === "|") {
      cells.push(current.trim());
      current = "";
    } else {
      current += ch;
    }
  }
  cells.push(current.trim());
  return cells;
}

/** Makes cell text safe for one table line: no newlines, pipes escaped. */
export function escapeCell(text: string): string {
  return text
    .replace(/\r?\n|\r/g, " ")
    .replace(/\|/g, "\\|")
    .trim();
}

function alignOf(cell: string): Align {
  const left = cell.startsWith(":");
  const right = cell.endsWith(":");
  if (left && right) return "center";
  if (right) return "right";
  if (left) return "left";
  return null;
}

/** Parses a table. Returns null when the text is not a valid table (for example, half-typed). */
export function parseTable(text: string): Table | null {
  const lines = text.split("\n").filter((l) => l.trim() !== "");
  if (lines.length < 2) return null;
  const header = splitRow(lines[0] ?? "");
  const delimiter = splitRow(lines[1] ?? "");
  if (header.length === 0 || !delimiter.every((c) => /^:?-+:?$/.test(c))) return null;
  const cols = header.length;
  const align: Align[] = Array.from({ length: cols }, (_, i) => alignOf(delimiter[i] ?? ""));
  const rows = lines.slice(2).map((line) => {
    const cells = splitRow(line);
    return Array.from({ length: cols }, (_, i) => cells[i] ?? "");
  });
  return { header, align, rows };
}

/** Serializes a table as aligned Markdown (no trailing newline). */
export function serializeTable(t: Table): string {
  const all = [t.header, ...t.rows].map((r) => r.map(escapeCell));
  const widths = t.header.map((_, c) => Math.max(3, ...all.map((r) => r[c]?.length ?? 0)));
  const line = (cells: string[]): string =>
    `| ${cells.map((c, i) => c.padEnd(widths[i] ?? 3)).join(" | ")} |`;
  const delimiter = widths.map((w, i) => {
    switch (t.align[i] ?? null) {
      case "left":
        return `:${"-".repeat(w - 1)}`;
      case "right":
        return `${"-".repeat(w - 1)}:`;
      case "center":
        return `:${"-".repeat(w - 2)}:`;
      default:
        return "-".repeat(w);
    }
  });
  const lines = [line(all[0] ?? []), `| ${delimiter.join(" | ")} |`, ...all.slice(1).map(line)];
  return lines.join("\n");
}

/** A new table with headers "Header 1…" and empty body rows. */
export function emptyTable(cols: number, rows: number): Table {
  return {
    header: Array.from({ length: cols }, (_, i) => `Header ${i + 1}`),
    align: Array.from({ length: cols }, () => null),
    rows: Array.from({ length: rows }, () => Array.from({ length: cols }, () => "")),
  };
}

/** Sets one cell. `row` -1 is the header. */
export function setCell(t: Table, row: number, col: number, value: string): Table {
  const v = escapeCell(value);
  if (row < 0) {
    const header = [...t.header];
    header[col] = v;
    return { ...t, header };
  }
  const rows = t.rows.map((r, i) => (i === row ? r.map((c, j) => (j === col ? v : c)) : r));
  return { ...t, rows };
}

/** Inserts an empty body row after `afterRow` (-1 = at the top of the body). */
export function insertRow(t: Table, afterRow: number): Table {
  const blank = t.header.map(() => "");
  const rows = [...t.rows];
  rows.splice(afterRow + 1, 0, blank);
  return { ...t, rows };
}

/** Deletes a body row. Keeps at least one body row. */
export function deleteRow(t: Table, row: number): Table {
  if (t.rows.length <= 1) return t;
  return { ...t, rows: t.rows.filter((_, i) => i !== row) };
}

/** Inserts an empty column after `afterCol` (-1 = first column). */
export function insertColumn(t: Table, afterCol: number): Table {
  const header = [...t.header];
  header.splice(afterCol + 1, 0, "");
  const align = [...t.align];
  align.splice(afterCol + 1, 0, null);
  const rows = t.rows.map((r) => {
    const copy = [...r];
    copy.splice(afterCol + 1, 0, "");
    return copy;
  });
  return { header, align, rows };
}

/** Deletes a column. Keeps at least one column. */
export function deleteColumn(t: Table, col: number): Table {
  if (t.header.length <= 1) return t;
  return {
    header: t.header.filter((_, i) => i !== col),
    align: t.align.filter((_, i) => i !== col),
    rows: t.rows.map((r) => r.filter((_, i) => i !== col)),
  };
}

/** Sets the alignment of one column. */
export function setAlign(t: Table, col: number, align: Align): Table {
  return { ...t, align: t.align.map((a, i) => (i === col ? align : a)) };
}
