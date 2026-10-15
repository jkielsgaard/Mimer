import { describe, expect, it } from "vitest";
import { REPORT_URL, reportAiUrl } from "./reportAi";

describe("reportAiUrl", () => {
  it("makes a filled-in new issue for the repository, saying where the answer came from", () => {
    const url = new URL(reportAiUrl("Raven"));
    expect(`${url.origin}${url.pathname}`).toBe(REPORT_URL);
    expect(url.searchParams.get("title")).toBe("Inappropriate AI content (Raven)");
    const body = url.searchParams.get("body") ?? "";
    expect(body).toContain("Where: Raven");
    expect(body).toContain("Mimer version:");
    expect(body).toContain("Do not paste private notes");
    expect(url.searchParams.get("labels")).toBe("ai-content");
  });

  it("never includes any note or chat text", () => {
    expect(reportAiUrl("Mimer")).not.toContain("secret");
  });
});
