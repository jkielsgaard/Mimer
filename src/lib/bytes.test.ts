import { describe, expect, it } from "vitest";
import { formatBytes, percent } from "./bytes";

describe("formatBytes", () => {
  it("uses the largest fitting unit with one decimal for small numbers", () => {
    expect(formatBytes(0)).toBe("0 B");
    expect(formatBytes(999)).toBe("999 B");
    expect(formatBytes(12_000)).toBe("12.0 KB");
    expect(formatBytes(3_349_516_256)).toBe("3.3 GB");
    expect(formatBytes(14_439_363_584)).toBe("14.4 GB");
    expect(formatBytes(420_000_000)).toBe("420 MB");
  });

  it("gives nothing for a size that is not a number", () => {
    expect(formatBytes(Number.NaN)).toBe("");
    expect(formatBytes(-1)).toBe("");
  });
});

describe("percent", () => {
  it("is a whole number between 0 and 100", () => {
    expect(percent(50, 200)).toBe(25);
    expect(percent(5, 0)).toBe(0);
    expect(percent(300, 200)).toBe(100);
    expect(percent(-5, 200)).toBe(0);
  });
});
