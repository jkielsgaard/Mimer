import { describe, expect, it } from "vitest";
import { splitLeftOut } from "./leftOut";

describe("splitLeftOut", () => {
  it("separates the report from the list of notes left out", () => {
    const r = splitLeftOut(
      "**Sort**: 2 proposed changes.\n\nLeft out:\n- A.md: unchanged\n- B.md: too long\n",
    );
    expect(r.main).toBe("**Sort**: 2 proposed changes.");
    expect(r.leftOut).toEqual(["A.md: unchanged", "B.md: too long"]);
  });
  it("leaves other messages alone", () => {
    expect(splitLeftOut("Hello")).toEqual({ main: "Hello", leftOut: [] });
  });
});
