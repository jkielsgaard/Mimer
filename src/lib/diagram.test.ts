import { describe, expect, it } from "vitest";
import { looksLikeDiagram, withDiagram } from "./diagram";

describe("looksLikeDiagram", () => {
  it("accepts a flowchart with an arrow and nothing else", () => {
    expect(looksLikeDiagram("flowchart LR\n  A[User] --> B[Portal]")).toBe(true);
    expect(looksLikeDiagram("graph TD\nA-->B")).toBe(true);
  });

  it("refuses a sentence, an empty answer and a diagram with no link", () => {
    expect(looksLikeDiagram("Here is your diagram of the flow.")).toBe(false);
    expect(looksLikeDiagram("")).toBe(false);
    expect(looksLikeDiagram("flowchart LR\n  A[Alone]")).toBe(false);
  });
});

describe("withDiagram", () => {
  it("keeps the text and puts the diagram under it as a Mermaid block", () => {
    expect(withDiagram("The user signs in.\n", "flowchart LR\nA-->B")).toBe(
      "The user signs in.\n\n```mermaid\nflowchart LR\nA-->B\n```\n",
    );
  });
});
