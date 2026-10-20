import { CompletionContext } from "@codemirror/autocomplete";
import { EditorState } from "@codemirror/state";
import { describe, expect, it } from "vitest";
import { filterTags, tagCompletion } from "./tags";

const TAGS = [
  { tag: "drift", count: 14 },
  { tag: "documentation", count: 6 },
  { tag: "decision", count: 3 },
  { tag: "vpn", count: 4 },
];

function ask(doc: string, explicit = false) {
  const state = EditorState.create({ doc });
  return tagCompletion(() => TAGS)(new CompletionContext(state, doc.length, explicit));
}

describe("tag suggestions", () => {
  it("lists the tags you use that start with what was typed, most used first", () => {
    expect(filterTags(TAGS, "d").map((t) => t.tag)).toEqual(["drift", "documentation", "decision"]);
    expect(filterTags(TAGS, "dr").map((t) => t.tag)).toEqual(["drift"]);
    expect(filterTags(TAGS, "drift")).toEqual([]);
  });

  it("appears after a # that begins a word, and starts at the #", () => {
    const r = ask("Connect from home, see #d");
    expect(r?.from).toBe("Connect from home, see ".length);
    expect(r?.options.map((o) => o.label)).toEqual(["#drift", "#documentation", "#decision"]);
    expect(r?.options[0]?.detail).toBe("14 notes");
  });

  it("stays away from headings, ordinary words and text with no match", () => {
    expect(ask("# Title")).toBeNull();
    expect(ask("see the number")).toBeNull();
    expect(ask("a #zzz")).toBeNull();
  });
});
