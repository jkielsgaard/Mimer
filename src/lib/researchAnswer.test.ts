import { describe, expect, it } from "vitest";
import { parseResearchAnswer, safeFileName } from "./researchAnswer";

const body = `# Zero trust\n\n## Summary\n${"Text. ".repeat(40)}\n\n## Sources\n- [NIST](https://nist.gov/x) - SP 800-207 - accessed 2026-10-14\n`;
const good = `---\ntitle: Zero trust\nsource: cloud-ai-research\ntopic: Zero trust\ncreated: 2026-10-14\nstatus: needs review\n---\n${body}`;

describe("parseResearchAnswer", () => {
  it("reads a well-formed answer without warnings", () => {
    const r = parseResearchAnswer(good, "2026-10-15");
    expect(r.title).toBe("Zero trust");
    expect(r.warnings).toEqual([]);
    expect(r.content).toContain("created: 2026-10-14");
    expect(r.content.startsWith("---\n")).toBe(true);
  });

  it("removes a code fence and a sentence before the document", () => {
    const r = parseResearchAnswer(`Here you go:\n\`\`\`markdown\n${good}\n\`\`\``, "2026-10-15");
    expect(r.content.startsWith("---\ntitle: Zero trust")).toBe(true);
    expect(r.content).not.toContain("```");
    const chatter = parseResearchAnswer(`Sure! Here it is.\n\n${good}`, "2026-10-15");
    expect(chatter.content.startsWith("---\n")).toBe(true);
  });

  it("adds front matter when it is missing and takes the title from the heading", () => {
    const r = parseResearchAnswer(body, "2026-10-15");
    expect(r.title).toBe("Zero trust");
    expect(r.content).toContain("status: needs review");
    expect(r.content).toContain("created: 2026-10-15");
    expect(r.warnings.join(" ")).toContain("no front matter");
  });

  it("always marks the note as needing review, whatever the AI wrote", () => {
    const r = parseResearchAnswer(good.replace("needs review", "verified"), "2026-10-15");
    expect(r.content).toContain("status: needs review");
    expect(r.content).not.toContain("verified");
  });

  it("warns about missing sources, a very short answer and a missing title", () => {
    const r = parseResearchAnswer("Just some text.", "2026-10-15");
    expect(r.title).toBe("");
    expect(r.warnings.join(" ")).toContain("no title");
    expect(r.warnings.join(" ")).toContain("no sources");
    expect(r.warnings.join(" ")).toContain("very short");
  });
});

describe("safeFileName", () => {
  it("removes characters that are not allowed in file names", () => {
    expect(safeFileName('Zero/trust: "what" is it?')).toBe("Zero trust what is it");
    expect(safeFileName("   ")).toBe("Research");
  });
});
