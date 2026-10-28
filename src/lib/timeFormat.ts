/** How times are written: the computer's own way, or 24-hour (`14:30`) or 12-hour (`2:30 PM`). */
export type TimeFormat = "system" | "24" | "12";

/** The way this computer writes times, from its language settings. */
function systemFormat(): "24" | "12" {
  try {
    const cycle = new Intl.DateTimeFormat(undefined, { hour: "numeric" }).resolvedOptions()
      .hourCycle;
    return cycle === "h11" || cycle === "h12" ? "12" : "24";
  } catch {
    return "24";
  }
}

/** `24` or `12`; "system" becomes what the computer uses. */
export function resolveTimeFormat(format: TimeFormat): "24" | "12" {
  return format === "system" ? systemFormat() : format;
}

/** `14:30` as `14:30` or `2:30 PM`. An empty or unreadable time is returned as it is. */
export function formatTime(hhmm: string, format: TimeFormat): string {
  const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm);
  if (!m) return hhmm;
  const h = Number(m[1]);
  const min = m[2] ?? "00";
  if (resolveTimeFormat(format) === "24") return `${String(h).padStart(2, "0")}:${min}`;
  return `${String(h % 12 === 0 ? 12 : h % 12)}:${min} ${h < 12 ? "AM" : "PM"}`;
}

/**
 * Reads a time somebody typed: `14:30`, `1430`, `2:30 pm`, `2.30p`, `9`. Returns `HH:MM`, or null
 * when it is not a time. With `am` or `pm` the hour is 1–12; without, it is the 24-hour clock.
 */
export function parseTime(text: string): string | null {
  const m = /^(\d{1,2})(?:[:.]?(\d{2}))?\s*([ap])?m?$/i.exec(text.trim());
  if (!m) return null;
  let h = Number(m[1]);
  const min = Number(m[2] ?? "0");
  const half = m[3]?.toLowerCase();
  if (min > 59) return null;
  if (half !== undefined) {
    if (h < 1 || h > 12) return null;
    h = (h % 12) + (half === "p" ? 12 : 0);
  } else if (h > 23) return null;
  return `${String(h).padStart(2, "0")}:${String(min).padStart(2, "0")}`;
}
