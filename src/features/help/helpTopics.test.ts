import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { findTopic, HELP_TOPICS, searchTopics } from "./helpTopics";

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) return sourceFiles(full);
    return /\.tsx$/.test(name) && !/\.test\./.test(name) ? [full] : [];
  });
}

describe("the how-to guide", () => {
  it("has unique ids and real text in every topic", () => {
    const ids = HELP_TOPICS.map((t) => t.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const t of HELP_TOPICS) {
      expect(t.title.length, t.id).toBeGreaterThan(2);
      expect(t.summary.length, t.id).toBeGreaterThan(5);
      expect(t.body.length, t.id).toBeGreaterThan(200);
    }
  });

  it("covers the features of the app", () => {
    const ids = HELP_TOPICS.map((t) => t.id);
    for (const id of [
      "start",
      "writing",
      "title",
      "links",
      "images",
      "mimer",
      "projects",
      "templates",
      "vaults",
      "history",
      "search",
      "import",
      "export",
      "shortcuts",
    ]) {
      expect(ids).toContain(id);
    }
  });

  it("every 'Read more' link in the app points at a topic that exists", () => {
    const ids = new Set(HELP_TOPICS.map((t) => t.id));
    const used = new Set<string>();
    for (const file of sourceFiles(path.resolve(import.meta.dirname, "../.."))) {
      for (const m of readFileSync(file, "utf8").matchAll(/topic="([a-z]+)"/g)) {
        if (m[1] !== undefined) used.add(m[1]);
      }
    }
    expect(used.size).toBeGreaterThan(5);
    for (const id of used) expect(ids.has(id), `topic "${id}" is used but missing`).toBe(true);
  });

  it("lists the shortcuts that the app really has", () => {
    const shortcuts = findTopic("shortcuts").body;
    for (const key of [
      "Ctrl+N",
      "Ctrl+Shift+K",
      "Ctrl+Shift+O",
      "Ctrl+Shift+D",
      "F1",
      "Ctrl+Alt+T",
    ]) {
      expect(shortcuts).toContain(key);
    }
  });

  it("finds a topic from a word in its text, and needs every word to match", () => {
    expect(searchTopics("paperclip").map((t) => t.id)).toContain("mimer");
    expect(searchTopics("index page").map((t) => t.id)).toContain("links");
    expect(searchTopics("paperclip zzzzz")).toEqual([]);
    expect(searchTopics("")).toHaveLength(HELP_TOPICS.length);
  });

  it("an unknown topic falls back to the first one", () => {
    expect(findTopic("nope").id).toBe(HELP_TOPICS[0]?.id);
  });
});
