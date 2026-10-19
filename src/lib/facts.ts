/**
 * The facts in a text that a rewrite must keep: numbers (also phone numbers, dates, times and
 * versions), web addresses, e-mail addresses, wiki-links and #tags.
 */
export function factsOf(text: string): string[] {
  const found = [
    ...text.matchAll(/\[\[[^\]]+\]\]/g),
    ...text.matchAll(/https?:\/\/[^\s)\]>]+/g),
    ...text.matchAll(/[\w.+-]+@[\w-]+\.[\w.-]+/g),
    ...text.matchAll(/(?:^|\s)#[\p{L}\p{N}_/-]*\p{L}[\p{L}\p{N}_/-]*/gu),
    ...text.matchAll(/\d+(?:[.,:/-]\d+)*/g),
  ].map((m) => m[0].trim().replace(/[.,:]$/, ""));
  return [...new Set(found)].filter((f) => f !== "");
}

/** The facts of `before` that are not in `after` (empty when every fact is kept). */
export function missingFacts(before: string, after: string): string[] {
  const kept = new Set(factsOf(after));
  const plain = after.replace(/\s+/g, " ");
  return factsOf(before).filter((f) => !kept.has(f) && !plain.includes(f));
}
