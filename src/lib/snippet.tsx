import type { ReactNode } from "react";

/** Renders an FTS snippet, turning `<mark>…</mark>` into highlighted spans (no raw HTML). */
export function renderSnippet(snippet: string): ReactNode[] {
  const out: ReactNode[] = [];
  const re = /<mark>([\s\S]*?)<\/mark>/g;
  let last = 0;
  let i = 0;
  for (const m of snippet.matchAll(re)) {
    const idx = m.index;
    if (idx > last) out.push(snippet.slice(last, idx));
    out.push(
      <mark key={i++} className="rounded bg-warning/40 px-0.5 text-foreground">
        {m[1]}
      </mark>,
    );
    last = idx + m[0].length;
  }
  if (last < snippet.length) out.push(snippet.slice(last));
  return out;
}
