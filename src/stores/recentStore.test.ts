import { beforeEach, describe, expect, it } from "vitest";
import { MAX_RECENT, useRecent } from "./recentStore";

describe("recent notes", () => {
  beforeEach(() => {
    localStorage.clear();
    useRecent.getState().reset();
    useRecent.getState().load("/v", ["a.md", "b.md", "c.md", "Work/d.md"]);
  });

  it("puts the newest note first and does not list a note twice", () => {
    const { push } = useRecent.getState();
    push("a.md");
    push("b.md");
    push("a.md");
    expect(useRecent.getState().paths).toEqual(["a.md", "b.md"]);
  });

  it("keeps only the latest few", () => {
    for (let i = 0; i < MAX_RECENT + 4; i++) useRecent.getState().push(`n${String(i)}.md`);
    expect(useRecent.getState().paths).toHaveLength(MAX_RECENT);
    expect(useRecent.getState().paths[0]).toBe(`n${String(MAX_RECENT + 3)}.md`);
  });

  it("is remembered per vault and drops notes that are gone", () => {
    useRecent.getState().push("a.md");
    useRecent.getState().push("b.md");
    useRecent.getState().reset();
    useRecent.getState().load("/v", ["a.md"]);
    expect(useRecent.getState().paths).toEqual(["a.md"]);
    useRecent.getState().load("/other", ["a.md"]);
    expect(useRecent.getState().paths).toEqual([]);
  });

  it("follows a rename of a note or a folder and forgets deleted ones", () => {
    const s = useRecent.getState();
    s.push("Work/d.md");
    s.push("a.md");
    s.rename("Work", "Projects");
    expect(useRecent.getState().paths).toEqual(["a.md", "Projects/d.md"]);
    useRecent.getState().rename("a.md", "z.md");
    expect(useRecent.getState().paths).toEqual(["z.md", "Projects/d.md"]);
    useRecent.getState().remove("Projects");
    expect(useRecent.getState().paths).toEqual(["z.md"]);
  });

  it("survives bad stored data", () => {
    localStorage.setItem("mimer-recent:/bad", "{not json");
    useRecent.getState().load("/bad", ["a.md"]);
    expect(useRecent.getState().paths).toEqual([]);
  });

  it("a rename never leaves the same note in the list twice", () => {
    const s = useRecent.getState();
    s.push("a.md");
    // The tab was already renamed and visited under the new name when the rename is recorded.
    s.push("z.md");
    s.rename("a.md", "z.md");
    expect(useRecent.getState().paths).toEqual(["z.md"]);
  });
});
