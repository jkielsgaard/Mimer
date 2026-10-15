import { fuzzyFilter } from "@/lib/fuzzy";
import { isInside, isMarkdown } from "@/lib/utils";

/** Most notes that can be attached to one message (the backend enforces the same limit). */
export const MAX_MENTIONS = 5;

/** The `/text` the caret is in: where the slash is and what has been typed after it. */
export interface MentionQuery {
  start: number;
  query: string;
}

/**
 * Finds the mention being typed at the caret. A slash only counts at the start of the text or
 * after whitespace, so URLs, dates (`1/2`) and file paths in the middle of a word do not open
 * the note list.
 */
export function findMentionQuery(text: string, caret: number): MentionQuery | null {
  const m = /(^|\s)\/(\S*)$/.exec(text.slice(0, caret));
  if (!m) return null;
  const query = m[2] ?? "";
  return { start: caret - query.length - 1, query };
}

/** The text with the typed `/query` removed, and where the caret goes. */
export function removeMentionQuery(
  text: string,
  q: MentionQuery,
  caret: number,
): { text: string; caret: number } {
  return { text: text.slice(0, q.start) + text.slice(caret), caret: q.start };
}

/** True when an attached path is a folder (every note path ends in `.md`). */
export function isFolderMention(path: string): boolean {
  return !isMarkdown(path);
}

/**
 * Notes and folders to offer for `query`: Markdown notes and folders with notes inside `scope`
 * (the active project's folder, or `null` for the whole vault) that are not attached yet, best
 * fuzzy match first. `folders` maps each folder that holds notes to its note count.
 */
export function mentionCandidates(
  files: readonly string[],
  query: string,
  scope: string | null,
  chosen: readonly string[],
  limit = 8,
  folders: ReadonlyMap<string, number> = new Map(),
): string[] {
  const inScope = (p: string): boolean => scope === null || isInside(p, scope);
  const pool = [
    ...[...folders.keys()].filter((f) => !chosen.includes(f) && inScope(f)),
    ...files.filter((f) => isMarkdown(f) && !chosen.includes(f) && inScope(f)),
  ];
  return fuzzyFilter(pool, query, (f) => f.replace(/\.md$/i, ""), limit);
}
