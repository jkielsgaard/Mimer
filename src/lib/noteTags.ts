/**
 * The tags a note can be given from the Tags menu. A tag is only made when it can do something a
 * folder cannot (see docs/DECISIONS.md); a new one is one more entry here. The names are the words
 * written in the note's properties (`tags: [meeting]`).
 */
export interface NoteTag {
  tag: string;
  label: string;
  /** What it does, shown in the menu. */
  does: string;
}

export const NOTE_TAGS: readonly NoteTag[] = [
  {
    tag: "meeting",
    label: "Meeting",
    does: "Start meeting shows, and the agenda is not read as tasks.",
  },
  {
    tag: "epic",
    label: "Epic",
    does: "Its tasks are listed with your epics in Tasks.",
  },
  {
    tag: "pinned",
    label: "Pinned",
    does: "The note is listed under Pinned on the start page.",
  },
];

/** The names of Mimer's own tags: the tags that do something. Every other tag is the person's. */
export const SYSTEM_TAGS: readonly string[] = NOTE_TAGS.map((t) => t.tag);

/** Whether a tag is one of Mimer's own (`meeting`, `epic`, `pinned`). */
export function isSystemTag(tag: string): boolean {
  return SYSTEM_TAGS.includes(tag.toLowerCase());
}

/** The tags that are not Mimer's own. */
export function userTags(tags: readonly string[]): string[] {
  return tags.filter((t) => !isSystemTag(t));
}

/**
 * A tag as it is written in a note: lower case, letters, digits, `-` and `_`, and nothing else
 * (the same as a `#tag` in the text). A leading `#` is dropped. Returns null when it is not a tag.
 */
export function cleanTagName(text: string): string | null {
  const t = text.trim().replace(/^#+/, "").toLowerCase();
  if (t === "" || !/^[\p{L}\p{N}_-]+$/u.test(t) || /^\d+$/.test(t)) return null;
  return t;
}

/** The `#tags` written in the text of a note (not in its properties or in code), lower case. */
export function textTags(content: string): string[] {
  const body = content
    .replace(/^---\r?\n[\s\S]*?\r?\n---[ \t]*(\r?\n|$)/, "")
    .replace(/```[\s\S]*?```|~~~[\s\S]*?~~~/g, " ")
    .replace(/`[^`\n]*`/g, " ");
  const found = new Set<string>();
  for (const m of body.matchAll(/(^|[\s(])#([\p{L}\p{N}_\-/]+)/gmu)) {
    const t = (m[2] ?? "").replace(/[/-]+$/, "").toLowerCase();
    if (t !== "" && !/^\d+$/.test(t)) found.add(t);
  }
  return [...found].sort();
}
