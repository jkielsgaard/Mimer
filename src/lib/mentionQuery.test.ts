import { describe, expect, it } from "vitest";
import {
  findMentionQuery,
  isFolderMention,
  mentionCandidates,
  removeMentionQuery,
} from "./mentionQuery";

describe("findMentionQuery", () => {
  it("opens for a slash at the start or after a space", () => {
    expect(findMentionQuery("/pla", 4)).toEqual({ start: 0, query: "pla" });
    expect(findMentionQuery("merge /pla", 10)).toEqual({ start: 6, query: "pla" });
    expect(findMentionQuery("see /", 5)).toEqual({ start: 4, query: "" });
  });

  it("does not open inside a word, a URL or a date", () => {
    expect(findMentionQuery("1/2", 3)).toBeNull();
    expect(findMentionQuery("https://x.dk", 12)).toBeNull();
    expect(findMentionQuery("a/b", 3)).toBeNull();
  });

  it("closes once a space is typed after the query, and follows the caret", () => {
    expect(findMentionQuery("/pla and more", 13)).toBeNull();
    expect(findMentionQuery("/pla and more", 4)).toEqual({ start: 0, query: "pla" });
  });

  it("allows slashes in the query so paths can be typed", () => {
    expect(findMentionQuery("/Work/Pl", 8)).toEqual({ start: 0, query: "Work/Pl" });
  });
});

describe("removeMentionQuery", () => {
  it("cuts the typed query and puts the caret where it was", () => {
    const q = findMentionQuery("merge /pla now", 10);
    expect(q).not.toBeNull();
    if (q)
      expect(removeMentionQuery("merge /pla now", q, 10)).toEqual({ text: "merge  now", caret: 6 });
  });
});

describe("mentionCandidates", () => {
  const files = [
    "Home.md",
    "Work/Plan.md",
    "Work/Sec/Keys.md",
    "Work/Sec/Policy.md",
    "Work/photo.png",
    "Other/Plan b.md",
  ];

  it("offers only Markdown notes and matches by fuzzy name", () => {
    expect(mentionCandidates(files, "pla", null, [])).toEqual(["Work/Plan.md", "Other/Plan b.md"]);
    expect(mentionCandidates(files, "", null, [])).not.toContain("Work/photo.png");
  });

  it("stays inside the project folder", () => {
    const got = mentionCandidates(files, "", "Work/Sec", []);
    expect(got.sort()).toEqual(["Work/Sec/Keys.md", "Work/Sec/Policy.md"]);
  });

  it("leaves out notes that are already attached and respects the limit", () => {
    expect(mentionCandidates(files, "plan", null, ["Work/Plan.md"])).toEqual(["Other/Plan b.md"]);
    expect(mentionCandidates(files, "", null, [], 2)).toHaveLength(2);
  });
});

describe("mentionCandidates with folders", () => {
  const files = ["Home.md", "Work/Plan.md", "Work/Sec/Keys.md", "Other/Plan b.md"];
  const folders = new Map([
    ["Work", 2],
    ["Work/Sec", 1],
    ["Other", 1],
  ]);

  it("offers folders that hold notes together with the notes", () => {
    const got = mentionCandidates(files, "sec", null, [], 8, folders);
    expect(got).toContain("Work/Sec");
    expect(isFolderMention("Work/Sec")).toBe(true);
    expect(isFolderMention("Work/Plan.md")).toBe(false);
  });

  it("respects the project scope, including the project folder itself", () => {
    const got = mentionCandidates(files, "", "Work", [], 8, folders);
    expect(got).toContain("Work");
    expect(got).toContain("Work/Sec");
    expect(got).not.toContain("Other");
  });

  it("leaves out a folder that is already attached", () => {
    expect(mentionCandidates(files, "", null, ["Work"], 8, folders)).not.toContain("Work");
  });
});
