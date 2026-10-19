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

/** Whole days from `a` to `b` (positive when `b` is later). */
export function daysBetween(a: string, b: string): number {
  return Math.round((parseIso(b).getTime() - parseIso(a).getTime()) / 86_400_000);
}

const WEEKDAYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** `Fri 23 Oct`. */
export function shortDate(iso: string): string {
  const d = parseIso(iso);
  const day = WEEKDAYS[d.getDay()] ?? "";
  return `${day.charAt(0).toUpperCase()}${day.slice(1)} ${String(d.getDate())} ${MONTHS[d.getMonth()] ?? ""}`;
}

export type Bucket = "moved" | "today" | "week" | "later";

/** The date a task is meant for: the day it was planned, else its due date. `later` = none. */
export function effectiveDate(t: Task): string | null {
  if (t.plan === "later") return null;
  if (t.plan !== null) return t.plan;
  return t.due;
}

/** A task that is neither done nor dropped. */
export function isOpen(t: Task): boolean {
  return !t.done && t.status !== "dropped";
}

export function bucketOf(t: Task, today: string): Bucket {
  const date = effectiveDate(t);
  if (date === null) return "later";
  if (date < today) return "moved";
  if (date === today) return "today";
  return date <= addDays(today, 7) ? "week" : "later";
}

export interface TaskGroup {
  id: string;
  label: string;
  tasks: Task[];
}

function byDateThenTitle(a: Task, b: Task): number {
  const da = effectiveDate(a) ?? "9999";
  const db = effectiveDate(b) ?? "9999";
  return da === db ? a.title.localeCompare(b.title) : da < db ? -1 : 1;
}

const WHEN: { id: Bucket | "done"; label: string }[] = [
  { id: "today", label: "Today" },
  { id: "moved", label: "Moved from earlier" },
  { id: "week", label: "This week" },
  { id: "later", label: "Later" },
  { id: "done", label: "Done" },
];

/** Groups tasks as the list shows them. Empty groups are left out. */
export function groupTasks(
  tasks: readonly Task[],
  by: "when" | "note" | "tag",
  today: string,
  showDone: boolean,
): TaskGroup[] {
  const shown = tasks.filter((t) => showDone || isOpen(t));
  if (by === "when") {
    return WHEN.map((w) => ({
      id: w.id,
      label: w.label,
      tasks: shown
        .filter((t) => (isOpen(t) ? bucketOf(t, today) === w.id : w.id === "done"))
        .sort(byDateThenTitle),
    })).filter((g) => g.tasks.length > 0);
  }
  const groups = new Map<string, Task[]>();
  for (const t of shown) {
    const keys =
      by === "note"
        ? [t.path.replace(/\.md$/i, "")]
        : t.tags.length > 0
          ? t.tags.map((x) => `#${x}`)
          : ["No tag"];
    for (const k of keys) groups.set(k, [...(groups.get(k) ?? []), t]);
  }
  return [...groups.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([label, list]) => ({ id: label, label, tasks: list.sort(byDateThenTitle) }));
}

/** The tasks the list shows for a time filter and a tag. `done` also brings the done ones. */
export function filterTasks(
  tasks: readonly Task[],
  when: "all" | Bucket | "done",
  tag: string | null,
  today: string,
): Task[] {
  return tasks.filter((t) => {
    if (tag !== null && !t.tags.includes(tag)) return false;
    if (when === "all") return true;
    if (when === "done") return !isOpen(t);
    return isOpen(t) && bucketOf(t, today) === when;
  });
}

/** How many open tasks are in each part of the time line, and how many are done. */
export function countByWhen(
  tasks: readonly Task[],
  today: string,
): Record<"all" | Bucket | "done", number> {
  const n = { all: 0, today: 0, moved: 0, week: 0, later: 0, done: 0 };
  for (const t of tasks) {
    if (isOpen(t)) {
      n.all += 1;
      n[bucketOf(t, today)] += 1;
    } else if (t.done) n.done += 1;
  }
  return n;
}

/** The tags of the open tasks with how many tasks each has, most used first. */
export function tagCounts(tasks: readonly Task[]): { tag: string; count: number }[] {
  const m = new Map<string, number>();
  for (const t of tasks.filter(isOpen)) for (const g of t.tags) m.set(g, (m.get(g) ?? 0) + 1);
  return [...m.entries()]
    .map(([tag, count]) => ({ tag, count }))
    .sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag));
}

/** Minutes the tasks are estimated to take (tasks without an estimate count as nothing). */
export function totalMinutes(tasks: readonly Task[]): number {
  return tasks.reduce((sum, t) => sum + (t.estMinutes ?? 0), 0);
}

/** `1 h 15 min`, `50 min`. */
export function durationLabel(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${String(m)} min`;
  return m === 0 ? `${String(h)} h` : `${String(h)} h ${String(m)} min`;
}

/** What to show for a task's date: `Today`, `Tomorrow`, `Fri 23 Oct`, `3 days late`. */
export function whenLabel(t: Task, today: string): string | null {
  const date = t.due ?? effectiveDate(t);
  if (date === null) return null;
  const diff = daysBetween(today, date);
  if (diff === 0) return "Today";
  if (diff === 1) return "Tomorrow";
  if (diff < 0) return `${String(-diff)} day${diff === -1 ? "" : "s"} late`;
  return shortDate(date);
}

/** The note a task is in, as a name (`Møde med Acme`). */
export function noteName(path: string): string {
  return (path.split("/").pop() ?? path).replace(/\.md$/i, "");
}

const DAY_WORDS: Record<string, number> = {
  sun: 0,
  sunday: 0,
  mon: 1,
  monday: 1,
  tue: 2,
  tues: 2,
  tuesday: 2,
  wed: 3,
  wednesday: 3,
  thu: 4,
  thur: 4,
  thurs: 4,
  thursday: 4,
  fri: 5,
  friday: 5,
  sat: 6,
  saturday: 6,
};

/**
 * Turns what was typed into the text of a task line: a date word at the end (`tomorrow`, `fri`,
 * `in 3 days`, `2026-11-01`) becomes `due:`, and `~15m` becomes `est:15m`. A task typed in
 * without a date is for today (`plan:`), because that is why it was written; the word `later` at
 * the end puts it away instead.
 */
export function quickTaskText(
  input: string,
  today: string,
  defaultPlan: "today" | "later" = "today",
): string {
  let text = input.trim().replace(/\s+/g, " ");
  const extra: string[] = [];
  const est = / ~(\d+(?:h\d+m|h|m))$/i.exec(text);
  if (est) {
    extra.push(`est:${(est[1] ?? "").toLowerCase()}`);
    text = text.slice(0, est.index);
  }
  const putAway = / later$/i.exec(text);
  if (putAway) {
    extra.unshift("plan:later");
    text = text.slice(0, putAway.index);
  }
  const rules: [RegExp, (m: RegExpExecArray) => string | null][] = [
    [/ (\d{4}-\d{2}-\d{2})$/, (m) => m[1] ?? null],
    [/ today$/i, () => today],
    [/ tomorrow$/i, () => addDays(today, 1)],
    [/ in (\d{1,3}) days?$/i, (m) => addDays(today, Number(m[1]))],
    [
      / (sun|sunday|mon|monday|tue|tues|tuesday|wed|wednesday|thu|thur|thurs|thursday|fri|friday|sat|saturday)$/i,
      (m) => {
        const want = DAY_WORDS[(m[1] ?? "").toLowerCase()];
        if (want === undefined) return null;
        const now = parseIso(today).getDay();
        return addDays(today, ((want - now + 6) % 7) + 1);
      },
    ],
  ];
  let dated = putAway !== null;
  for (const [re, date] of rules) {
    if (dated) break;
    const m = re.exec(text);
    const value = m ? date(m) : null;
    if (m && value !== null) {
      extra.unshift(`due:${value}`);
      text = text.slice(0, m.index);
      dated = true;
      break;
    }
  }
  if (!dated && !/(?:^|\s)(?:due|plan):\S+/.test(text))
    extra.unshift(defaultPlan === "later" ? "plan:later" : `plan:${today}`);
  return [text, ...extra].join(" ").trim();
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
