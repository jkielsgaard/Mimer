/** One heading of a note. */
export interface Heading {
  /** 0-based line. */
  line: number;
  level: number;
  text: string;
}

/** The headings of a note, outside code blocks and the front matter. */
export function outlineOf(content: string): Heading[] {
  const out: Heading[] = [];
  const lines = content.split("\n");
  let inCode = false;
  let start = 0;
  if (lines[0]?.trim() === "---") {
    const end = lines.findIndex((l, i) => i > 0 && l.trim() === "---");
    if (end > 0) start = end + 1;
  }
  for (let i = start; i < lines.length; i++) {
    const line = (lines[i] ?? "").replace(/\r$/, "");
    if (/^\s*(```|~~~)/.test(line)) {
      inCode = !inCode;
      continue;
    }
    if (inCode) continue;
    const m = /^(#{1,6})\s+(.+?)\s*#*\s*$/.exec(line);
    if (m?.[1] && m[2]) out.push({ line: i, level: m[1].length, text: m[2] });
  }
  return out;
}

/** The wiki-link targets in a note (`[[Target#h|alias]]` gives `Target`), each once. */
export function wikiTargets(content: string): string[] {
  const seen = new Set<string>();
  const re = /!?\[\[([^[\]|#]+)(#[^[\]|]+)?(\|[^[\]]+)?\]\]/g;
  for (const m of content.replace(/```[\s\S]*?```/g, "").matchAll(re)) {
    const t = m[1]?.trim();
    if (t) seen.add(t);
  }
  return [...seen];
}

const STOP = new Set(
  "the and for with that this from have what when your into about over under note notes og det der som med for til fra den har ikke eller hvad".split(
    " ",
  ),
);

/** A few words of a title that are worth searching for (long ones first). */
export function searchWords(title: string): string[] {
  return [
    ...new Set(
      title
        .toLowerCase()
        .split(/[^\p{L}\p{N}]+/u)
        .filter((w) => w.length >= 4 && !STOP.has(w)),
    ),
  ]
    .sort((a, b) => b.length - a.length)
    .slice(0, 3);
}
