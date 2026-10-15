import { joinPath } from "@/lib/utils";

/** What was read from an answer pasted back from a cloud AI. */
export interface ParsedAnswer {
  /** A short title for the note (also used for its file name). */
  title: string;
  /** The Markdown to write, always with front matter that says it needs review. */
  content: string;
  /** Things the user should know before saving (missing sources, no title…). */
  warnings: string[];
}

const OPENER = /```(?:markdown|md)?[ \t]*\n/i;

/** Removes one code fence around the whole answer and any chatter before the document. */
function unwrap(raw: string): string {
  let text = raw.trim();
  const start = text.search(/^---\s*$/m);
  const heading = text.search(/^#\s/m);
  const content = [start, heading].filter((i) => i >= 0);
  const firstContent = content.length > 0 ? Math.min(...content) : -1;
  const opener = OPENER.exec(text);
  // A fence that opens before the document starts wraps the whole answer.
  if (opener && text.endsWith("```") && (firstContent < 0 || opener.index < firstContent)) {
    text = text.slice(opener.index + opener[0].length, text.length - 3).trim();
  } else if (firstContent > 0) {
    text = text.slice(firstContent);
  }
  return text;
}

/** Splits `---` front matter from the body. */
function splitFrontMatter(text: string): { front: string; body: string } | null {
  const m = /^---\s*\n([\s\S]*?)\n---\s*(?:\n([\s\S]*))?$/.exec(text);
  return m ? { front: m[1] ?? "", body: m[2] ?? "" } : null;
}

/** A name that works as a file name on every system. */
export function safeFileName(title: string): string {
  return (
    title
      .replace(/[\\/:*?"<>|#^[\]]/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 80)
      .trim() || "Research"
  );
}

/** First free file name `Title.md`, `Title 2.md`, … in `folder`. */
export function freeNoteName(title: string, folder: string, files: readonly string[]): string {
  const base = safeFileName(title);
  let name = base;
  for (let i = 2; files.includes(joinPath(folder, `${name}.md`)); i++)
    name = `${base} ${String(i)}`;
  return name;
}

/**
 * Reads the answer of a cloud AI that followed the research prompt. It is forgiving: it accepts
 * a code fence or a sentence before the document, and adds the front matter when it is missing,
 * so the result can always be saved as a note marked "needs review".
 */
export function parseResearchAnswer(raw: string, today: string): ParsedAnswer {
  const warnings: string[] = [];
  const text = unwrap(raw);
  const parts = splitFrontMatter(text);
  let front = parts?.front ?? "";
  const body = (parts?.body ?? text).trim();

  const fromFront = /^title:\s*(.+)$/im
    .exec(front)?.[1]
    ?.trim()
    .replace(/^["']|["']$/g, "");
  const fromHeading = /^#\s+(.+)$/m.exec(body)?.[1]?.trim();
  const title = fromFront ?? fromHeading ?? "";
  if (title === "") warnings.push("The answer has no title; choose one before saving.");

  if (!parts) warnings.push("The answer had no front matter; it was added.");
  const lines = front === "" ? [] : front.split("\n");
  const has = (key: string): boolean => lines.some((l) => l.toLowerCase().startsWith(`${key}:`));
  if (!has("title") && title !== "") lines.unshift(`title: ${title}`);
  if (!has("source")) lines.push("source: cloud-ai-research");
  if (!has("created")) lines.push(`created: ${today}`);
  if (has("status")) {
    // Whatever the AI wrote, a new answer has not been reviewed by the user yet.
    front = lines.map((l) => (/^status:/i.test(l) ? "status: needs review" : l)).join("\n");
  } else {
    front = [...lines, "status: needs review"].join("\n");
  }

  if (!/^##\s+sources\b/im.test(body) || !/https?:\/\//i.test(body)) {
    warnings.push("The answer lists no sources with links. Check the facts before you rely on it.");
  }
  if (body.length < 200)
    warnings.push("The answer is very short. Did the whole answer get pasted?");

  return { title, content: `---\n${front}\n---\n${body}\n`, warnings };
}
