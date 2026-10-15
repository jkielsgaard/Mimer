/** A suggested note title for an answer: its first heading or first line, kept short. */
export function suggestTitle(answer: string): string {
  const heading = /^#{1,3}\s+(.+)$/m.exec(answer)?.[1];
  const firstLine = answer.split("\n").find((l) => l.trim() !== "");
  const raw = (heading ?? firstLine ?? "").replace(/[*_`#>]/g, "").trim();
  return raw.length > 60 ? `${raw.slice(0, 57).trimEnd()}…` : raw;
}

/**
 * The text of a note made from a Raven answer: front matter that says where it came from and that
 * it has not been checked, then the answer as written.
 */
export function ravenNoteContent(title: string, answer: string, today: string): string {
  const clean = title.replace(/[\r\n]+/g, " ").trim();
  return `---\ntitle: ${clean}\nsource: raven\ncreated: ${today}\nstatus: needs review\n---\n${answer.trim()}\n`;
}
