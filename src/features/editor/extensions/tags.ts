import type { Completion, CompletionContext, CompletionResult } from "@codemirror/autocomplete";
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

/** The tags that begin with what was typed after `#`, most used first (at most 8). */
export function filterTags(
  tags: readonly { tag: string; count: number }[],
  query: string,
): { tag: string; count: number }[] {
  const q = query.toLowerCase();
  return tags
    .filter((t) => t.tag.toLowerCase().startsWith(q) && t.tag.toLowerCase() !== q)
    .sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag))
    .slice(0, 8);
}

/**
 * Suggestions while you type `#`: the tags you already use. It only appears after a `#` that
 * begins a word, so headings (`# Title`) and links are left alone, and nothing is added unless you
 * choose a suggestion.
 */
export function tagCompletion(getTags: () => readonly { tag: string; count: number }[]) {
  return (context: CompletionContext): CompletionResult | null => {
    const before = context.matchBefore(/(^|[\s(])#[\p{L}\p{N}_\-/]*/u);
    if (!before) return null;
    const hash = before.text.indexOf("#");
    const query = before.text.slice(hash + 1);
    if (!context.explicit && query === "" && context.pos - before.from > 1 + hash) return null;
    const options: Completion[] = filterTags(getTags(), query).map((t) => ({
      label: `#${t.tag}`,
      detail: `${String(t.count)} ${t.count === 1 ? "note" : "notes"}`,
      type: "keyword",
    }));
    if (options.length === 0) return null;
    return { from: before.from + hash, options, filter: false };
  };
}
