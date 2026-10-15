import { EditorState } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { markdown, markdownLanguage } from "@codemirror/lang-markdown";
import { describe, expect, it } from "vitest";
import { parseTable, serializeTable } from "@/lib/markdownTable";
import { insertTable } from "./commands";
import { buildTableElement, commitTable, readTableFromDom } from "./tableWidget";
import { tableAt, tableNodes } from "./tableRange";
import { livePreview } from "./livePreview";
import { must } from "@/test/must";

const doc = "intro\n\n| a | b |\n| --- | --- |\n| 1 | 2 |\n\noutro";

function view(text: string, cursor = 0): EditorView {
  const parent = document.createElement("div");
  document.body.appendChild(parent);
  return new EditorView({
    parent,
    state: EditorState.create({
      doc: text,
      selection: { anchor: cursor },
      extensions: [markdown({ base: markdownLanguage }), livePreview()],
    }),
  });
}

describe("table ranges", () => {
  it("finds tables and the table at a position", () => {
    const state = EditorState.create({ doc, extensions: [markdown({ base: markdownLanguage })] });
    const [table] = tableNodes(state);
    expect(table?.text).toContain("| 1 | 2 |");
    expect(tableAt(state, doc.indexOf("| 1"))?.from).toBe(table?.from);
    expect(tableAt(state, 0)).toBeNull();
  });
});

describe("table widget DOM", () => {
  it("renders header and body cells as editable text, never as HTML", () => {
    const table = must(parseTable("| <b>x</b> | y |\n| --- | --- |\n| 1 | 2 |"));
    const el = buildTableElement(table);
    expect(el.querySelectorAll("th")).toHaveLength(2);
    expect(el.querySelector("th")?.textContent).toBe("<b>x</b>");
    expect(el.querySelector("th")?.querySelector("b")).toBeNull();
    expect(el.querySelector("td")?.getAttribute("contenteditable")).toBe("plaintext-only");
  });

  it("reads edited cells back from the DOM", () => {
    const table = must(parseTable(doc.split("\n\n")[1] ?? ""));
    const el = buildTableElement(table);
    must(el.querySelector("td")).textContent = "changed";
    const back = readTableFromDom(el, table);
    expect(back.rows[0]).toEqual(["changed", "2"]);
    expect(serializeTable(back)).toContain("changed");
  });

  it("shows the table as a widget when the cursor is outside it", () => {
    const v = view(doc, 0);
    expect(v.dom.querySelector(".cm-table-widget")).not.toBeNull();
    expect(v.dom.querySelectorAll(".cm-table-widget td")).toHaveLength(2);
    v.destroy();
  });

  it("shows raw Markdown while the cursor is inside the table", () => {
    const v = view(doc, doc.indexOf("| 1"));
    expect(v.dom.querySelector(".cm-table-widget")).toBeNull();
    v.destroy();
  });

  it("commitTable writes the new text into the document and skips no-op edits", () => {
    const v = view(doc, 0);
    const widget = must(v.dom.querySelector<HTMLElement>(".cm-table-widget"));
    const table = must(parseTable("| a | b |\n| --- | --- |\n| 1 | 2 |"));
    commitTable(v, widget, table); // writes the aligned form of the same table
    const aligned = v.state.doc.toString();
    expect(aligned).toContain("| a   | b   |");
    commitTable(v, widget, table); // no change left: must not dispatch again
    expect(v.state.doc.toString()).toBe(aligned);
    // The widget was rebuilt by the edit above; a detached old element must be ignored.
    commitTable(v, widget, { ...table, rows: [["x", "2"]] });
    expect(v.state.doc.toString()).toBe(aligned);
    const fresh = must(v.dom.querySelector<HTMLElement>(".cm-table-widget"));
    commitTable(v, fresh, { ...table, rows: [["x", "2"]] });
    expect(v.state.doc.toString()).toContain("| x   | 2   |");
    v.destroy();
  });
});

describe("insertTable", () => {
  it("inserts a parseable table on its own line", () => {
    const v = view("Hello world", 5);
    insertTable(v);
    const text = v.state.doc.toString();
    expect(text).toContain("Hello\n| Header 1");
    expect(parseTable(text.split("\n").slice(1, 4).join("\n"))).not.toBeNull();
    v.destroy();
  });
});
