import { beforeEach, describe, expect, it } from "vitest";
import {
  activate,
  closePath,
  emptyLayout,
  filterExisting,
  focusedActive,
  moveToPane,
  openPath,
  removePaths,
  renamePaths,
  reorder,
  unsplit,
  type WorkspaceLayout,
} from "./workspaceStore";

function tabsOf(l: WorkspaceLayout, id: "primary" | "secondary"): string[] {
  return l.panes.find((p) => p.id === id)?.tabs ?? [];
}

describe("workspace helpers", () => {
  let l: WorkspaceLayout;
  beforeEach(() => {
    l = emptyLayout();
  });

  it("opens notes as tabs and activates the new one", () => {
    l = openPath(openPath(l, "a.md"), "b.md");
    expect(tabsOf(l, "primary")).toEqual(["a.md", "b.md"]);
    expect(focusedActive(l)).toBe("b.md");
  });

  it("never opens the same note twice; it focuses the existing tab", () => {
    l = openPath(openPath(l, "a.md"), "b.md");
    l = openPath(l, "a.md");
    expect(tabsOf(l, "primary")).toEqual(["a.md", "b.md"]);
    expect(focusedActive(l)).toBe("a.md");
    l = moveToPane(l, "b.md", "secondary");
    l = openPath(l, "b.md");
    expect(l.focused).toBe("secondary");
    expect(l.panes.map((p) => p.tabs.length)).toEqual([1, 1]);
  });

  it("closing the active tab selects the right neighbour, then the left, then nothing", () => {
    l = openPath(openPath(openPath(l, "a.md"), "b.md"), "c.md");
    l = activate(l, "primary", "b.md");
    l = closePath(l, "b.md");
    expect(focusedActive(l)).toBe("c.md");
    l = closePath(l, "c.md");
    expect(focusedActive(l)).toBe("a.md");
    l = closePath(l, "a.md");
    expect(focusedActive(l)).toBeNull();
  });

  it("moving the last tab out of the secondary pane removes the pane", () => {
    l = moveToPane(openPath(l, "a.md"), "a.md", "secondary");
    expect(l.panes.map((p) => p.id)).toEqual(["primary", "secondary"]);
    expect(tabsOf(l, "secondary")).toEqual(["a.md"]);
    l = moveToPane(l, "a.md", "primary");
    expect(l.panes.map((p) => p.id)).toEqual(["primary"]);
    expect(l.focused).toBe("primary");
  });

  it("closing the last secondary tab focuses the primary pane", () => {
    l = moveToPane(openPath(l, "a.md"), "a.md", "secondary");
    l = closePath(l, "a.md");
    expect(l.panes.map((p) => p.id)).toEqual(["primary"]);
    expect(l.focused).toBe("primary");
  });

  it("unsplit keeps all tabs without duplicates", () => {
    l = openPath(openPath(l, "a.md"), "b.md");
    l = moveToPane(l, "b.md", "secondary");
    l = unsplit(l);
    expect(l.panes).toHaveLength(1);
    expect(tabsOf(l, "primary")).toEqual(["a.md", "b.md"]);
  });

  it("reorders tabs inside a pane", () => {
    l = openPath(openPath(openPath(l, "a.md"), "b.md"), "c.md");
    l = reorder(l, "primary", 2, 0);
    expect(tabsOf(l, "primary")).toEqual(["c.md", "a.md", "b.md"]);
  });

  it("renaming a folder rewrites its notes but not similar names", () => {
    l = openPath(openPath(l, "Work/a.md"), "Workshop/b.md");
    const renamed = renamePaths(l, "Work", "Job");
    expect(tabsOf(renamed, "primary")).toEqual(["Job/a.md", "Workshop/b.md"]);
    const file = renamePaths(openPath(l, "x.md"), "x.md", "y.md");
    expect(focusedActive(file)).toBe("y.md");
  });

  it("deleting a folder closes every tab inside it", () => {
    l = openPath(openPath(openPath(l, "Work/a.md"), "Work/sub/b.md"), "Home.md");
    l = removePaths(l, "Work");
    expect(tabsOf(l, "primary")).toEqual(["Home.md"]);
  });

  it("drops tabs whose files are gone", () => {
    l = openPath(openPath(l, "a.md"), "b.md");
    const f = filterExisting(l, ["a.md"]);
    expect(tabsOf(f, "primary")).toEqual(["a.md"]);
  });
});
