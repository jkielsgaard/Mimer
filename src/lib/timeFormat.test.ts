import { describe, expect, it } from "vitest";
import { formatTime, parseTime, resolveTimeFormat } from "./timeFormat";

describe("formatTime", () => {
  it("writes 24-hour and 12-hour", () => {
    expect(formatTime("14:30", "24")).toBe("14:30");
    expect(formatTime("09:05", "24")).toBe("09:05");
    expect(formatTime("14:30", "12")).toBe("2:30 PM");
    expect(formatTime("09:05", "12")).toBe("9:05 AM");
    expect(formatTime("00:10", "12")).toBe("12:10 AM");
    expect(formatTime("12:00", "12")).toBe("12:00 PM");
  });
  it("returns what is not a time as it is", () => {
    expect(formatTime("", "12")).toBe("");
    expect(formatTime("soon", "24")).toBe("soon");
  });
  it("turns system into one of the two", () => {
    expect(["24", "12"]).toContain(resolveTimeFormat("system"));
    expect(resolveTimeFormat("12")).toBe("12");
  });
});

describe("parseTime", () => {
  it("reads the ways people write a time", () => {
    expect(parseTime("14:30")).toBe("14:30");
    expect(parseTime("1430")).toBe("14:30");
    expect(parseTime("9")).toBe("09:00");
    expect(parseTime("930")).toBe("09:30");
    expect(parseTime("2:30 pm")).toBe("14:30");
    expect(parseTime("2.30PM")).toBe("14:30");
    expect(parseTime("2p")).toBe("14:00");
    expect(parseTime("12:15 am")).toBe("00:15");
    expect(parseTime("12 pm")).toBe("12:00");
  });
  it("refuses what is not a time", () => {
    expect(parseTime("")).toBeNull();
    expect(parseTime("25:00")).toBeNull();
    expect(parseTime("10:75")).toBeNull();
    expect(parseTime("13 pm")).toBeNull();
    expect(parseTime("noon")).toBeNull();
  });
});
