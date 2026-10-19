/** The text of a menu item: what it does, and under it a few words more. Used in every menu. */
export function MenuText({ label, hint }: { label: string; hint?: string }) {
  return (
    <span className="flex min-w-0 flex-col">
      <span className="truncate">{label}</span>
      {hint !== undefined && hint !== "" && (
        <span className="truncate text-[11px] text-muted-foreground">{hint}</span>
      )}
    </span>
  );
}
