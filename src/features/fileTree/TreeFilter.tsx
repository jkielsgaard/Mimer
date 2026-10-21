import { Search, X } from "lucide-react";
import { useTreeStore } from "@/stores/treeStore";

/** Narrows the tree to the notes and folders whose name contains the typed text. */
export function TreeFilter() {
  const filter = useTreeStore((s) => s.filter);
  const setFilter = useTreeStore((s) => s.setFilter);
  return (
    <div className="relative border-b px-2 py-1.5">
      <Search
        className="pointer-events-none absolute left-4 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground"
        aria-hidden
      />
      <input
        data-no-ai
        type="text"
        aria-label="Filter the file tree"
        placeholder="Filter notes and folders…"
        value={filter}
        className="h-7 w-full rounded border bg-background pl-7 pr-7 text-xs outline-none focus-visible:ring-1 focus-visible:ring-ring"
        onChange={(e) => {
          setFilter(e.target.value);
        }}
        onKeyDown={(e) => {
          if (e.key === "Escape") setFilter("");
        }}
      />
      {filter !== "" && (
        <button
          type="button"
          aria-label="Clear the filter"
          className="absolute right-3.5 top-1/2 -translate-y-1/2 rounded p-0.5 text-muted-foreground hover:text-foreground"
          onClick={() => {
            setFilter("");
          }}
        >
          <X className="size-3.5" />
        </button>
      )}
    </div>
  );
}
