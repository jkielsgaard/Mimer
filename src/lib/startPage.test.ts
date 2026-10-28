import { describe, expect, it } from "vitest";
import type { TreeNode } from "@/bindings/TreeNode";
import { matchesFilter, modifiedByPath, noteExcerpt, noteKind, whenChanged } from "./startPage";

describe("noteKind", () => {
  const meetings = new Set(["Møder/Weekly.md"]);
  const epics = new Set(["Tasks/VPN.md"]);
  it("lets the tag decide meeting and epic, and the name decide daily", () => {
    expect(noteKind("Møder/Weekly.md", meetings, epics)).toBe("meeting");
    expect(noteKind("Tasks/VPN.md", meetings, epics)).toBe("epic");
    expect(noteKind("Daily/2026-10-28.md", meetings, epics)).toBe("daily");
    expect(noteKind("Work/Hiring plan.md", meetings, epics)).toBe("note");
    // A note in the meetings folder without the tag is only a note.
    expect(noteKind("Møder/Loose.md", meetings, epics)).toBe("note");
  });
});

describe("matchesFilter", () => {
  it("counts a daily note as a note", () => {
    expect(matchesFilter("daily", "note")).toBe(true);
    expect(matchesFilter("meeting", "note")).toBe(false);
    expect(matchesFilter("epic", "epic")).toBe(true);
    expect(matchesFilter("epic", "all")).toBe(true);
  });
});

describe("modifiedByPath", () => {
  it("finds files in folders", () => {
    const tree: TreeNode[] = [
      {
        name: "A",
        path: "A",
        isDir: true,
        modified: 0,
        children: [{ name: "x.md", path: "A/x.md", isDir: false, children: [], modified: 5 }],
      },
    ];
    expect(modifiedByPath(tree).get("A/x.md")).toBe(5);
  });
});

describe("whenChanged", () => {
  const now = new Date(2026, 9, 28, 12, 0);
  it("says the time today, yesterday, the weekday or the date", () => {
    expect(whenChanged(new Date(2026, 9, 28, 9, 5).getTime(), now)).toBe("09:05 today");
    expect(whenChanged(new Date(2026, 9, 27, 16, 42).getTime(), now)).toBe("yesterday");
    expect(whenChanged(new Date(2026, 9, 24, 10, 0).getTime(), now)).toBe("Sat");
    expect(whenChanged(new Date(2026, 9, 1, 10, 0).getTime(), now)).toBe("1 Oct");
    expect(whenChanged(0, now)).toBe("");
  });
});

describe("noteExcerpt", () => {
  it("skips the properties and headings and reads the first lines", () => {
    const text =
      "---\ntags: [epic]\n---\n# Hiring plan\n\nWe need **two** engineers, see [[Roles]].\n";
    expect(noteExcerpt(text)).toBe("We need two engineers, see Roles.");
  });
  it("cuts a long text", () => {
    expect(noteExcerpt("a".repeat(300), 50)).toHaveLength(50);
  });
  it("is empty for an empty note", () => {
    expect(noteExcerpt("# Only a title")).toBe("");
  });
});
