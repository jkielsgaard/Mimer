/** What the AI is asked for: the main points, then the things to do, in a fixed shape. */
export const IN_SHORT_INSTRUCTION =
  "Read the note below and write two lists. First a line that says POINTS, then at most five short lines that start with '- ': the main points of the note. Then a line that says TODO, then lines that start with '- ' and a verb: the things somebody has to do that the note says or clearly needs. If there is nothing to do, write NONE after TODO. Do not invent facts, and do not repeat the same thing twice. Write in the language of the note. Answer with the two lists only.";

/** The most of a note that is sent to the AI. */
export const IN_SHORT_MAX_CHARS = 12_000;

export interface InShort {
  points: string[];
  todos: string[];
}

/** A list line as plain text: the bullet, number or tick box and the bold marks taken off. */
function clean(line: string): string {
  return line
    .trim()
    .replace(/^(?:[-*•]|\d+[.)])\s+(?:\[[ xX]\]\s+)?/, "")
    .replace(/^\*\*(.+)\*\*$/, "$1")
    .trim();
}

/**
 * Reads the AI's answer: the lines under POINTS and the lines under TODO. A small model may skip
 * a heading or write it in bold or with a colon; lines before any heading count as points.
 */
export function parseInShort(answer: string): InShort {
  const out: InShort = { points: [], todos: [] };
  let into: "points" | "todos" = "points";
  for (const raw of answer.split("\n")) {
    const line = raw.trim();
    if (line === "") continue;
    const heading = /^[#*\s]*(points|to[- ]?do|things to do)[*:\s]*$/i.exec(line);
    if (heading) {
      into = /^points$/i.test(heading[1] ?? "") ? "points" : "todos";
      continue;
    }
    if (/^\s*NONE\b/i.test(line)) continue;
    const text = clean(line);
    if (text !== "" && text.length <= 240) out[into].push(text);
  }
  out.points = out.points.slice(0, 5);
  out.todos = out.todos.slice(0, 8);
  return out;
}

/** The result as Markdown, for the clipboard. */
export function inShortMarkdown(r: InShort): string {
  const points = r.points.map((p) => `- ${p}`).join("\n");
  const todos = r.todos.map((t) => `- [ ] ${t}`).join("\n");
  return [points, todos === "" ? "" : `\n${todos}`].join("\n").trim() + "\n";
}
