import { describe, expect, it } from "vitest";
import { makeSettings } from "./settings";

describe("makeSettings", () => {
  it("is a complete settings object with plain defaults", () => {
    const s = makeSettings();
    expect(s.schemaVersion).toBe(1);
    expect(s.theme).toBe("system");
    expect(s.git.idleCommitMinutes).toBe(5);
    expect(s.ai.providers).toEqual([]);
  });

  it("merges objects and replaces lists", () => {
    const s = makeSettings({
      recentVaults: ["/a"],
      editor: { recentNotes: 9 },
      ai: { cloudConsent: "x", embeddings: { enabled: true } },
    });
    expect(s.recentVaults).toEqual(["/a"]);
    expect(s.editor.recentNotes).toBe(9);
    expect(s.editor.fontSize).toBe(15);
    expect(s.ai.cloudConsent).toBe("x");
    expect(s.ai.embeddings).toEqual({ enabled: true, providerId: "lm", model: "" });
    expect(s.ai.checkAnswers).toBe(false);
  });

  it("gives each call its own object", () => {
    const a = makeSettings();
    a.editor.ownWords.push("x");
    expect(makeSettings().editor.ownWords).toEqual([]);
  });
});
