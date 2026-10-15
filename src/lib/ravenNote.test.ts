import { describe, expect, it } from "vitest";
import { ravenNoteContent, suggestTitle } from "./ravenNote";

describe("suggestTitle", () => {
  it("uses the first heading, else the first line, without Markdown marks", () => {
    expect(suggestTitle("Intro text\n\n## Yggdrasil, the world tree\nMore")).toBe(
      "Yggdrasil, the world tree",
    );
    expect(suggestTitle("\n\n**Ravens** fly out each day.\nSecond")).toBe(
      "Ravens fly out each day.",
    );
    expect(suggestTitle("")).toBe("");
  });

  it("keeps a long title short", () => {
    const t = suggestTitle("x".repeat(200));
    expect(t.length).toBeLessThanOrEqual(58);
    expect(t.endsWith("…")).toBe(true);
  });
});

describe("ravenNoteContent", () => {
  it("says where the note came from and that it has not been checked", () => {
    const c = ravenNoteContent("Ravens", "Hugin and Munin.\n", "2026-10-15");
    expect(c).toBe(
      "---\ntitle: Ravens\nsource: raven\ncreated: 2026-10-15\nstatus: needs review\n---\nHugin and Munin.\n",
    );
  });

  it("keeps a title on one line so the front matter stays valid", () => {
    const c = ravenNoteContent("Two\nlines", "Text", "2026-10-15");
    expect(c).toContain("title: Two lines\n");
  });
});
