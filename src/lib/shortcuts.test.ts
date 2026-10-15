import { describe, expect, it } from "vitest";
import { matchShortcut } from "./shortcuts";

function key(init: KeyboardEventInit): KeyboardEvent {
  return new KeyboardEvent("keydown", init);
}

describe("matchShortcut", () => {
  it("matches Mod as Ctrl outside macOS", () => {
    expect(matchShortcut(key({ key: "s", ctrlKey: true }), "Mod+s")).toBe(true);
    expect(matchShortcut(key({ key: "s" }), "Mod+s")).toBe(false);
  });
  it("respects Shift", () => {
    expect(matchShortcut(key({ key: "F", ctrlKey: true, shiftKey: true }), "Mod+Shift+f")).toBe(
      true,
    );
    expect(matchShortcut(key({ key: "f", ctrlKey: true }), "Mod+Shift+f")).toBe(false);
  });
  it("matches punctuation", () => {
    expect(matchShortcut(key({ key: ",", ctrlKey: true }), "Mod+,")).toBe(true);
  });
  it("matches a function key without modifiers, and only without them", () => {
    expect(matchShortcut(key({ key: "F1" }), "F1")).toBe(true);
    expect(matchShortcut(key({ key: "F1", ctrlKey: true }), "F1")).toBe(false);
    expect(matchShortcut(key({ key: "F2" }), "F1")).toBe(false);
  });
});
