import { describe, expect, it } from "vitest";
import {
  addAfter,
  addChild,
  countNodes,
  frontTags,
  indentAt,
  insertAfter,
  joinText,
  moveBy,
  nodeAt,
  outdentAt,
  parseIndentedText,
  parsePlan,
  planTitle,
  removeAt,
  removeMany,
  samePath,
  serializePlan,
  setText,
  splitText,
  walk,
} from "./planTree";

const NOTE = `---
tags: [plan]
---
# Move the office

Before 1 March.

- Find the new place [[Tasks/Find the new place]]
  - Visit the three offices
  - Ask Mette about the budget
- Network and internet [[Network plan]]
  - Order the fibre line
- Moving day

Some words after the list.
`;

describe("parsePlan", () => {
  it("reads the ideas as a tree and keeps everything around the list", () => {
    const p = parsePlan(NOTE);
    expect(p.nodes.map((n) => n.text)).toEqual([
      "Find the new place [[Tasks/Find the new place]]",
      "Network and internet [[Network plan]]",
      "Moving day",
    ]);
    expect(p.nodes[0]?.children.map((n) => n.text)).toEqual([
      "Visit the three offices",
      "Ask Mette about the budget",
    ]);
    expect(p.head.join("\n")).toContain("# Move the office");
    expect(p.tail.join("\n")).toContain("Some words after the list.");
  });

  it("writes back exactly what it read when nothing changed", () => {
    expect(serializePlan(parsePlan(NOTE))).toBe(NOTE);
  });

  it("makes a list of the ideas even when the note was written with other marks and tabs", () => {
    const p = parsePlan("# P\n\n* One\n\t* Two\n    + Three\n* Four\n");
    expect(serializePlan(p)).toBe("# P\n\n- One\n  - Two\n  - Three\n- Four\n");
  });

  it("does not take a checklist line for an idea, and a note with no list has none", () => {
    expect(parsePlan("# P\n\n- [ ] A task\n- [x] Another\n").nodes).toEqual([]);
    const none = parsePlan("# P\n\nJust words.\n");
    expect(none.nodes).toEqual([]);
    expect(serializePlan(none)).toBe("# P\n\nJust words.\n");
    const mixed = parsePlan("# P\n\n- An idea\n- [ ] A task\n");
    expect(mixed.nodes.map((n) => n.text)).toEqual(["An idea"]);
    expect(serializePlan(mixed)).toBe("# P\n\n- An idea\n- [ ] A task\n");
  });

  it("lets a blank line sit inside the list when more ideas follow", () => {
    const p = parsePlan("# P\n\n- A\n\n- B\n\nAfter.\n");
    expect(p.nodes.map((n) => n.text)).toEqual(["A", "B"]);
    expect(p.tail.join("\n")).toContain("After.");
  });
});

describe("the words of an idea", () => {
  it("splits the words from the links and puts them together again", () => {
    expect(splitText("Find it [[Tasks/Find it]] [[Notes|a note]]")).toEqual({
      plain: "Find it",
      links: ["Tasks/Find it", "Notes"],
    });
    expect(joinText("Find it", ["Tasks/Find it"])).toBe("Find it [[Tasks/Find it]]");
    expect(joinText("", [])).toBe("");
  });
});

describe("changing the ideas", () => {
  const base = parsePlan("- A\n  - A1\n  - A2\n- B\n").nodes;

  it("adds an idea under another, after another, and at the top", () => {
    const under = addChild(base, [0], "A3");
    expect(under.path).toEqual([0, 2]);
    expect(nodeAt(under.nodes, [0, 2])?.text).toBe("A3");
    const after = addAfter(base, [0, 0], "Between");
    expect(after.path).toEqual([0, 1]);
    expect(after.nodes[0]?.children.map((n) => n.text)).toEqual(["A1", "Between", "A2"]);
    expect(addChild(base, [], "C").nodes.map((n) => n.text)).toEqual(["A", "B", "C"]);
    // The list that was given is not changed.
    expect(countNodes(base)).toBe(4);
  });

  it("puts a whole branch in after an idea", () => {
    const branch = { text: "C", children: [{ text: "C1", children: [] }] };
    const r = insertAfter(base, [0], branch);
    expect(r.path).toEqual([1]);
    expect(r.nodes.map((n) => n.text)).toEqual(["A", "C", "B"]);
    expect(nodeAt(r.nodes, [1, 0])?.text).toBe("C1");
  });

  it("changes the words, removes one idea or several", () => {
    expect(nodeAt(setText(base, [1], "Bee"), [1])?.text).toBe("Bee");
    expect(countNodes(removeAt(base, [0]))).toBe(1);
    const some = removeMany(base, [[0, 1], [1], [0, 0]]);
    expect(some.map((n) => n.text)).toEqual(["A"]);
    expect(some[0]?.children).toEqual([]);
  });

  it("moves an idea among those on its level, and not past the ends", () => {
    const down = moveBy(base, [0], 1);
    expect(down.nodes.map((n) => n.text)).toEqual(["B", "A"]);
    expect(down.path).toEqual([1]);
    expect(moveBy(base, [0], -1).nodes.map((n) => n.text)).toEqual(["A", "B"]);
    expect(moveBy(base, [0, 1], 1).path).toEqual([0, 1]);
  });

  it("goes one level in and one level out", () => {
    const inside = indentAt(base, [1]);
    expect(inside.path).toEqual([0, 2]);
    expect(inside.nodes[0]?.children.map((n) => n.text)).toEqual(["A1", "A2", "B"]);
    expect(indentAt(base, [0]).path).toEqual([0]);
    const out = outdentAt(base, [0, 1]);
    expect(out.path).toEqual([1]);
    expect(out.nodes.map((n) => n.text)).toEqual(["A", "A2", "B"]);
    expect(outdentAt(base, [0]).path).toEqual([0]);
  });

  it("lists every idea with its place", () => {
    expect(walk(base).map((w) => w.path.join("."))).toEqual(["0", "0.0", "0.1", "1"]);
    expect(samePath([0, 1], [0, 1])).toBe(true);
    expect(samePath([0], null)).toBe(false);
  });
});

describe("planTitle", () => {
  it("is the first heading, or the fallback", () => {
    expect(planTitle(NOTE, "x")).toBe("Move the office");
    expect(planTitle("no heading", "File name")).toBe("File name");
  });
});

describe("frontTags", () => {
  it("reads the tags of the properties in both forms", () => {
    expect(frontTags("---\ntags: [plan, Plan-Finished]\n---\n# A\n")).toEqual([
      "plan",
      "plan-finished",
    ]);
    expect(frontTags("---\ntitle: A\ntags:\n  - plan\n  - vpn\nwith: x\n---\n")).toEqual([
      "plan",
      "vpn",
    ]);
    expect(frontTags("# No properties")).toEqual([]);
  });
});

describe("parseIndentedText", () => {
  it("reads one idea on each line, indented for smaller parts, and drops bullets", () => {
    const nodes = parseIndentedText("- Move\n  - Van\n  - Staff\n    1. Tell them\nSign\n");
    expect(nodes.map((n) => n.text)).toEqual(["Move", "Sign"]);
    expect(nodes[0]?.children.map((n) => n.text)).toEqual(["Van", "Staff"]);
    expect(nodes[0]?.children[1]?.children[0]?.text).toBe("Tell them");
  });
});
