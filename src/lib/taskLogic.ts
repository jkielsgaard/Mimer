import type { Task } from "@/bindings/Task";

/** `YYYY-MM-DD` of a date in the computer's own time zone. */
export function isoDate(d: Date): string {
  const p = (n: number): string => String(n).padStart(2, "0");
  return `${String(d.getFullYear())}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export function todayIso(now: Date = new Date()): string {
  return isoDate(now);
}

function parseIso(iso: string): Date {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y ?? 1970, (m ?? 1) - 1, d ?? 1);
}

/** The date `n` days after (or before) `iso`. */
export function addDays(iso: string, n: number): string {
  const d = parseIso(iso);
  d.setDate(d.getDate() + n);
  return isoDate(d);
}

const WEEKDAYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** `Fri 23 Oct`. */
export function shortDate(iso: string): string {
  const d = parseIso(iso);
  const day = WEEKDAYS[d.getDay()] ?? "";
  return `${day.charAt(0).toUpperCase()}${day.slice(1)} ${String(d.getDate())} ${MONTHS[d.getMonth()] ?? ""}`;
}

/** A task that is neither done nor dropped. */
export function isOpen(t: Task): boolean {
  return !t.done && t.status !== "dropped";
}

/** An epic task: a note with its tasks. */
export interface EpicGroup {
  /** The note. */
  path: string;
  title: string;
  /** The note the epic was made from, as a link target. */
  source: string | null;
  /** The note is in `Tasks/` (an epic of its own); otherwise it is an ordinary note with tasks. */
  native: boolean;
  tasks: Task[];
  /** Tasks that are done or dropped. */
  done: number;
  total: number;
  /** Every task is done: the epic counts as done. */
  allDone: boolean;
  /** The day the first of its tasks was made (`made:`), if any task has one. */
  made: string | null;
}

/** The Inbox epic, where tasks go when no epic is chosen. */
export const INBOX = "Tasks/Inbox.md";

/**
 * The epic tasks of the vault: every epic note in `Tasks/` (also when empty) and every other note
 * that has tasks. The Inbox first, then the user's own order (`order`, note paths), then the rest
 * by name; the tasks in the order they are in the note.
 */
export function epicGroups(
  tasks: readonly Task[],
  epics: readonly { path: string; title: string; source: string | null }[],
  order: readonly string[] = [],
): EpicGroup[] {
  const byPath = new Map<string, Task[]>();
  for (const t of tasks) byPath.set(t.path, [...(byPath.get(t.path) ?? []), t]);
  const make = (path: string, title: string, source: string | null, native: boolean): EpicGroup => {
    const list = (byPath.get(path) ?? []).sort((a, b) => a.line - b.line);
    const done = list.filter((t) => !isOpen(t)).length;
    const dates = list.map((t) => t.made).filter((d): d is string => d !== null);
    return {
      path,
      title,
      source,
      native,
      tasks: list,
      done,
      total: list.length,
      allDone: list.length > 0 && done === list.length,
      made: dates.length > 0 ? dates.reduce((a, b) => (a < b ? a : b)) : null,
    };
  };
  const groups = epics.map((e) => make(e.path, e.title, e.source, true));
  const known = new Set(epics.map((e) => e.path));
  for (const path of byPath.keys()) {
    if (!known.has(path)) groups.push(make(path, noteName(path), null, false));
  }
  const place = (g: EpicGroup): number => {
    const i = order.indexOf(g.path);
    return i === -1 ? order.length : i;
  };
  return groups.sort(
    (a, b) =>
      Number(b.path === INBOX) - Number(a.path === INBOX) ||
      place(a) - place(b) ||
      a.title.localeCompare(b.title, undefined, { sensitivity: "base" }),
  );
}

/** The note a task is in, as a name (`Møde med Acme`). */
export function noteName(path: string): string {
  return (path.split("/").pop() ?? path).replace(/\.md$/i, "");
}

/** What was typed, as the text of a task line: one line, single spaces. Words are not read as
 * dates: a task has no due date or plan, only the day it was made (Mimer adds that). */
export function taskText(input: string): string {
  return input.trim().replace(/\s+/g, " ");
}

/** The steps of an AI answer: one per line, with bullets and numbers taken off. */
export function stepsFromAnswer(answer: string): string[] {
  return answer
    .split("\n")
    .map((l) =>
      l
        .trim()
        .replace(/^(?:[-*•]|\d+[.)])\s+(?:\[[ xX]\]\s+)?/, "")
        .replace(/^\*\*(.+)\*\*$/, "$1")
        .trim(),
    )
    .filter((l) => l !== "" && !l.endsWith(":") && l.length <= 200)
    .slice(0, 8);
}
