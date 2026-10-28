import { describe, expect, it } from "vitest";
import {
  DEFAULT_LAYOUT,
  parseLayout,
  withMoved,
  withoutWidget,
  withWide,
  withWidget,
} from "./startLayout";

describe("parseLayout", () => {
  it("keeps known widgets once and drops the rest", () => {
    expect(
      parseLayout([
        { id: "recent", wide: true },
        { id: "recent", wide: false },
        { id: "nothing", wide: true },
        "x",
        { id: "pinned" },
      ]),
    ).toEqual([
      { id: "recent", wide: true },
      { id: "pinned", wide: false },
    ]);
  });
  it("is null for something that is not a list", () => {
    expect(parseLayout({})).toBeNull();
    expect(parseLayout(null)).toBeNull();
  });
});

describe("editing a layout", () => {
  const start = [...DEFAULT_LAYOUT];
  it("adds a widget once, at the end", () => {
    const a = withWidget(start, "capture");
    expect(a.map((p) => p.id)).toEqual(["continue", "recent", "pinned", "capture"]);
    expect(withWidget(a, "capture")).toHaveLength(4);
  });
  it("removes, moves and widens", () => {
    expect(withoutWidget(start, "recent").map((p) => p.id)).toEqual(["continue", "pinned"]);
    expect(withMoved(start, "pinned", true).map((p) => p.id)).toEqual([
      "continue",
      "pinned",
      "recent",
    ]);
    expect(withMoved(start, "continue", true)).toEqual(start);
    expect(withMoved(start, "pinned", false)).toEqual(start);
    expect(withWide(start, "recent", true)[1]).toEqual({ id: "recent", wide: true });
  });
});
