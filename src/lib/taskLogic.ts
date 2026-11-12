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

/** An epic: a note with its tasks. */
export interface EpicGroup {
  /** The note. */
  path: string;
  title: string;
  /** The note the epic was made from, as a link target. */
  source: string | null;
  /** The note is in `Tasks/` (an epic of its own); otherwise it is an ordinary note with tasks. */
  native: boolean;
  /** Whether it is an epic (in `Tasks/` or tagged `epic`), not only a note that has tasks. */
  adopted: boolean;
  tasks: Task[];
  /** Tasks that are done or dropped. */
  done: number;
  total: number;
  /** Every task is done: the epic counts as done. */
  allDone: boolean;
  /** The day the first of its tasks was made (`made:`), if any task has one. */
  made: string | null;
}

/** Whether a note is in the epic folder (`Tasks/`): its epic can be renamed and deleted here. */
export function inEpicFolder(path: string): boolean {
  return /^Tasks\/[^/]+\.md$/i.test(path);
}

/** The Inbox epic, where tasks go when no epic is chosen. */
export const INBOX = "Tasks/Inbox.md";

/**
 * The epics of the vault: every epic note in `Tasks/` (also when empty) and every other note
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
  const make = (
    path: string,
    title: string,
    source: string | null,
    adopted: boolean,
  ): EpicGroup => {
    const list = (byPath.get(path) ?? []).sort((a, b) => a.line - b.line);
    const done = list.filter((t) => !isOpen(t)).length;
    const dates = list.map((t) => t.made).filter((d): d is string => d !== null);
    return {
      path,
      title,
      source,
      native: inEpicFolder(path),
      adopted,
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

/**
 * A list of tasks with the open ones first and the done ones last, each in the order they have
 * in the note. The note is not changed: this is only how the tasks are shown.
 */
export function openThenDone(tasks: readonly Task[]): { open: Task[]; done: Task[] } {
  return {
    open: tasks.filter((t) => isOpen(t)),
    done: tasks.filter((t) => !isOpen(t)),
  };
}

/** How one task names another in its `after:` word: the note's path without `.md`, `#`, the title. */
export function taskRef(t: Pick<Task, "path" | "title">): string {
  return `${t.path.replace(/\.md$/i, "")}#${t.title}`;
}

/** The task that `t` waits for (its `after:` word), or null when there is none or it is gone. */
export function afterTarget(tasks: readonly Task[], t: Pick<Task, "after">): Task | null {
  if (t.after === null) return null;
  return tasks.find((x) => taskRef(x) === t.after) ?? null;
}

/** What an epic card shows: how many tasks are being worked on or waited for, and what is next. */
export interface EpicSummary {
  doing: number;
  waiting: number;
  /** The first open task that is not waiting. */
  next: Task | null;
  /** What the waiting tasks wait for, in the person's words (the task's title when it has none). */
  waitingOn: string[];
}

export function epicSummary(g: Pick<EpicGroup, "tasks">): EpicSummary {
  const open = g.tasks.filter(isOpen);
  const waiting = open.filter((t) => t.status === "waiting");
  return {
    doing: open.filter((t) => t.status === "doing").length,
    waiting: waiting.length,
    next: open.find((t) => t.status !== "waiting") ?? null,
    waitingOn: waiting.map((t) => t.waitingFor ?? t.title),
  };
}

/** Which tasks of an epic a filter on the task list shows. */
export type TaskFilter = "all" | "doing" | "waiting" | "next";

export function filterTasks(tasks: readonly Task[], filter: TaskFilter): Task[] {
  switch (filter) {
    case "all":
      return [...tasks];
    case "doing":
      return tasks.filter((t) => isOpen(t) && t.status === "doing");
    case "waiting":
      return tasks.filter((t) => isOpen(t) && t.status === "waiting");
    case "next": {
      const next = epicSummary({ tasks: [...tasks] }).next;
      return next === null ? [] : [next];
    }
  }
}

/** The latest day anything happened in an epic: a task was made or a log line was written. */
export function lastActivity(g: Pick<EpicGroup, "tasks">): string | null {
  let latest: string | null = null;
  for (const t of g.tasks) {
    for (const d of [t.made, ...t.log.map((l) => l.date)]) {
      if (d !== null && (latest === null || d > latest)) latest = d;
    }
  }
  return latest;
}

/** How many days without activity make an epic quiet. */
export const QUIET_DAYS = 14;

/** An epic with open tasks where nothing has happened for a while (unknown dates do not count). */
export function isQuiet(g: EpicGroup, today: string = todayIso()): boolean {
  if (g.allDone || g.total === 0) return false;
  const last = lastActivity(g);
  if (last === null) return false;
  const days = (parseIso(today).getTime() - parseIso(last).getTime()) / 86_400_000;
  return days > QUIET_DAYS;
}

/** What a log line starts with when it says where you left off in a task. */
export const LEFT_OFF_PREFIX = "Left off: ";

/** The log line for "where I left off, and the next step": one line, single spaces. */
export function leftOffLine(text: string): string {
  return `${LEFT_OFF_PREFIX}${taskText(text)}`;
}

/** Where you left off in a task: the text and the day, from its latest "Left off:" log line. */
export function latestLeftOff(t: Pick<Task, "log">): { date: string; text: string } | null {
  const line = [...t.log].reverse().find((l) => l.text.startsWith(LEFT_OFF_PREFIX));
  return line ? { date: line.date, text: line.text.slice(LEFT_OFF_PREFIX.length).trim() } : null;
}

/** How many days back "where you left off" is still shown on the start page. */
export const LEFT_OFF_DAYS = 7;

/**
 * The newest "Left off" of an open task, when it is not older than a week, and the task it is in.
 * Of two on the same day the one lower in the note counts as the later one.
 */
export function recentLeftOff(
  tasks: readonly Task[],
  today: string = todayIso(),
): { task: Task; date: string; text: string } | null {
  let best: { task: Task; date: string; text: string } | null = null;
  for (const task of tasks) {
    if (!isOpen(task)) continue;
    const found = latestLeftOff(task);
    if (found === null) continue;
    const days = (parseIso(today).getTime() - parseIso(found.date).getTime()) / 86_400_000;
    if (days > LEFT_OFF_DAYS || days < 0) continue;
    if (best === null || found.date >= best.date) best = { task, ...found };
  }
  return best;
}

/** The open tasks that wait for `t` (the ones whose `after:` points at it). */
export function waitersOf(tasks: readonly Task[], t: Pick<Task, "path" | "title">): Task[] {
  const ref = taskRef(t);
  return tasks.filter((x) => x.after === ref && isOpen(x));
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
