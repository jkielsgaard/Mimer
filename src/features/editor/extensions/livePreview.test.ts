import { markdown, markdownLanguage } from "@codemirror/lang-markdown";
import { EditorSelection, EditorState } from "@codemirror/state";
import { Decoration } from "@codemirror/view";
import { describe, expect, it } from "vitest";
import { LinkResolver } from "@/lib/links";
import { buildDecorations, findFrontmatter } from "./livePreview";
import { defaultPreviewConfig, previewConfig } from "./previewConfig";

function makeState(doc: string, cursor: number): EditorState {
  const resolver = new LinkResolver(["Other.md", "img/pic.png"]);
  return EditorState.create({
    doc,
    selection: EditorSelection.single(cursor),
    extensions: [
      markdown({ base: markdownLanguage }),
      previewConfig.of({
        ...defaultPreviewConfig,
        notePath: "note.md",
        resolveLink: (t) => resolver.resolve(t),
        assetUrl: (p) => `asset://${p}`,
      }),
    ],
  });
}

interface Found {
  hidden: string[];
  marks: string[];
  lines: string[];
  widgets: number;
  blockWidgets: number;
}

function inspect(state: EditorState): Found {
  const out: Found = { hidden: [], marks: [], lines: [], widgets: 0, blockWidgets: 0 };
  const deco = buildDecorations(state);
  deco.between(0, state.doc.length, (from, to, value) => {
    const spec = value.spec as { class?: string; widget?: unknown; block?: boolean };
    if (spec.widget) {
      out.widgets++;
      if (spec.block) out.blockWidgets++;
    } else if (spec.class !== undefined) {
      if (value.point && from === to) out.lines.push(spec.class);
      else out.marks.push(spec.class);
    } else if (value instanceof Decoration && from < to) {
      out.hidden.push(state.sliceDoc(from, to));
    }
  });
  return out;
}

describe("live preview", () => {
  const doc = "# Title\n\nSome **bold** and _it_ text\n\n[a link](https://x.test)\n";
  const line3 = doc.indexOf("Some");
  const line1 = 0;

  it("hides syntax markers on lines without the cursor", () => {
    const f = inspect(makeState(doc, line1));
    expect(f.hidden).toContain("**");
    expect(f.hidden).toContain("_");
    expect(f.hidden).toContain("[");
    expect(f.hidden).toContain("](https://x.test)");
    // The cursor is on the heading line: its "# " marker stays visible.
    expect(f.hidden).not.toContain("# ");
  });

  it("shows markers on the line that has the cursor", () => {
    const f = inspect(makeState(doc, line3 + 3));
    expect(f.hidden).not.toContain("**");
    expect(f.hidden).not.toContain("_");
    // ...and hides the heading marker now that the cursor left that line.
    expect(f.hidden).toContain("# ");
  });

  it("styles text even when markers are visible", () => {
    const f = inspect(makeState(doc, line3 + 3));
    expect(f.marks).toContain("cm-strong");
    expect(f.marks).toContain("cm-em");
    expect(f.lines.some((c) => c.includes("cm-h1"))).toBe(true);
  });

  it("treats every line of a multi-line selection as active", () => {
    const state = makeState(doc, 0).update({
      selection: EditorSelection.single(0, line3 + 5),
    }).state;
    const f = inspect(state);
    expect(f.hidden).not.toContain("# ");
    expect(f.hidden).not.toContain("**");
    expect(f.hidden).toContain("[");
  });

  it("renders task checkboxes and horizontal rules as widgets", () => {
    const state = makeState(
      "- [ ] todo\n- [x] done\n\ntext\n\n---\n\nend",
      doc.length + 100 > 0 ? 28 : 0,
    );
    const f = inspect(state);
    expect(f.widgets).toBeGreaterThanOrEqual(3); // 2 checkboxes + rule
  });

  it("hides wiki-link brackets off-line and styles unresolved links", () => {
    const text = "intro\n\nSee [[Other]] and [[Missing|alias]]\n";
    const off = inspect(makeState(text, 0));
    expect(off.hidden).toContain("[[");
    expect(off.hidden).toContain("]]");
    expect(off.hidden).toContain("Missing|");
    expect(off.marks).toContain("cm-wikilink");
    expect(off.marks).toContain("cm-wikilink cm-wikilink-unresolved");
    const on = inspect(makeState(text, text.indexOf("See") + 2));
    expect(on.hidden).not.toContain("[[");
  });

  it("styles tags but not inside code", () => {
    const text = "a #tag here\n\n`#nope` and\n\n```\n#fenced\n```\n";
    const f = inspect(makeState(text, 0));
    expect(f.marks.filter((c) => c === "cm-tag")).toHaveLength(1);
  });

  it("replaces images with a widget off-line and keeps the syntax on-line", () => {
    const text = "intro\n\n![alt](img/pic.png)\n";
    expect(inspect(makeState(text, 0)).widgets).toBe(1);
    expect(inspect(makeState(text, text.indexOf("![") + 1)).widgets).toBe(0);
  });

  it("collapses frontmatter into a Properties widget unless the cursor is inside", () => {
    const text = "---\ntitle: A\ntags: [x]\n---\n\nBody";
    const fm = findFrontmatter(EditorState.create({ doc: text }).doc);
    expect(fm).toEqual({ from: 0, to: 26 });
    expect(inspect(makeState(text, text.length)).blockWidgets).toBe(1);
    expect(inspect(makeState(text, 6)).blockWidgets).toBe(0);
  });
});

describe("live preview tables", () => {
  const tdoc = "| a | b |\n| - | - |\n| 1 | 2 |\n\ntext";
  it("replaces a valid table with one block widget when the cursor is elsewhere", () => {
    expect(inspect(makeState(tdoc, tdoc.length)).blockWidgets).toBe(1);
  });
  it("shows raw text with the cursor inside", () => {
    expect(inspect(makeState(tdoc, 3)).blockWidgets).toBe(0);
  });
  it("does not render an invalid table", () => {
    expect(inspect(makeState("| a | b |\n| x |", 14)).blockWidgets).toBe(0);
  });
});

describe("live preview of index page markers", () => {
  const doc = "# Work\n\n<!-- mimer:index:start -->\n- [[A]]\n<!-- mimer:index:end -->\n";

  it("hides the marker comments while the cursor is elsewhere", () => {
    const found = inspect(makeState(doc, 0));
    expect(found.hidden).toContain("<!-- mimer:index:start -->");
    expect(found.hidden).toContain("<!-- mimer:index:end -->");
    expect(found.lines).toContain("cm-index-marker");
  });

  it("shows a marker when the cursor is on it", () => {
    const found = inspect(makeState(doc, doc.indexOf("start")));
    expect(found.hidden).not.toContain("<!-- mimer:index:start -->");
    expect(found.hidden).toContain("<!-- mimer:index:end -->");
  });

  it("leaves other HTML comments alone", () => {
    const found = inspect(makeState("<!-- my note to self -->\n\ntext", 30));
    expect(found.hidden).toEqual([]);
  });
});
