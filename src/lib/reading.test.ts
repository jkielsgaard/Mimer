import { afterEach, describe, expect, it } from "vitest";
import { applyReading } from "./reading";

const root = document.documentElement;

describe("applyReading", () => {
  afterEach(() => {
    root.removeAttribute("style");
    root.removeAttribute("data-follow-line");
  });

  it("writes the spacing and the font as CSS variables and marks following the line", () => {
    applyReading({
      lineSpacing: "extra",
      letterSpacing: "wide",
      textFont: "serif",
      followLine: true,
    });
    expect(root.style.getPropertyValue("--read-line-height")).toBe("2.2");
    expect(root.style.getPropertyValue("--read-letter-spacing")).toBe("0.04em");
    expect(root.style.getPropertyValue("--read-font")).toContain("serif");
    expect(root.hasAttribute("data-follow-line")).toBe(true);
  });

  it("falls back to the first choice for a word it does not know, and turns following off", () => {
    applyReading({ lineSpacing: "huge", letterSpacing: "x", textFont: "y", followLine: false });
    expect(root.style.getPropertyValue("--read-line-height")).toBe("1.65");
    expect(root.style.getPropertyValue("--read-letter-spacing")).toBe("normal");
    expect(root.style.getPropertyValue("--read-font")).toContain("system-ui");
    expect(root.hasAttribute("data-follow-line")).toBe(false);
  });
});
