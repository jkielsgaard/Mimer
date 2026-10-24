import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import type { Device, GoodFor, ModelFilter, Size, Sort } from "./foundryModels";

const GOOD: { id: "all" | GoodFor; label: string }[] = [
  { id: "all", label: "All" },
  { id: "writing", label: "Writing" },
  { id: "reasoning", label: "Reasoning" },
  { id: "code", label: "Code" },
];

const select = "rounded border bg-background px-1 py-0.5 text-xs";

/** Search, "good for", tools, downloaded, hardware, size and order for the Foundry model list. */
export function ModelFilters({
  filter,
  onChange,
}: {
  filter: ModelFilter;
  onChange: (next: ModelFilter) => void;
}) {
  const set = (patch: Partial<ModelFilter>) => {
    onChange({ ...filter, ...patch });
  };
  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        <Input
          aria-label="Find a model"
          placeholder="Find a model (name, maker, phi, qwen…)"
          className="h-8 min-w-56 flex-1 text-sm"
          value={filter.text}
          onChange={(e) => {
            set({ text: e.target.value });
          }}
        />
        <div role="group" aria-label="Good for" className="flex gap-1">
          {GOOD.map((g) => (
            <button
              key={g.id}
              type="button"
              aria-pressed={filter.good === g.id}
              className={cn(
                "rounded-full border px-2.5 py-0.5 text-xs hover:bg-muted",
                filter.good === g.id && "border-primary bg-accent font-semibold",
              )}
              onClick={() => {
                set({ good: g.id });
              }}
            >
              {g.label}
            </button>
          ))}
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-foreground/80">
        <label className="flex items-center gap-1.5">
          <input
            type="checkbox"
            checked={filter.tools}
            onChange={(e) => {
              set({ tools: e.target.checked });
            }}
          />
          Can use tools
        </label>
        <label className="flex items-center gap-1.5">
          <input
            type="checkbox"
            checked={filter.downloaded}
            onChange={(e) => {
              set({ downloaded: e.target.checked });
            }}
          />
          Downloaded
        </label>
        <label className="flex items-center gap-1.5">
          Runs on
          <select
            className={select}
            value={filter.device}
            onChange={(e) => {
              set({ device: e.target.value as Device });
            }}
          >
            <option value="any">Any</option>
            <option value="NPU">NPU</option>
            <option value="GPU">GPU</option>
            <option value="CPU">CPU</option>
          </select>
        </label>
        <label className="flex items-center gap-1.5">
          Size
          <select
            className={select}
            value={filter.size}
            onChange={(e) => {
              set({ size: e.target.value as Size });
            }}
          >
            <option value="any">Any</option>
            <option value="small">Small (under 2 GB)</option>
            <option value="medium">Medium (2–6 GB)</option>
            <option value="large">Large</option>
          </select>
        </label>
        <span className="grow" />
        <label className="flex items-center gap-1.5">
          Sort
          <select
            className={select}
            value={filter.sort}
            onChange={(e) => {
              set({ sort: e.target.value as Sort });
            }}
          >
            <option value="recommended">Recommended</option>
            <option value="smallest">Smallest</option>
            <option value="name">Name</option>
          </select>
        </label>
      </div>
    </div>
  );
}
