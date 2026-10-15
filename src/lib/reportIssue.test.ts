import { describe, expect, it } from "vitest";
import { REPORT_URL } from "./reportAi";
import { issueUrl } from "./reportIssue";

describe("issueUrl", () => {
  it("opens the bug template with the version and system filled in", () => {
    const url = new URL(issueUrl("bug"));
    expect(`${url.origin}${url.pathname}`).toBe(REPORT_URL);
    expect(url.searchParams.get("template")).toBe("bug_report.yml");
    expect(url.searchParams.get("version")).not.toBe("");
    expect(url.searchParams.has("system")).toBe(true);
  });

  it("opens the feature template", () => {
    const url = new URL(issueUrl("feature"));
    expect(url.searchParams.get("template")).toBe("feature_request.yml");
    expect(url.searchParams.has("system")).toBe(false);
  });
});
