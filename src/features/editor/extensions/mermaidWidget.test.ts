import { EditorState } from "@codemirror/state";
import { markdown, markdownLanguage } from "@codemirror/lang-markdown";
import { describe, expect, it, vi } from "vitest";

const render = vi.hoisted(() => vi.fn());
vi.mock("mermaid", () => ({ default: { initialize: vi.fn(), render } }));

import { draw, mermaidSource } from "./mermaidWidget";
import { buildDecorations } from "./livePreview";

const DOC = "# Title\n\n```mermaid\nflowchart LR\n  A --> B\n```\n\nText after.\n";

function widgets(doc: string, cursor: number): string[] {
  const state = EditorState.create({
    doc,
    selection: { anchor: cursor },
    extensions: [markdown({ base: markdownLanguage })],
  });
  const out: string[] = [];
  buildDecorations(state).between(0, doc.length, (_f, _t, v) => {
    const w = (v.spec as { widget?: { constructor: { name: string } } }).widget;
    if (w) out.push(w.constructor.name);
  });
  return out;
}

describe("Mermaid diagrams in live preview", () => {
  it("reads the code of a mermaid block and ignores other fenced code", () => {
    expect(mermaidSource("```mermaid\nflowchart LR\n  A --> B\n```")).toBe(
      "flowchart LR\n  A --> B",
    );
    expect(mermaidSource("~~~Mermaid\nA --> B\n~~~")).toBe("A --> B");
    expect(mermaidSource("```js\nlet a = 1;\n```")).toBeNull();
    expect(mermaidSource("```mermaid\n```")).toBeNull();
    // No language: a diagram when the first line starts one, ordinary code otherwise.
    expect(mermaidSource("```\ngraph TD;\n  A-->B;\n```")).toBe("graph TD;\n  A-->B;");
    expect(mermaidSource("```\nsequenceDiagram\n  A->>B: hi\n```")).toContain("sequenceDiagram");
    expect(mermaidSource("```\nlet graph = 1;\n```")).toBeNull();
    expect(mermaidSource("```js\ngraph TD\n```")).toBeNull();
  });

  it("draws a diagram when the cursor is elsewhere, and shows the code when it is inside", () => {
    expect(widgets(DOC, DOC.length - 2)).toContain("MermaidWidget");
    expect(widgets(DOC, DOC.indexOf("A -->"))).not.toContain("MermaidWidget");
  });

  it("puts the drawing in the box, and says what is wrong when the diagram has a mistake", async () => {
    const box = document.createElement("div");
    render.mockResolvedValueOnce({ svg: "<svg><title>ok</title></svg>" });
    await draw(box, "flowchart LR\n A --> B");
    expect(box.querySelector("svg")).not.toBeNull();
    render.mockRejectedValueOnce(new Error("Parse error on line 2\nmore"));
    await draw(box, "flowchart LR\n A -->");
    expect(box.querySelector(".cm-mermaid-error")?.textContent).toBe(
      "This diagram cannot be drawn: Parse error on line 2",
    );
    expect(box.querySelector("pre")?.textContent).toBe("flowchart LR\n A -->");
  });
});
