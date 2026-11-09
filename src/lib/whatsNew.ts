import { safeStorage } from "./safeStorage";

/** One line of "What's new": a bold lead and what it says. */
export interface NewThing {
  lead: string;
  text: string;
}

/** Where the full list of changes is. */
export const CHANGELOG_URL = "https://github.com/jkielsgaard/Mimer/blob/main/CHANGELOG.md";

const SEEN_KEY = "mimer.whatsNewSeen";
/** At most this many lines are shown. */
const MAX_LINES = 6;

/** `0.21` from `0.21.3` or `0.21.0+abc123.dirty`: what "a new version" means for this window. */
export function minorOf(version: string): string {
  const [major, minor] = version.split("+")[0]?.split(".") ?? [];
  return `${major ?? "0"}.${minor ?? "0"}`;
}

/** Markdown marks taken out of a line of text: bold, italic, code and the target of a link. */
function plain(text: string): string {
  return text
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/[*_`]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * The lines of "What's new" for a version, read from the text of `CHANGELOG.md`: the top-level
 * bullets under Added, then Changed, in the section `## [version]`, at most six. A version with no
 * section gives an empty list.
 */
export function sectionFor(changelog: string, version: string): NewThing[] {
  const wanted = version.split("+")[0] ?? version;
  const lines = changelog.split("\n");
  const start = lines.findIndex((l) => l.startsWith(`## [${wanted}]`));
  if (start === -1) return [];
  let end = lines.findIndex((l, i) => i > start && l.startsWith("## "));
  if (end === -1) end = lines.length;
  const byKind: Record<string, NewThing[]> = { Added: [], Changed: [] };
  let kind: string | null = null;
  for (const line of lines.slice(start + 1, end)) {
    const head = /^### (\w+)/.exec(line);
    if (head) {
      kind = head[1] ?? null;
      continue;
    }
    const bullet = /^- (.*)$/.exec(line);
    const list = kind === null ? undefined : byKind[kind];
    if (!bullet || !list) continue;
    const body = bullet[1] ?? "";
    const lead = /^\*\*(.+?)\*\*[.:]?\s*(.*)$/.exec(body);
    list.push(
      lead
        ? { lead: plain(lead[1] ?? "").replace(/[.:]$/, ""), text: plain(lead[2] ?? "") }
        : { lead: "", text: plain(body) },
    );
  }
  return [...(byKind.Added ?? []), ...(byKind.Changed ?? [])].slice(0, MAX_LINES);
}

/**
 * Whether the window comes by itself: never the first time Mimer runs on a computer, not when the
 * version (its major and minor number) is the one already seen, and otherwise yes.
 */
export function shouldShow(seen: string | null, version: string, firstRun: boolean): boolean {
  if (firstRun) return false;
  return seen !== minorOf(version);
}

/** The version (major.minor) whose "What's new" was seen on this computer, or null. */
export function whatsNewSeen(): string | null {
  return safeStorage.getItem(SEEN_KEY);
}

/** Remembers that "What's new" of this version was seen. */
export function markWhatsNewSeen(version: string): void {
  safeStorage.setItem(SEEN_KEY, minorOf(version));
}
