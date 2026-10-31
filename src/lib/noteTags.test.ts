import { describe, expect, it } from "vitest";
import { cleanTagName, isSystemTag, NOTE_TAGS, SYSTEM_TAGS, textTags, userTags } from "./noteTags";

describe("Mimer's tags and the person's own", () => {
  it("knows Mimer's own tags by name, whatever the case", () => {
    expect(SYSTEM_TAGS).toEqual(NOTE_TAGS.map((t) => t.tag));
    expect(isSystemTag("meeting")).toBe(true);
    expect(isSystemTag("Epic")).toBe(true);
    expect(isSystemTag("vpn")).toBe(false);
    expect(userTags(["meeting", "vpn", "pinned", "it"])).toEqual(["vpn", "it"]);
  });

  it("writes a tag as one lower-case word, and refuses anything else", () => {
    expect(cleanTagName(" #VPN ")).toBe("vpn");
    expect(cleanTagName("kunde-a_2")).toBe("kunde-a_2");
    expect(cleanTagName("æble")).toBe("æble");
    expect(cleanTagName("two words")).toBeNull();
    expect(cleanTagName("a,b")).toBeNull();
    expect(cleanTagName("")).toBeNull();
    expect(cleanTagName("#")).toBeNull();
    expect(cleanTagName("2026")).toBeNull();
  });

  it("finds the #tags in the text, not in the properties or in code", () => {
    const note =
      "---\ntags: [epic, hidden]\n---\n# Plan\n\nSee #idea and (#Q4).\n\n```\n#code\n```\n\nInline `#also` and a heading #1 stays out. #idea again.\n";
    expect(textTags(note)).toEqual(["idea", "q4"]);
    expect(textTags("no tags here")).toEqual([]);
  });
});
