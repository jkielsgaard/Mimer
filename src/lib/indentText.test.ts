import { describe, expect, it } from "vitest";
import { indentLines, outdentEmptyItem } from "./indentText";

describe("indentLines", () => {
  it("moves a plain line in by two spaces and keeps the caret in the text", () => {
    const r = indentLines("hello", 2, 2, false);
    expect(r).toEqual({ value: "  hello", start: 4, end: 4 });
  });

  it("moves a list item by the width of its marker", () => {
    expect(indentLines("- one\n- two", 9, 9, false).value).toBe("- one\n  - two");
    expect(indentLines("1. one\n2. two", 10, 10, false).value).toBe("1. one\n   2. two");
  });

  it("moves every line a selection touches", () => {
    const r = indentLines("- a\ntext\n- b", 0, 12, false);
    expect(r.value).toBe("  - a\n  text\n  - b");
    expect(r.start).toBe(2);
    expect(r.end).toBe(18);
  });

  it("does not include a line the selection only reaches the start of", () => {
    expect(indentLines("a\nb", 0, 2, false).value).toBe("  a\nb");
  });

  it("moves out, and leaves a line at the left edge", () => {
    expect(indentLines("    plain", 6, 6, true)).toEqual({ value: "  plain", start: 4, end: 4 });
    expect(indentLines("plain", 2, 2, true).value).toBe("plain");
    expect(indentLines("- one\n  - two", 11, 11, true).value).toBe("- one\n- two");
  });

  it("puts the caret at the start of the line when the spaces before it are removed", () => {
    expect(indentLines("  x", 1, 1, true).start).toBe(0);
  });

  it("moves an empty line", () => {
    expect(indentLines("a\n\nb", 2, 2, false).value).toBe("a\n  \nb");
  });
});

describe("outdentEmptyItem", () => {
  it("takes an empty nested item out one level", () => {
    expect(outdentEmptyItem("- one\n  - ", 10)?.value).toBe("- one\n- ");
  });
  it("leaves other lines to the normal Enter", () => {
    expect(outdentEmptyItem("- one\n- ", 8)).toBeNull();
    expect(outdentEmptyItem("- one\n  - two", 13)).toBeNull();
    expect(outdentEmptyItem("plain", 3)).toBeNull();
  });
});
