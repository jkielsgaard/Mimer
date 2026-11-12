import { describe, expect, it } from "vitest";
import { inShortMarkdown, parseInShort } from "./inShort";

describe("parseInShort", () => {
  it("reads the points and the things to do", () => {
    const r = parseInShort(
      "POINTS\n- One licence per person.\n- Support is included.\n\nTODO\n- Order the renewal\n- Check the seats",
    );
    expect(r.points).toEqual(["One licence per person.", "Support is included."]);
    expect(r.todos).toEqual(["Order the renewal", "Check the seats"]);
  });

  it("copes with bold headings, colons, numbers and tick boxes", () => {
    const r = parseInShort("**Points:**\n1. A point\n\n**To do:**\n- [ ] Call Peter\n* Send it");
    expect(r.points).toEqual(["A point"]);
    expect(r.todos).toEqual(["Call Peter", "Send it"]);
  });

  it("treats lines before any heading as points, and NONE as nothing to do", () => {
    const r = parseInShort("- First\n- Second\nTODO\nNONE");
    expect(r.points).toEqual(["First", "Second"]);
    expect(r.todos).toEqual([]);
  });

  it("keeps at most five points and eight things to do, and drops very long lines", () => {
    const many = Array.from({ length: 9 }, (_, i) => `- Item ${String(i)}`).join("\n");
    const r = parseInShort(`POINTS\n${many}\nTODO\n${many}\n- ${"x".repeat(300)}`);
    expect(r.points).toHaveLength(5);
    expect(r.todos).toHaveLength(8);
  });
});

describe("inShortMarkdown", () => {
  it("writes the points as a list and the things to do as tick boxes", () => {
    expect(inShortMarkdown({ points: ["A"], todos: ["B"] })).toBe("- A\n\n- [ ] B\n");
    expect(inShortMarkdown({ points: ["A"], todos: [] })).toBe("- A\n");
  });
});
