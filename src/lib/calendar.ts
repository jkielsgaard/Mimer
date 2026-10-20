import { addDays, isoDate } from "./taskLogic";

/** One day in a month grid. */
export interface CalendarDay {
  /** `YYYY-MM-DD`. */
  iso: string;
  day: number;
  /** The day belongs to the month shown (the grid also has days of the months around it). */
  inMonth: boolean;
}

/** The weeks of a month, Monday first, each with seven days. `month` is 0-based. */
export function monthGrid(year: number, month: number): CalendarDay[][] {
  const first = new Date(year, month, 1);
  const offset = (first.getDay() + 6) % 7;
  const start = addDays(isoDate(first), -offset);
  const weeks: CalendarDay[][] = [];
  let cursor = start;
  for (let w = 0; w < 6; w++) {
    const week: CalendarDay[] = [];
    for (let d = 0; d < 7; d++) {
      const [y, m, day] = cursor.split("-").map(Number);
      week.push({ iso: cursor, day: day ?? 1, inMonth: y === year && (m ?? 1) - 1 === month });
      cursor = addDays(cursor, 1);
    }
    // A sixth week that is only days of the next month is left out.
    if (w === 5 && week.every((x) => !x.inMonth)) break;
    weeks.push(week);
  }
  return weeks;
}

const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

/** `October 2026`. */
export function monthTitle(year: number, month: number): string {
  return `${MONTHS[month] ?? ""} ${String(year)}`;
}

/** The same day one month earlier (the last day of that month if it is shorter), as `YYYY-MM-DD`. */
export function sameDayLastMonth(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  const prev = new Date(y ?? 1970, (m ?? 1) - 2, 1);
  const last = new Date(prev.getFullYear(), prev.getMonth() + 1, 0).getDate();
  return isoDate(new Date(prev.getFullYear(), prev.getMonth(), Math.min(d ?? 1, last)));
}
