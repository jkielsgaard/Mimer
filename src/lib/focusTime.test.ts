import { describe, expect, it } from "vitest";
import { clampMinutes, minutesError } from "./focusTime";

describe("focus time", () => {
  it("keeps a length inside 1 to 180 whole minutes", () => {
    expect(clampMinutes(35)).toBe(35);
    expect(clampMinutes(0)).toBe(1);
    expect(clampMinutes(500)).toBe(180);
    expect(clampMinutes(12.6)).toBe(13);
    expect(clampMinutes(Number.NaN)).toBe(25);
  });
  it("says what is wrong with a typed length", () => {
    expect(minutesError("35")).toBeNull();
    expect(minutesError("")).not.toBeNull();
    expect(minutesError("ten")).not.toBeNull();
    expect(minutesError("0")).not.toBeNull();
    expect(minutesError("181")).not.toBeNull();
  });
});
