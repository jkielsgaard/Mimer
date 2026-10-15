import { describe, expect, it } from "vitest";
import { stripCodeFence } from "./fence";

describe("stripCodeFence", () => {
  it("strips a single surrounding fence", () => {
    expect(stripCodeFence("```\nhello\nworld\n```")).toBe("hello\nworld");
  });
  it("strips a fence with a language tag", () => {
    expect(stripCodeFence("```markdown\n# Title\n```")).toBe("# Title");
  });
  it("tolerates surrounding whitespace", () => {
    expect(stripCodeFence("\n```\nx\n```\n")).toBe("x");
  });
  it("leaves unfenced text alone", () => {
    expect(stripCodeFence("plain text")).toBe("plain text");
  });
  it("does not strip when the fence is not around the whole answer", () => {
    const t = "Intro\n```\ncode\n```";
    expect(stripCodeFence(t)).toBe(t);
  });
  it("does not strip when the content itself contains fences", () => {
    const t = "```\na\n```\nmiddle\n```\nb\n```";
    expect(stripCodeFence(t)).toBe(t);
  });
});
