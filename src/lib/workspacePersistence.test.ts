import { beforeEach, describe, expect, it } from "vitest";
import { loadLayout, saveLayout, validateLayout } from "./workspacePersistence";
import { emptyLayout, openPath } from "@/stores/workspaceStore";

describe("workspace persistence", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("round-trips a layout per vault", () => {
    const layout = openPath(openPath(emptyLayout(), "a.md"), "b.md", "secondary");
    saveLayout("/vault", layout);
    expect(loadLayout("/vault")).toEqual(layout);
    expect(loadLayout("/other")).toBeNull();
  });

  it("returns null for corrupt JSON", () => {
    localStorage.setItem("mimer.workspace./vault", "{not json");
    expect(loadLayout("/vault")).toBeNull();
  });

  it("rejects wrong shapes", () => {
    expect(validateLayout(null)).toBeNull();
    expect(validateLayout({ panes: "x", focused: "primary" })).toBeNull();
    expect(
      validateLayout({ panes: [{ id: "primary", tabs: [1], active: null }], focused: "primary" }),
    ).toBeNull();
    expect(
      validateLayout({
        panes: [{ id: "secondary", tabs: [], active: null }],
        focused: "secondary",
      }),
    ).toBeNull();
    expect(
      validateLayout({ panes: [{ id: "primary", tabs: [], active: null }], focused: "other" }),
    ).toBeNull();
  });
});
