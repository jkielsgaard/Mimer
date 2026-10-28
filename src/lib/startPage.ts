import type { TreeNode } from "@/bindings/TreeNode";
import { shortDate, todayIso } from "./taskLogic";
import { formatTime, type TimeFormat } from "./timeFormat";

export type NoteKind = "note" | "meeting" | "epic" | "daily";

/** The tag that puts a note under Pinned on the start page. */
export const PINNED_TAG = "pinned";

/** What a note is: its tag decides meeting and epic, its name `2026-10-28` makes it a daily note. */
export function noteKind(
  path: string,
  meetings: ReadonlySet<string>,
  epics: ReadonlySet<string>,
): NoteKind {
  if (meetings.has(path)) return "meeting";
  if (epics.has(path)) return "epic";
  const name = path.split("/").pop() ?? path;
  return /^\d{4}-\d{2}-\d{2}\.md$/i.test(name) ? "daily" : "note";
}

export const KIND_LABEL: Record<NoteKind, string> = {
  note: "Note",
  meeting: "Meeting",
  epic: "Epic",
  daily: "Daily",
};

/** The filters over the recent list; a daily note counts as a note. */
export type RecentFilter = "all" | "note" | "meeting" | "epic";

export function matchesFilter(kind: NoteKind, filter: RecentFilter): boolean {
  if (filter === "all") return true;
  if (filter === "note") return kind === "note" || kind === "daily";
  return kind === filter;
}

/** When each file was last changed, by path. */
export function modifiedByPath(tree: readonly TreeNode[]): Map<string, number> {
  const out = new Map<string, number>();
  const walk = (nodes: readonly TreeNode[]): void => {
    for (const n of nodes) {
      if (n.isDir) walk(n.children);
      else out.set(n.path, n.modified);
    }
  };
  walk(tree);
  return out;
}

/** `16:42 today`, `yesterday`, `Mon`, or `23 Oct` for a time in milliseconds. */
export function whenChanged(ms: number, now: Date = new Date(), format: TimeFormat = "24"): string {
  if (ms <= 0) return "";
  const d = new Date(ms);
  const day = (x: Date): string => todayIso(x);
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (day(d) === day(now)) {
    const hhmm = `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
    return `${formatTime(hhmm, format)} today`;
  }
  if (day(d) === day(yesterday)) return "yesterday";
  const days = (now.getTime() - ms) / 86_400_000;
  const short = shortDate(day(d));
  // Within the week the weekday is enough; further back the date is clearer.
  return days < 6 ? (short.split(" ")[0] ?? short) : short.replace(/^\S+ /, "");
}

/** The first lines of a note's text, without the properties, headings and formatting marks. */
export function noteExcerpt(content: string, max = 200): string {
  let body = content;
  if (body.startsWith("---")) {
    const end = /\n---\s*(\n|$)/.exec(body.slice(3));
    if (end) body = body.slice(3 + end.index + end[0].length);
  }
  const text = body
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l !== "" && !l.startsWith("#"))
    .join(" ")
    .replace(/\[\[([^\]|]+)\|([^\]]+)\]\]/g, "$2")
    .replace(/\[\[([^\]]+)\]\]/g, "$1")
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/^[-*+]\s+(\[[ xX]\]\s+)?/, "")
    .replace(/[*_`~]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  return text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text;
}
