import { ChevronDown } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { FoundryModel } from "@/bindings/FoundryModel";
import { PlainButton } from "@/components/ui/plain-button";
import { formatBytes } from "@/lib/bytes";
import { cn } from "@/lib/utils";
import { goodFor, readsLabel, type ModelFilter } from "./foundryModels";
import { ModelFilters } from "./ModelFilters";

const MB = 1_000_000;

function factsOf(m: FoundryModel, downloaded: boolean): string {
  return [
    m.sizeMb > 0 ? formatBytes(m.sizeMb * MB) : "size unknown",
    `runs on ${m.device || "?"}`,
    readsLabel(m.contextTokens),
    m.license,
    downloaded ? "downloaded" : null,
  ]
    .filter((x) => x !== null && x !== "")
    .join(" · ");
}

/**
 * The Foundry Local models as a drop-down: the chosen model is shown in a box, and pressing it
 * opens a panel with a search box, the filters and the list (which scrolls inside the panel). So
 * the long list is only there while a model is being chosen, and every model can still be found.
 */
export function ModelPicker({
  models,
  total,
  chosen,
  selected,
  installed,
  filter,
  onFilter,
  onPick,
  disabled,
}: {
  /** The models that fit the filter. */
  models: readonly FoundryModel[];
  /** How many models there are before the filter. */
  total: number;
  /** The alias of the chosen model, or "". */
  chosen: string;
  /** The chosen model, from the whole list (it may not fit the filter). */
  selected: FoundryModel | undefined;
  installed: ReadonlySet<string>;
  filter: ModelFilter;
  onFilter: (next: ModelFilter) => void;
  onPick: (alias: string) => void;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const current = selected;

  // Esc closes the panel, and so does a click anywhere else.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === "Escape") {
        e.stopPropagation();
        setOpen(false);
      }
    };
    const onDown = (e: MouseEvent): void => {
      if (box.current && !box.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("keydown", onKey, true);
    document.addEventListener("mousedown", onDown);
    return () => {
      document.removeEventListener("keydown", onKey, true);
      document.removeEventListener("mousedown", onDown);
    };
  }, [open]);

  return (
    <div ref={box} className="flex flex-col gap-2">
      <PlainButton
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label="Model"
        disabled={disabled}
        className="flex w-full items-center gap-2 rounded-md border bg-background px-3 py-2 text-left text-sm hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60"
        onClick={() => {
          setOpen(!open);
        }}
      >
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="truncate font-semibold">
            {current ? current.name : "Choose a model"}
          </span>
          {current && (
            <span className="truncate text-xs text-muted-foreground">
              {factsOf(current, installed.has(current.alias))}
            </span>
          )}
        </span>
        {current && (
          <span
            className={cn(
              "shrink-0 rounded-full px-2 text-[11px] font-semibold",
              current.tools ? "bg-success/15 text-success" : "border border-warning text-warning",
            )}
          >
            {current.tools ? "Can use tools" : "No tools"}
          </span>
        )}
        <ChevronDown className="size-4 shrink-0 text-muted-foreground" aria-hidden />
      </PlainButton>
      {open && (
        <div className="flex flex-col gap-2 rounded-md border bg-card p-2 shadow-sm">
          <ModelFilters filter={filter} onChange={onFilter} />
          <p className="text-xs text-muted-foreground" role="status">
            {models.length} of {total} models
          </p>
          <ul
            role="listbox"
            aria-label="Foundry Local models"
            className="flex max-h-72 flex-col gap-1 overflow-auto"
          >
            {models.map((m) => (
              <li
                key={m.alias}
                role="option"
                aria-selected={m.alias === chosen}
                className={cn(
                  "cursor-pointer rounded-md border px-3 py-2 text-left text-sm hover:bg-muted",
                  m.alias === chosen && "border-primary bg-accent",
                )}
                onClick={() => {
                  onPick(m.alias);
                  setOpen(false);
                }}
              >
                <span className="flex items-center gap-2">
                  <span className="font-semibold">{m.name}</span>
                  {m.publisher && (
                    <span className="text-xs text-muted-foreground">{m.publisher}</span>
                  )}
                  <span className="grow" />
                  <span
                    className={cn(
                      "rounded-full px-2 text-[11px] font-semibold",
                      m.tools ? "bg-success/15 text-success" : "border border-warning text-warning",
                    )}
                  >
                    {m.tools ? "Can use tools" : "No tools"}
                  </span>
                </span>
                <span className="block text-xs text-foreground/80">{goodFor(m).text}</span>
                <span className="block text-xs tabular-nums text-muted-foreground">
                  {factsOf(m, installed.has(m.alias))}
                </span>
              </li>
            ))}
            {models.length === 0 && (
              <li
                className="px-2 py-1 text-xs text-muted-foreground"
                data-testid="foundry-no-match"
              >
                No model matches. Change the filters, or check the name on Microsoft's list.
              </li>
            )}
          </ul>
        </div>
      )}
    </div>
  );
}
