import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { minorOf, sectionFor, shouldShow } from "./whatsNew";

const SAMPLE = `# Changelog

## [Unreleased]

## [0.22.0] - 2026-11-20

### Added

- **Your own tags.** Tag a note with any word and find it in [Search](https://x.y).
- A line with no bold lead, with \`code\` in it.

### Changed

- **Meetings: one text.** The notes are one \`text\`.
  A second line of the same bullet is not a bullet.
- **Four** a
- **Five** b
- **Six** c
- **Seven** d

### Fixed

- **A fix.** Not shown.

## [0.21.0] - 2026-10-31

### Added

- **Older.** Not this version.
`;

describe("sectionFor", () => {
  it("reads the bullets under Added, then Changed, with their bold lead, and no Fixed", () => {
    const items = sectionFor(SAMPLE, "0.22.0");
    expect(items.map((i) => i.lead)).toEqual([
      "Your own tags",
      "",
      "Meetings: one text",
      "Four",
      "Five",
      "Six",
    ]);
    expect(items[0]?.text).toBe("Tag a note with any word and find it in Search.");
    expect(items[1]?.text).toBe("A line with no bold lead, with code in it.");
    expect(items[2]?.text).toBe("The notes are one text.");
  });

  it("shows at most six lines and takes the version without its build part", () => {
    expect(sectionFor(SAMPLE, "0.22.0+abc.dirty")).toHaveLength(6);
  });

  it("gives an empty list for a version with no section", () => {
    expect(sectionFor(SAMPLE, "0.99.0")).toEqual([]);
    expect(sectionFor(SAMPLE, "0.21.5")).toEqual([]);
  });

  it("finds something to show for the version that is built, in the real changelog", () => {
    const root = path.resolve(import.meta.dirname, "../..");
    const pkg = JSON.parse(readFileSync(path.join(root, "package.json"), "utf8")) as {
      version: string;
    };
    const changelog = readFileSync(path.join(root, "CHANGELOG.md"), "utf8");
    expect(sectionFor(changelog, pkg.version).length).toBeGreaterThan(0);
  });
});

describe("minorOf and shouldShow", () => {
  it("is the major and minor number", () => {
    expect(minorOf("0.21.3")).toBe("0.21");
    expect(minorOf("0.21.0+abc.dirty")).toBe("0.21");
    expect(minorOf("1.0.0-preview.2")).toBe("1.0");
  });

  it("comes for a new version, not twice, and never on a first run", () => {
    expect(shouldShow(null, "0.22.0", false)).toBe(true);
    expect(shouldShow("0.21", "0.22.0", false)).toBe(true);
    expect(shouldShow("0.22", "0.22.1", false)).toBe(false);
    expect(shouldShow(null, "0.22.0", true)).toBe(false);
    expect(shouldShow("0.21", "0.22.0", true)).toBe(false);
  });
});
