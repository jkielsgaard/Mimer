import { describe, expect, it } from "vitest";
import { basename, dirname, isInside, joinPath, relativeTime, resolveRelativePath } from "./utils";

describe("path helpers", () => {
  it("splits and joins", () => {
    expect(dirname("a/b/c.md")).toBe("a/b");
    expect(dirname("c.md")).toBe("");
    expect(basename("a/b/c.md")).toBe("c.md");
    expect(joinPath("", "a", "b")).toBe("a/b");
  });
  it("detects containment", () => {
    expect(isInside("Work/a.md", "Work")).toBe(true);
    expect(isInside("Workshop/a.md", "Work")).toBe(false);
    expect(isInside("anything", "")).toBe(true);
  });
});

describe("resolveRelativePath", () => {
  it("resolves ../ and decodes %20", () => {
    expect(resolveRelativePath("Work/n.md", "../attachments/my%20pic.png")).toBe(
      "attachments/my pic.png",
    );
    expect(resolveRelativePath("n.md", "attachments/a.png")).toBe("attachments/a.png");
  });
  it("rejects external URLs and paths that escape the vault", () => {
    expect(resolveRelativePath("n.md", "https://x.test/a.png")).toBeNull();
    expect(resolveRelativePath("n.md", "../../etc/passwd")).toBeNull();
    expect(resolveRelativePath("n.md", "#heading")).toBeNull();
  });
});

describe("relativeTime", () => {
  const now = 1_000_000_000_000;
  it("formats units", () => {
    expect(relativeTime(now / 1000 - 10, now)).toBe("just now");
    expect(relativeTime(now / 1000 - 300, now)).toBe("5 minutes ago");
    expect(relativeTime(now / 1000 - 7200, now)).toBe("2 hours ago");
    expect(relativeTime(now / 1000 - 86400, now)).toBe("1 day ago");
  });
});
