import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { appVersion, buildDateLabel, channelOf, formatVersion } from "./version";

const root = path.resolve(import.meta.dirname, "../..");
const read = (file: string): string => readFileSync(path.join(root, file), "utf8");

describe("formatVersion", () => {
  it("adds build metadata after a plus sign", () => {
    expect(formatVersion("0.2.0", "63947f4")).toBe("0.2.0+63947f4");
    expect(formatVersion("0.2.0", "63947f4.dirty")).toBe("0.2.0+63947f4.dirty");
  });

  it("shows the plain version when the build is unknown", () => {
    expect(formatVersion("0.2.0", "")).toBe("0.2.0");
  });
});

describe("channelOf", () => {
  it("calls 0.x and pre-release versions Preview, and a plain 1.0.0 or later Stable", () => {
    expect(channelOf("0.19.0")).toBe("preview");
    expect(channelOf("1.1.0-preview.2")).toBe("preview");
    expect(channelOf("1.0.0-rc1")).toBe("preview");
    expect(channelOf("1.0.0")).toBe("stable");
    expect(channelOf("1.2.3")).toBe("stable");
    expect(channelOf("10.0.0")).toBe("stable");
  });
});

describe("app version", () => {
  const pkg = JSON.parse(read("package.json")) as { version: string };

  it("is a valid Semantic Version taken from package.json", () => {
    expect(pkg.version).toMatch(/^\d+\.\d+\.\d+(-[0-9A-Za-z.-]+)?$/);
    expect(appVersion.startsWith(pkg.version)).toBe(true);
    expect(appVersion).toMatch(/^\d+\.\d+\.\d+(-[0-9A-Za-z.-]+)?(\+[0-9A-Za-z.-]+)?$/);
  });

  it("matches Cargo.toml, and tauri.conf.json reads it from package.json", () => {
    const cargo = /^version = "([^"]+)"/m.exec(read("src-tauri/Cargo.toml"))?.[1];
    expect(cargo).toBe(pkg.version);
    const tauri = JSON.parse(read("src-tauri/tauri.conf.json")) as { version: string };
    expect(tauri.version).toBe("../package.json");
  });

  it("has a changelog section for the current version", () => {
    expect(read("CHANGELOG.md")).toContain(`## [${pkg.version}]`);
  });
});

describe("buildDateLabel", () => {
  it("formats a timestamp and survives bad input", () => {
    expect(buildDateLabel("2026-10-13T08:05:00")).toBe("2026-10-13 08:05");
    expect(buildDateLabel("not a date")).toBe("unknown");
  });
});
