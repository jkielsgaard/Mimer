import { beforeEach, describe, expect, it, vi } from "vitest";

const api = vi.hoisted(() => ({
  getTreeOrder: vi.fn(),
  setFolderOrder: vi.fn(),
}));
vi.mock("@/lib/api", () => ({ api, toApiError: (e: unknown) => ({ message: String(e) }) }));

import { useTreeStore } from "./treeStore";

describe("treeStore", () => {
  beforeEach(() => {
    localStorage.clear();
    useTreeStore.setState({ expanded: new Set(), filter: "", sort: "name", order: {} });
    vi.clearAllMocks();
    api.setFolderOrder.mockResolvedValue(undefined);
  });

  it("opens and closes a folder", () => {
    useTreeStore.getState().toggle("Work");
    expect(useTreeStore.getState().expanded.has("Work")).toBe(true);
    useTreeStore.getState().toggle("Work");
    expect(useTreeStore.getState().expanded.has("Work")).toBe(false);
  });

  it("expand opens the folder and everything above it", () => {
    useTreeStore.getState().expand("A/B/C");
    expect([...useTreeStore.getState().expanded].sort()).toEqual(["A", "A/B", "A/B/C"]);
  });

  it("expandAncestors opens the folders above a note but not the note", () => {
    useTreeStore.getState().expandAncestors("A/B/note.md");
    expect([...useTreeStore.getState().expanded].sort()).toEqual(["A", "A/B"]);
  });

  it("collapse all closes everything", () => {
    useTreeStore.getState().expand("A/B");
    useTreeStore.getState().collapseAll();
    expect(useTreeStore.getState().expanded.size).toBe(0);
  });

  it("remembers the sort order", () => {
    useTreeStore.getState().setSort("modified");
    expect(localStorage.getItem("mimer-tree-sort")).toBe("modified");
  });

  it("reset clears the open folders and the filter but keeps the sort order", () => {
    useTreeStore.getState().setSort("modified");
    useTreeStore.getState().expand("A");
    useTreeStore.getState().setFilter("x");
    useTreeStore.getState().reset();
    expect(useTreeStore.getState()).toMatchObject({ filter: "", sort: "modified" });
    expect(useTreeStore.getState().expanded.size).toBe(0);
  });

  describe("my own order", () => {
    it("loads the saved order, and treats a failure as no order", async () => {
      api.getTreeOrder.mockResolvedValueOnce({ folders: { Work: ["b.md", "a.md"] } });
      await useTreeStore.getState().loadOrder();
      expect(useTreeStore.getState().order).toEqual({ Work: ["b.md", "a.md"] });
      api.getTreeOrder.mockRejectedValueOnce(new Error("no"));
      await useTreeStore.getState().loadOrder();
      expect(useTreeStore.getState().order).toEqual({});
    });

    it("saving one folder changes only that folder, and an empty list removes it", async () => {
      useTreeStore.setState({ order: { Work: ["a.md"], "": ["x"] } });
      await useTreeStore.getState().setFolderOrder("Work", ["b.md", "a.md"]);
      expect(api.setFolderOrder).toHaveBeenCalledWith("Work", ["b.md", "a.md"]);
      expect(useTreeStore.getState().order).toEqual({ Work: ["b.md", "a.md"], "": ["x"] });
      await useTreeStore.getState().setFolderOrder("Work", []);
      expect(useTreeStore.getState().order).toEqual({ "": ["x"] });
    });

    it("a rename in the same folder keeps the place", () => {
      useTreeStore.setState({ order: { Work: ["a.md", "b.md", "c.md"] } });
      useTreeStore.getState().orderRenamed("Work/b.md", "Work/B2.md");
      expect(useTreeStore.getState().order.Work).toEqual(["a.md", "B2.md", "c.md"]);
      expect(api.setFolderOrder).toHaveBeenCalledWith("Work", ["a.md", "B2.md", "c.md"]);
    });

    it("moving an item to another folder removes it from the old list", () => {
      useTreeStore.setState({ order: { Work: ["a.md", "b.md"] } });
      useTreeStore.getState().orderRenamed("Work/a.md", "Other/a.md");
      expect(useTreeStore.getState().order.Work).toEqual(["b.md"]);
    });

    it("renaming a folder moves its own list along", () => {
      useTreeStore.setState({
        order: { Work: ["a.md"], "Work/Sub": ["z.md"], "": ["Work", "Home.md"] },
      });
      useTreeStore.getState().orderRenamed("Work", "Job");
      const order = useTreeStore.getState().order;
      expect(order.Job).toEqual(["a.md"]);
      expect(order["Job/Sub"]).toEqual(["z.md"]);
      expect(order[""]).toEqual(["Job", "Home.md"]);
      expect(order.Work).toBeUndefined();
      expect(api.setFolderOrder).toHaveBeenCalledWith("Work", []);
    });
  });
});
