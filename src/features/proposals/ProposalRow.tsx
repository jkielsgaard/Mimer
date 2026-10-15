import { ChevronDown, ChevronRight, TriangleAlert } from "lucide-react";
import { useState } from "react";
import type { ProposalAction } from "@/bindings/ProposalAction";
import type { ProposalView } from "@/bindings/ProposalView";
import { DiffView } from "@/components/DiffView";
import { cn } from "@/lib/utils";
import { useProposalStore } from "@/stores/proposalStore";

/** Label and colour of the action badge. A switch keeps it exhaustive over `ProposalAction`. */
function badgeFor(action: ProposalAction): { label: string; cls: string } {
  switch (action) {
    case "edit":
      return { label: "Edit", cls: "bg-primary/15 text-primary" };
    case "create":
      return { label: "Create", cls: "bg-success/20 text-success" };
    case "move":
      return { label: "Move", cls: "bg-warning/25 text-foreground" };
    case "delete":
      return { label: "Delete", cls: "bg-destructive/15 text-destructive" };
  }
}

export function ProposalRow({ item }: { item: ProposalView }) {
  const { accepted, confirmed, toggle, confirm } = useProposalStore();
  const [expanded, setExpanded] = useState(false);
  const p = item.proposal;
  const on = accepted.has(p.id);
  const badge = badgeFor(p.action);
  const original = p.original ?? "";
  const modified = p.action === "delete" ? "" : (p.content ?? "");
  return (
    <li className={cn("rounded-md border", !on && "opacity-60")}>
      <div className="flex items-center gap-2 px-3 py-2">
        <button
          type="button"
          className="text-muted-foreground"
          aria-label={expanded ? "Hide changes" : "Show changes"}
          aria-expanded={expanded}
          onClick={() => {
            setExpanded((e) => !e);
          }}
        >
          {expanded ? <ChevronDown className="size-4" /> : <ChevronRight className="size-4" />}
        </button>
        <span className={cn("rounded px-1.5 py-0.5 text-[11px] font-semibold", badge.cls)}>
          {badge.label}
        </span>
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-medium">
            {p.action === "move" ? `${p.path} → ${p.newPath ?? ""}` : p.path}
          </div>
          {p.reason !== "" && (
            <div className="truncate text-xs text-muted-foreground">{p.reason}</div>
          )}
        </div>
        <div
          role="group"
          aria-label={`Decision for ${p.path}`}
          className="flex overflow-hidden rounded-md border text-xs"
        >
          <button
            type="button"
            aria-pressed={on}
            className={cn("px-2 py-1", on ? "bg-success/25 font-semibold" : "hover:bg-muted")}
            onClick={() => {
              if (!on) toggle(p.id);
            }}
          >
            Accept
          </button>
          <button
            type="button"
            aria-pressed={!on}
            className={cn(
              "border-l px-2 py-1",
              !on ? "bg-destructive/20 font-semibold" : "hover:bg-muted",
            )}
            onClick={() => {
              if (on) toggle(p.id);
            }}
          >
            Reject
          </button>
        </div>
      </div>
      {item.changedSinceProposal && (
        <div className="flex items-center gap-2 border-t bg-warning/15 px-3 py-1.5 text-xs">
          <TriangleAlert className="size-3.5" />
          <span className="flex-1">Changed since proposal. Re-confirm to apply this file.</span>
          <label className="flex items-center gap-1">
            <input
              type="checkbox"
              checked={confirmed.has(p.id)}
              onChange={() => {
                confirm(p.id);
              }}
            />
            I have checked it
          </label>
        </div>
      )}
      {expanded && (
        <div className="max-h-72 overflow-auto border-t">
          {p.action === "move" ? (
            <p className="p-3 text-sm">
              Move <code>{p.path}</code> to <code>{p.newPath}</code>. Links to it will be updated.
            </p>
          ) : (
            <DiffView original={original} modified={modified} />
          )}
        </div>
      )}
    </li>
  );
}
