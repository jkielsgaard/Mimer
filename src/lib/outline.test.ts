import { describe, expect, it } from "vitest";
import { outlineOf, searchWords, wikiTargets } from "./outline";

describe("outline and links of a note", () => {
  it("lists the headings outside the front matter and code", () => {
    const note =
      "---\ntitle: x\n---\n# Guide\n\ntext\n## Connect\n```\n# not a heading\n```\n### Mac ##\n";
    expect(outlineOf(note)).toEqual([
      { line: 3, level: 1, text: "Guide" },
      { line: 6, level: 2, text: "Connect" },
      { line: 10, level: 3, text: "Mac" },
    ]);
  });

  it("finds each wiki-link target once", () => {
    expect(wikiTargets("See [[A]], [[B#h|alias]] and ![[A]].\n```\n[[C]]\n```")).toEqual([
      "A",
      "B",
    ]);
  });

  it("picks the words of a title worth searching for", () => {
    expect(searchWords("Notes about the VPN client guide")).toEqual(["client", "guide"]);
  });
});
