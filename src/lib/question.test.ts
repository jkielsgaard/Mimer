import { describe, expect, it } from "vitest";
import { looksLikeQuestion, questionWords } from "./question";

describe("questions in search", () => {
  it("knows a question from a search", () => {
    expect(looksLikeQuestion("what is the service desk number?")).toBe(true);
    expect(looksLikeQuestion("hvordan forbinder jeg til vpn")).toBe(true);
    expect(looksLikeQuestion("vpn guide")).toBe(false);
    expect(looksLikeQuestion("what tag:drift is")).toBe(false);
  });

  it("keeps the words worth searching for", () => {
    expect(questionWords("What is the service desk number?")).toEqual([
      "service",
      "number",
      "desk",
    ]);
  });
});
