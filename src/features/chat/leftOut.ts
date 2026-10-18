/** A skill's report ends with "Left out:" and a list of notes it did not change and why. */
export function splitLeftOut(content: string): { main: string; leftOut: string[] } {
  const at = content.indexOf("\n\nLeft out:\n");
  if (at < 0) return { main: content, leftOut: [] };
  const lines = content
    .slice(at + "\n\nLeft out:\n".length)
    .split("\n")
    .map((l) => l.replace(/^- /, "").trim())
    .filter((l) => l !== "");
  return { main: content.slice(0, at), leftOut: lines };
}
