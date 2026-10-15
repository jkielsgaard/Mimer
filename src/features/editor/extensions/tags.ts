import type { Range } from "@codemirror/state";
import { Decoration } from "@codemirror/view";

const TAG_RE = /(^|[\s(])#([\p{L}\p{N}_\-/]+)/gu;

export interface TagMatch {
  from: number;
  to: number;
  tag: string;
}

/** Finds `#tag`s in one line of text (`offset` = document position of the line start). */
export function findTags(line: string, offset: number): TagMatch[] {
  const out: TagMatch[] = [];
  for (const m of line.matchAll(TAG_RE)) {
    const [, prefix = "", raw = ""] = m;
    const tag = raw.replace(/[/-]+$/, "");
    if (tag === "" || /^\d+$/.test(tag)) continue;
    const from = offset + m.index + prefix.length;
    out.push({ from, to: from + 1 + tag.length, tag: tag.toLowerCase() });
  }
  return out;
}

/** Pill decorations for tags. */
export function tagDecorations(matches: TagMatch[]): Range<Decoration>[] {
  return matches.map((m) =>
    Decoration.mark({ class: "cm-tag", attributes: { "data-tag": m.tag } }).range(m.from, m.to),
  );
}
