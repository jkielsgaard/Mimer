import { describe, expect, it } from "vitest";
import type { TreeNode } from "@/bindings/TreeNode";
import {
  ancestorsOf,
  countNotes,
  filterTree,
  findFolder,
  folderNoteCounts,
  pinFirst,
  placeNames,
  stepName,
  visibleNames,
  withoutManagedNotes,
  sortTree,
  topLevelPaths,
  withoutFolders,
  withoutImages,
} from "./treeUtils";

const file = (path: string, modified = 0): TreeNode => ({
  name: path.split("/").pop() ?? path,
  path,
  isDir: false,
  children: [],
  modified,
});
const dir = (path: string, children: TreeNode[]): TreeNode => ({
  name: path.split("/").pop() ?? path,
  path,
  isDir: true,
  children,
  modified: 0,
});

const tree: TreeNode[] = [
  dir("Work", [
    file("Work/b.md", 100),
    file("Work/A.md", 300),
    dir("Work/Sec", [file("Work/Sec/Policy.md", 200), file("Work/Sec/pic.png", 50)]),
  ]),
  file("Home.md", 10),
  file("zeta.md", 400),
];

describe("countNotes", () => {
  it("counts only notes, also inside sub-folders", () => {
    expect(countNotes(tree[0] as TreeNode)).toBe(3);
    expect(countNotes(file("a.png"))).toBe(0);
    expect(countNotes(dir("Empty", []))).toBe(0);
  });
});

describe("sortTree", () => {
  it("by name keeps folders first and sorts without regard to case", () => {
    const names = sortTree(tree[0]?.children ?? [], "name").map((n) => n.name);
    expect(names).toEqual(["Sec", "A.md", "b.md"]);
  });

  it("by last change puts the newest files first inside every folder, folders stay first", () => {
    const sorted = sortTree(tree, "modified");
    expect(sorted.map((n) => n.name)).toEqual(["Work", "zeta.md", "Home.md"]);
    expect(sorted[0]?.children.map((n) => n.name)).toEqual(["Sec", "A.md", "b.md"]);
    expect(sorted[0]?.children[0]?.children.map((n) => n.name)).toEqual(["Policy.md", "pic.png"]);
  });

  it("does not change the tree it was given", () => {
    const before = tree.map((n) => n.name);
    sortTree(tree, "modified");
    expect(tree.map((n) => n.name)).toEqual(before);
  });
});

describe("filterTree", () => {
  it("keeps matching notes with the folders above them", () => {
    const got = filterTree(tree, "policy");
    expect(got.map((n) => n.name)).toEqual(["Work"]);
    expect(got[0]?.children.map((n) => n.name)).toEqual(["Sec"]);
    expect(got[0]?.children[0]?.children.map((n) => n.name)).toEqual(["Policy.md"]);
  });

  it("a folder whose name matches is kept whole", () => {
    const got = filterTree(tree, "SEC");
    expect(got[0]?.children[0]?.children).toHaveLength(2);
  });

  it("an empty filter returns everything and no match returns nothing", () => {
    expect(filterTree(tree, "  ")).toHaveLength(3);
    expect(filterTree(tree, "nothing like this")).toEqual([]);
  });
});

describe("ancestorsOf", () => {
  it("lists the folders above a path, outermost first", () => {
    expect(ancestorsOf("A/B/c.md")).toEqual(["A", "A/B"]);
    expect(ancestorsOf("c.md")).toEqual([]);
  });
});

describe("projects and pinned folders", () => {
  const vault: TreeNode[] = [
    dir("Archive", [file("Archive/old.md")]),
    dir("Meetings", [file("Meetings/m.md")]),
    dir("Work", [dir("Work/Security", [file("Work/Security/p.md")]), file("Work/plan.md")]),
    dir("Empty", []),
  ];

  it("withoutFolders takes the given folders out at any depth, and leaves the input alone", () => {
    const got = withoutFolders(vault, ["Work/Security", "Archive"]);
    expect(got.map((n) => n.path)).toEqual(["Meetings", "Work", "Empty"]);
    expect(got[1]?.children.map((n) => n.path)).toEqual(["Work/plan.md"]);
    expect(vault).toHaveLength(4);
    expect(vault[2]?.children).toHaveLength(2);
  });

  it("findFolder finds a folder at any depth and ignores files", () => {
    expect(findFolder(vault, "Work/Security")?.children).toHaveLength(1);
    expect(findFolder(vault, "Work/plan.md")).toBeNull();
    expect(findFolder(vault, "Nope")).toBeNull();
  });

  it("folderNoteCounts lists folders that hold notes, sub-folders included", () => {
    const counts = folderNoteCounts(vault);
    expect(counts.get("Work")).toBe(2);
    expect(counts.get("Work/Security")).toBe(1);
    expect(counts.has("Empty")).toBe(false);
  });

  it("pinFirst moves the named top-level folders to the top, in that order", () => {
    expect(pinFirst(vault, ["Meetings", "Quick notes", "Work"]).map((n) => n.path)).toEqual([
      "Meetings",
      "Work",
      "Archive",
      "Empty",
    ]);
    expect(pinFirst(vault, []).map((n) => n.path)).toEqual(vault.map((n) => n.path));
  });
});

describe("topLevelPaths", () => {
  it("drops items that are inside another item of the list", () => {
    expect(topLevelPaths(["Work", "Work/Plan.md", "Home.md", "Workshop/a.md"])).toEqual([
      "Work",
      "Home.md",
      "Workshop/a.md",
    ]);
  });
});

describe("my own order", () => {
  const vault: TreeNode[] = [
    dir("Archive", [file("Archive/a.md"), file("Archive/b.md")]),
    file("Home.md"),
    dir("Work", [file("Work/x.md"), file("Work/y.md"), file("Work/z.md")]),
  ];

  it("follows the chosen order with folders and files mixed, and puts new items last", () => {
    const got = sortTree(vault, "manual", { "": ["Home.md", "Work"] });
    expect(got.map((n) => n.name)).toEqual(["Home.md", "Work", "Archive"]);
  });

  it("orders each folder by its own list and ignores names that no longer exist", () => {
    const got = sortTree(vault, "manual", { Work: ["z.md", "gone.md", "x.md"] });
    const work = got.find((n) => n.name === "Work");
    expect(work?.children.map((n) => n.name)).toEqual(["z.md", "x.md", "y.md"]);
  });

  it("without a list it falls back to folders first, by name", () => {
    expect(sortTree(vault, "manual").map((n) => n.name)).toEqual(["Archive", "Work", "Home.md"]);
  });

  it("the other sort modes ignore the chosen order", () => {
    const got = sortTree(vault, "name", { "": ["Home.md"] });
    expect(got.map((n) => n.name)).toEqual(["Archive", "Work", "Home.md"]);
  });

  it("a project tree is ordered by the project folder's list", () => {
    const inside = [file("Work/x.md"), file("Work/y.md")];
    expect(
      sortTree(inside, "manual", { Work: ["y.md", "x.md"] }, "Work").map((n) => n.name),
    ).toEqual(["y.md", "x.md"]);
  });

  it("placeNames puts items before or after a target and keeps the rest in order", () => {
    const names = ["a", "b", "c", "d"];
    expect(placeNames(names, ["d"], "b", "before")).toEqual(["a", "d", "b", "c"]);
    expect(placeNames(names, ["a"], "c", "after")).toEqual(["b", "c", "a", "d"]);
    expect(placeNames(names, ["a", "b"], "d", "after")).toEqual(["c", "d", "a", "b"]);
    expect(placeNames(names, ["x"], "missing", "before")).toEqual(["a", "b", "c", "d", "x"]);
  });

  it("stepName moves one place and stops at the ends", () => {
    expect(stepName(["a", "b", "c"], "b", -1)).toEqual(["b", "a", "c"]);
    expect(stepName(["a", "b", "c"], "b", 1)).toEqual(["a", "c", "b"]);
    expect(stepName(["a", "b", "c"], "a", -1)).toEqual(["a", "b", "c"]);
    expect(stepName(["a", "b", "c"], "nope", 1)).toEqual(["a", "b", "c"]);
  });

  it("visibleNames lists a folder as the tree shows it", () => {
    expect(visibleNames(vault, { Work: ["z.md"] }, "Work")).toEqual(["z.md", "x.md", "y.md"]);
    expect(visibleNames(vault, {}, "")).toEqual(["Archive", "Work", "Home.md"]);
  });
});

describe("withoutImages", () => {
  it("hides pictures and folders that only held pictures, keeps notes and empty folders", () => {
    const imported = [
      dir("Imported/Notebook", [
        file("Imported/Notebook/Page.md"),
        file("Imported/Notebook/doc.pdf"),
        dir("Imported/Notebook/images", [
          file("Imported/Notebook/images/a.png"),
          file("Imported/Notebook/images/b.JPG"),
        ]),
        dir("Imported/Notebook/Empty", []),
      ]),
    ];
    const got = withoutImages(imported);
    const names = (got[0]?.children ?? []).map((n) => n.name);
    expect(names).toEqual(["Page.md", "doc.pdf", "Empty"]);
  });
});

describe("withoutManagedNotes", () => {
  it("hides the notes Mimer keeps itself, only in the vault root", () => {
    const node = (path: string, isDir = false): TreeNode => ({
      name: path.split("/").pop() ?? path,
      path,
      isDir,
      children: [],
      modified: 0,
    });
    const tree = [node("Ideas.md"), node("Home.md"), node("Work", true), node("Work/Ideas.md")];
    const shown = withoutManagedNotes(tree).map((n) => n.path);
    expect(shown).toEqual(["Home.md", "Work", "Work/Ideas.md"]);
  });
});
