import { describe, expect, it } from "vitest";
import { monthGrid, monthTitle, sameDayLastMonth } from "./calendar";

describe("calendar", () => {
  it("makes weeks that start on Monday and mark the days of the month", () => {
    const weeks = monthGrid(2026, 9); // October 2026 starts on a Thursday
    expect(weeks[0]?.map((d) => d.iso)).toEqual([
      "2026-09-28",
      "2026-09-29",
      "2026-09-30",
      "2026-10-01",
      "2026-10-02",
      "2026-10-03",
      "2026-10-04",
    ]);
    expect(weeks[0]?.filter((d) => d.inMonth)).toHaveLength(4);
    expect(weeks.every((w) => w.length === 7)).toBe(true);
    expect(weeks.at(-1)?.some((d) => d.inMonth)).toBe(true);
    expect(weeks.flat().filter((d) => d.inMonth)).toHaveLength(31);
  });

  it("handles a month that starts on Monday and years that change", () => {
    const weeks = monthGrid(2026, 11); // December 2026 starts on a Tuesday
    expect(weeks[0]?.[0]?.iso).toBe("2026-11-30");
    expect(
      monthGrid(2027, 0)
        .flat()
        .filter((d) => d.inMonth),
    ).toHaveLength(31);
  });

  it("names the month and finds the same day last month", () => {
    expect(monthTitle(2026, 9)).toBe("October 2026");
    expect(sameDayLastMonth("2026-10-20")).toBe("2026-09-20");
    expect(sameDayLastMonth("2026-03-31")).toBe("2026-02-28");
    expect(sameDayLastMonth("2026-01-15")).toBe("2025-12-15");
  });
});
