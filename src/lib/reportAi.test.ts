import { describe, expect, it } from "vitest";
import { REPORT_URL, reportAiUrl } from "./reportAi";

describe("reportAiUrl", () => {
  it("makes a filled-in new issue for the repository, saying where the answer came from", () => {
    const url = new URL(reportAiUrl("inline command"));
    expect(`${url.origin}${url.pathname}`).toBe(REPORT_URL);
    expect(url.searchParams.get("title")).toBe("Inappropriate AI content (inline command)");
    const body = url.searchParams.get("body") ?? "";
    expect(body).toContain("Where: inline command");
    expect(body).toContain("Mimer version:");
    expect(body).toContain("Do not paste private notes");
    expect(url.searchParams.get("labels")).toBe("ai-content");
  });

  it("never includes any note or chat text", () => {
    expect(reportAiUrl("Mimer")).not.toContain("secret");
  });
});
