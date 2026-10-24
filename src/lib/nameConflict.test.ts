import { describe, expect, it } from "vitest";
import type { Project } from "@/bindings/Project";
import type { TreeNode } from "@/bindings/TreeNode";
import { findLookalike, nameError, nameProblem, projectNameError } from "./nameConflict";

const node = (path: string, isDir: boolean, children: TreeNode[] = []): TreeNode => ({
  name: path.split("/").pop() ?? path,
  path,
  isDir,
  children,
  modified: 0,
});

const tree: TreeNode[] = [
  node("Work", true, [node("Work/Plan.md", false), node("Work/Docs", true)]),
  node("Notes.md", false),
  node("photo.png", false),
];

const project = (id: string, name: string, folder: string): Project => ({
  schemaVersion: 1,
  id,
  name,
  folder,
  instructions: "",
  providerId: null,
  localOnly: false,
  createdAt: "",
  updatedAt: "",
});

describe("findLookalike", () => {
  it("finds the same name with other upper/lower case", () => {
    expect(findLookalike(tree, [], "", "work", true)?.kind).toBe("folder");
    expect(findLookalike(tree, [], "Work", "PLAN", false)?.name).toBe("Plan");
  });

  it("counts a note without its .md, so a note and a folder with one name collide", () => {
    expect(findLookalike(tree, [], "", "Notes", true)?.kind).toBe("note");
    expect(findLookalike(tree, [], "Work", "Docs.md", false)?.kind).toBe("folder");
    expect(findLookalike(tree, [], "", "photo", false)).toBeNull();
    expect(findLookalike(tree, [], "", "photo.png", false)?.kind).toBe("file");
  });

  it("calls a project folder a project, and looks only in the chosen folder", () => {
    expect(
      findLookalike(tree, [project("p", "Docs", "Work/Docs")], "Work", "docs", true)?.kind,
    ).toBe("project");
    expect(findLookalike(tree, [], "", "Plan", false)).toBeNull();
  });

  it("does not count the entry being renamed", () => {
    expect(findLookalike(tree, [], "Work", "plan", false, "Work/Plan.md")).toBeNull();
  });
});

describe("nameError", () => {
  it("explains an empty name, bad characters, a leading dot and a taken name", () => {
    expect(nameError(tree, [], "", "  ", false)).toBe("Enter a name.");
    expect(nameError(tree, [], "", "a/b", false)).toContain("cannot contain");
    expect(nameError(tree, [], "", ".hidden", false)).toContain("dot");
    const taken = nameError(tree, [], "Work", "Plan", false);
    expect(taken).toContain("A note called “Plan” already exists in “Work”.");
    expect(taken).toContain("Choose another name.");
    expect(nameError(tree, [], "", "Work", true)).toContain("in the vault root");
  });

  it("accepts a free name", () => {
    expect(nameError(tree, [], "Work", "Ideas", false)).toBeNull();
  });
});

describe("nameProblem", () => {
  it("explains why Windows and OneDrive cannot use a name", () => {
    expect(nameProblem("PAM div.")).toMatch(/end with a dot/);
    expect(nameProblem(".hidden")).toMatch(/start with a dot/);
    expect(nameProblem("a:b")).toMatch(/cannot contain/);
    expect(nameProblem("nul")).toMatch(/Windows keeps/);
    expect(nameProblem("COM3.txt")).toMatch(/Windows keeps/);
    expect(nameProblem("")).toMatch(/Enter a name/);
  });

  it("accepts ordinary names, also with a dot inside", () => {
    expect(nameProblem("PAM div")).toBeNull();
    expect(nameProblem("v1.2 notes")).toBeNull();
    expect(nameProblem("Console")).toBeNull();
    expect(nameProblem("COM0")).toBeNull();
  });
});

describe("projectNameError", () => {
  it("refuses a second project with the same name, ignoring case", () => {
    const ps = [project("a", "Docs", "Work/Docs")];
    expect(projectNameError(ps, " docs ")).toContain("already exists (folder Work/Docs)");
    expect(projectNameError(ps, "docs", "a")).toBeNull();
    expect(projectNameError(ps, "Other")).toBeNull();
  });
});
