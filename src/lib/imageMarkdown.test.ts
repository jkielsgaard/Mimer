import { describe, expect, it } from "vitest";
import {
  imageMarkdown,
  parseSizedAlt,
  relativeLink,
  widthFromAlias,
  withImageWidth,
} from "./imageMarkdown";

describe("relativeLink", () => {
  it("goes up one level for every folder the note is in, and encodes spaces", () => {
    expect(relativeLink("Home.md", "attachments/a.png")).toBe("attachments/a.png");
    expect(relativeLink("Work/Plan.md", "attachments/my shot.png")).toBe(
      "../attachments/my%20shot.png",
    );
    expect(relativeLink("A/B/C.md", "attachments/x.png")).toBe("../../attachments/x.png");
  });
});

describe("imageMarkdown", () => {
  const short = (p: string): string => p.split("/").pop() ?? p;

  it("writes a standard Markdown image with a path relative to the note", () => {
    expect(imageMarkdown("markdown", "Work/Plan.md", "attachments/a.png", short)).toBe(
      "![](../attachments/a.png)",
    );
    expect(imageMarkdown("markdown", "Work/Plan.md", "attachments/a.png", short, "Chart")).toBe(
      "![Chart](../attachments/a.png)",
    );
  });

  it("writes a short embed by name", () => {
    expect(imageMarkdown("wiki", "Work/Plan.md", "attachments/a.png", short)).toBe("![[a.png]]");
  });
});

describe("sizes in alt text and aliases", () => {
  it("reads a width after a pipe", () => {
    expect(parseSizedAlt("Chart|400")).toEqual({ text: "Chart", width: 400 });
    expect(parseSizedAlt("|300")).toEqual({ text: "", width: 300 });
    expect(parseSizedAlt("Plain")).toEqual({ text: "Plain", width: null });
    expect(parseSizedAlt("a|b")).toEqual({ text: "a|b", width: null });
  });

  it("reads a width from a wiki embed alias", () => {
    expect(widthFromAlias("|400")).toBe(400);
    expect(widthFromAlias("|caption")).toBeNull();
    expect(widthFromAlias(null)).toBeNull();
  });
});

describe("withImageWidth", () => {
  it("sets, changes and removes the width of a Markdown image, keeping the rest of the line", () => {
    expect(withImageWidth("![Chart](a.png) and more", 400)).toEqual({
      text: "![Chart|400](a.png)",
      replaces: "![Chart](a.png)".length,
    });
    expect(withImageWidth("![Chart|400](a.png)", 800)?.text).toBe("![Chart|800](a.png)");
    expect(withImageWidth("![Chart|400](a.png)", null)?.text).toBe("![Chart](a.png)");
    expect(withImageWidth("![](a.png)", 200)?.text).toBe("![|200](a.png)");
  });

  it("works for short embeds", () => {
    expect(withImageWidth("![[a.png]] tail", 400)).toEqual({
      text: "![[a.png|400]]",
      replaces: "![[a.png]]".length,
    });
    expect(withImageWidth("![[a.png|400]]", null)?.text).toBe("![[a.png]]");
  });

  it("returns null when the text does not start with a picture", () => {
    expect(withImageWidth("plain text", 400)).toBeNull();
    expect(withImageWidth("[link](a.png)", 400)).toBeNull();
  });
});
