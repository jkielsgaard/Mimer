import { cn } from "@/lib/utils";

export function Tabs<T extends string>({
  tabs,
  value,
  onChange,
  label,
  busy,
}: {
  tabs: { id: T; label: string }[];
  value: T;
  onChange: (t: T) => void;
  label: string;
  /** Tabs that are busy show a dot while they are not the selected one. */
  busy?: T | readonly T[];
}) {
  const busyIds: readonly T[] = busy === undefined ? [] : typeof busy === "string" ? [busy] : busy;
  const isBusy = (id: T): boolean => busyIds.includes(id);
  return (
    <div role="tablist" aria-label={label} className="flex shrink-0 border-b">
      {tabs.map((t) => (
        <button
          key={t.id}
          type="button"
          role="tab"
          aria-selected={value === t.id}
          className={cn(
            "flex-1 border-b-2 px-2 py-1.5 text-xs font-medium",
            value === t.id
              ? "border-primary text-foreground"
              : "border-transparent text-muted-foreground hover:text-foreground",
          )}
          onClick={() => {
            onChange(t.id);
          }}
        >
          {t.label}
          {isBusy(t.id) && value !== t.id && (
            <span
              aria-label="Working"
              className="ml-1 inline-block size-1.5 animate-pulse rounded-full bg-primary motion-reduce:animate-none"
            />
          )}
        </button>
      ))}
    </div>
  );
}
