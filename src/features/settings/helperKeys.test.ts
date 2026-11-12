import { describe, expect, it } from "vitest";
import { combinationFromEvent } from "./helperKeys";

const none = { ctrlKey: false, altKey: false, shiftKey: false, metaKey: false };

describe("combinationFromEvent", () => {
  it("writes the modifiers in a fixed order, then the key", () => {
    expect(combinationFromEvent({ ...none, code: "KeyN", altKey: true, ctrlKey: true })).toBe(
      "Ctrl+Alt+N",
    );
    expect(combinationFromEvent({ ...none, code: "Digit7", shiftKey: true, ctrlKey: true })).toBe(
      "Ctrl+Shift+7",
    );
    expect(combinationFromEvent({ ...none, code: "F5", altKey: true })).toBe("Alt+F5");
  });

  it("gives nothing for a modifier on its own, a key without a modifier, or an unused key", () => {
    expect(combinationFromEvent({ ...none, code: "ControlLeft", ctrlKey: true })).toBeNull();
    expect(combinationFromEvent({ ...none, code: "KeyN" })).toBeNull();
    expect(combinationFromEvent({ ...none, code: "Space", ctrlKey: true })).toBeNull();
  });
});
