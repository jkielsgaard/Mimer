const QUESTION_WORDS =
  /^(what|how|why|when|where|who|which|can|is|are|does|do|should|hvad|hvordan|hvorfor|hvornår|hvor|hvem|hvilke|hvilken|kan|er|skal|må)\b/i;

/** Whether search text reads like a question that could be answered from the notes. */
export function looksLikeQuestion(text: string): boolean {
  const t = text.trim();
  if (t.split(/\s+/).length < 3 || /(^|\s)(tag|path):/.test(t)) return false;
  return t.endsWith("?") || QUESTION_WORDS.test(t);
}

const SKIP = new Set(
  "what how why when where who which can is are does do should the and for with that this from have about your there their into hvad hvordan hvorfor hvornår hvor hvem hvilke hvilken kan er skal det der den som med for til fra har ikke eller vores jeg mig min".split(
    " ",
  ),
);

/** The words of a question worth searching for, longest first (at most four). */
export function questionWords(text: string): string[] {
  return [
    ...new Set(
      text
        .toLowerCase()
        .split(/[^\p{L}\p{N}]+/u)
        .filter((w) => w.length >= 3 && !SKIP.has(w)),
    ),
  ]
    .sort((a, b) => b.length - a.length)
    .slice(0, 4);
}
