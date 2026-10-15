import { describe, expect, it } from "vitest";
import { linkForDroppedPath } from "./dropLink";

const files = ["Home.md", "Work/Plan.md", "attachments/shot one.png", "Docs/spec.pdf"];
const short = (p: string): string => (p.split("/").pop() ?? p).replace(/\.md$/i, "");

describe("linkForDroppedPath", () => {
  it("a dropped note becomes a wiki-link", () => {
    expect(linkForDroppedPath("Work/Plan.md", "Home.md", files, "markdown", short)).toBe(
      "[[Plan]]",
    );
  });

  it("a dropped picture becomes an image in the vault's style", () => {
    expect(
      linkForDroppedPath("attachments/shot one.png", "Work/Plan.md", files, "markdown", short),
    ).toBe("![shot one](../attachments/shot%20one.png)");
    expect(
      linkForDroppedPath("attachments/shot one.png", "Work/Plan.md", files, "wiki", short),
    ).toBe("![[shot one.png]]");
  });

  it("another file becomes a plain link relative to the note", () => {
    expect(linkForDroppedPath("Docs/spec.pdf", "Work/Plan.md", files, "markdown", short)).toBe(
      "[spec.pdf](../Docs/spec.pdf)",
    );
  });

  it("folders, unknown paths and the note itself give nothing", () => {
    expect(linkForDroppedPath("Work", "Home.md", files, "markdown", short)).toBeNull();
    expect(linkForDroppedPath("Nope.md", "Home.md", files, "markdown", short)).toBeNull();
    expect(linkForDroppedPath("Home.md", "Home.md", files, "markdown", short)).toBeNull();
  });
});
