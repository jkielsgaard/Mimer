import { describe, expect, it } from "vitest";
import { filterLinkTargets, flattenTree, LinkResolver } from "./links";

const files = [
  "Notes/Alpha.md",
  "Alpha.md",
  "deep/dir/Beta.md",
  "other/Beta.md",
  "img/pic.png",
  "Work/Policy.md",
];

describe("LinkResolver", () => {
  const r = new LinkResolver(files);
  it("resolves by name, case-insensitively, preferring the shortest path", () => {
    expect(r.resolve("alpha")).toBe("Alpha.md");
    expect(r.resolve("Beta")).toBe("other/Beta.md");
    expect(r.resolve("pic.png")).toBe("img/pic.png");
    expect(r.resolve("nothing")).toBeNull();
  });
  it("resolves path form with or without extension", () => {
    expect(r.resolve("deep/dir/Beta")).toBe("deep/dir/Beta.md");
    expect(r.resolve("Notes/Alpha.md")).toBe("Notes/Alpha.md");
  });
  it("gives the shortest unambiguous form", () => {
    expect(r.shortestForm("Work/Policy.md")).toBe("Policy");
    expect(r.shortestForm("deep/dir/Beta.md")).toBe("deep/dir/Beta");
  });
});

describe("filterLinkTargets (wiki-link autocomplete)", () => {
  it("lists notes when the query is empty, skipping attachments", () => {
    const all = filterLinkTargets(files, "");
    expect(all).toContain("Policy");
    expect(all).not.toContain("pic.png");
  });
  it("ranks prefix matches before substring and fuzzy matches", () => {
    const out = filterLinkTargets(["xxpolicy.md", "Policy.md", "p-o-l-i-c-y.md"], "pol");
    expect(out[0]).toBe("Policy");
    expect(out).toContain("xxpolicy");
  });
  it("matches on the path as well as the name", () => {
    expect(filterLinkTargets(files, "work/pol")).toEqual(["Policy"]);
  });
  it("finds attachments when the user types part of the name", () => {
    expect(filterLinkTargets(files, "pic")).toContain("pic.png");
  });
  it("returns nothing for a query that matches nothing", () => {
    expect(filterLinkTargets(files, "zzz")).toEqual([]);
  });
});

describe("flattenTree", () => {
  it("returns file paths only", () => {
    const tree = [
      { path: "a", isDir: true, children: [{ path: "a/b.md", isDir: false, children: [] }] },
      { path: "c.md", isDir: false, children: [] },
    ];
    expect(flattenTree(tree)).toEqual(["a/b.md", "c.md"]);
  });
});
