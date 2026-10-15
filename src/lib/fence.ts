/** Strips a single code fence the model wrapped around its whole answer. */
export function stripCodeFence(text: string): string {
  const trimmed = text.trim();
  const m = /^```[^\n]*\n([\s\S]*?)\n?```$/.exec(trimmed);
  if (!m) return text;
  const inner = m[1] ?? "";
  // Only strip when the fence wraps the entire answer (no other fences inside).
  return inner.includes("```") ? text : inner;
}
