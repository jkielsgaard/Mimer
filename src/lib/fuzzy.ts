/** Scores a fuzzy match of `query` against `text`; `null` means no match. Lower is better. */
export function fuzzyScore(query: string, text: string): number | null {
  const q = query.toLowerCase();
  const t = text.toLowerCase();
  if (q === "") return 0;
  const idx = t.indexOf(q);
  if (idx >= 0) return idx === 0 ? 0 : idx + 1;
  let qi = 0;
  let gaps = 0;
  let last = -1;
  for (let i = 0; i < t.length && qi < q.length; i++) {
    if (t[i] === q[qi]) {
      if (last >= 0 && i - last > 1) gaps++;
      last = i;
      qi++;
    }
  }
  return qi === q.length ? 100 + gaps : null;
}

/** Filters and sorts items by fuzzy score on a key function. */
export function fuzzyFilter<T>(
  items: readonly T[],
  query: string,
  key: (t: T) => string,
  limit = 50,
): T[] {
  const scored: [number, T][] = [];
  for (const item of items) {
    const s = fuzzyScore(query, key(item));
    if (s !== null) scored.push([s, item]);
  }
  scored.sort((a, b) => a[0] - b[0]);
  return scored.slice(0, limit).map(([, item]) => item);
}
