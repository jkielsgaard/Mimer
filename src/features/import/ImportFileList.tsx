/** A short, collapsible list of files with a reason or a new name (skipped or renamed files). */
export function ImportFileList({
  title,
  rows,
}: {
  title: string;
  rows: readonly { name: string; note: string }[];
}) {
  if (rows.length === 0) return null;
  const shown = rows.slice(0, 50);
  return (
    <details className="rounded border px-3 py-2 text-xs">
      <summary className="cursor-pointer font-medium">
        {title} ({rows.length})
      </summary>
      <ul className="mt-2 flex max-h-40 flex-col gap-1 overflow-auto">
        {shown.map((r, i) => (
          <li key={`${r.name}-${String(i)}`} className="flex gap-2">
            <span className="min-w-0 flex-1 truncate">{r.name}</span>
            <span className="shrink-0 text-muted-foreground">{r.note}</span>
          </li>
        ))}
        {rows.length > shown.length && (
          <li className="text-muted-foreground">…and {rows.length - shown.length} more</li>
        )}
      </ul>
    </details>
  );
}
