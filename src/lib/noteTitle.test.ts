import { describe, expect, it } from "vitest";
import {
  fileNameFromTitle,
  firstHeading,
  isUntitledName,
  planTitleRename,
  uniqueNotePath,
} from "./noteTitle";

describe("firstHeading", () => {
  it("finds the first top-level heading", () => {
    expect(firstHeading("# Weekly sync\n\ntext")).toBe("Weekly sync");
    expect(firstHeading("intro\n\n# Later title\n")).toBe("Later title");
  });

  it("is null while the heading is empty or missing", () => {
    expect(firstHeading("# ")).toBeNull();
    expect(firstHeading("#")).toBeNull();
    expect(firstHeading("just text")).toBeNull();
    expect(firstHeading("## Only a sub heading")).toBeNull();
  });

  it("skips frontmatter and code blocks", () => {
    expect(firstHeading("---\ntags: [a]\n---\n# After properties")).toBe("After properties");
    expect(firstHeading("```\n# not a title\n```\n# Real")).toBe("Real");
  });

  it("strips emphasis, code marks and link syntax", () => {
    expect(firstHeading("# **Bold** and `code`")).toBe("Bold and code");
    expect(firstHeading("# Plan for [[Q1 budget]]")).toBe("Plan for Q1 budget");
    expect(firstHeading("# See [docs](https://x.dk)")).toBe("See docs");
    expect(firstHeading("# Closing hashes ##")).toBe("Closing hashes");
  });
});

describe("fileNameFromTitle", () => {
  it("removes characters the system does not allow and tidies spaces", () => {
    expect(fileNameFromTitle("Q1: plan? <draft>")).toBe("Q1 plan draft");
    expect(fileNameFromTitle("  a   b  ")).toBe("a b");
    expect(fileNameFromTitle("Notes. . ")).toBe("Notes");
    expect(fileNameFromTitle("Ål æble ø")).toBe("Ål æble ø");
  });

  it("returns null when nothing usable is left", () => {
    expect(fileNameFromTitle("")).toBeNull();
    expect(fileNameFromTitle('?*:"')).toBeNull();
    expect(fileNameFromTitle(".hidden")).toBeNull();
  });

  it("limits the length and avoids reserved names", () => {
    expect(fileNameFromTitle("x".repeat(200))).toHaveLength(80);
    expect(fileNameFromTitle("CON")).toBe("CON_");
    expect(fileNameFromTitle("console")).toBe("console");
  });
});

describe("uniqueNotePath", () => {
  const files = ["Work/Plan.md", "Work/plan 2.md", "Home.md"];

  it("uses the plain name when it is free", () => {
    expect(uniqueNotePath("Work", "Weekly", files, "Work/Untitled.md")).toBe("Work/Weekly.md");
    expect(uniqueNotePath("", "Weekly", files, "Untitled.md")).toBe("Weekly.md");
  });

  it("numbers a name that is taken, without regard to case", () => {
    expect(uniqueNotePath("Work", "plan", files, "Work/Untitled.md")).toBe("Work/plan 3.md");
  });

  it("the note being renamed does not clash with itself", () => {
    expect(uniqueNotePath("", "Home", files, "Home.md")).toBe("Home.md");
  });
});

describe("planTitleRename", () => {
  const files = ["Untitled.md", "Weekly sync.md"];

  it("plans the new path from the heading", () => {
    expect(planTitleRename("Untitled.md", "# Roadmap\n", files)).toBe("Roadmap.md");
  });

  it("plans a numbered name when the title is taken", () => {
    expect(planTitleRename("Untitled.md", "# Weekly sync\n", files)).toBe("Weekly sync 2.md");
  });

  it("does nothing without a heading or when the name already fits", () => {
    expect(planTitleRename("Untitled.md", "# ", files)).toBeNull();
    expect(planTitleRename("Weekly sync.md", "# Weekly sync", files)).toBeNull();
  });
});

describe("isUntitledName", () => {
  it("recognises the names the app gives new notes", () => {
    expect(isUntitledName("Work/Untitled.md")).toBe(true);
    expect(isUntitledName("Untitled 3.md")).toBe(true);
    expect(isUntitledName("Untitled notes.md")).toBe(false);
  });
});
