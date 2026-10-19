import { TriangleAlert } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { canApply, useProposalStore } from "@/stores/proposalStore";
import { badgeFor, ProposalDetail } from "./ProposalDetail";
import { countByKind, groupProposals, type KindFilter } from "./proposalGroups";

const KINDS: { id: KindFilter; label: string }[] = [
  { id: "all", label: "All" },
  { id: "move", label: "Moves" },
  { id: "edit", label: "Edits" },
  { id: "create", label: "New" },
  { id: "delete", label: "Deletes" },
];

/** Modal with every proposed change: filter by kind, accept per group or per file, look at one. */
export function ProposalReview() {
  const { view, accepted, confirmed, applying, applySelected, rejectAll, close, setMany } =
    useProposalStore();
  const [filter, setFilter] = useState<KindFilter>("all");
  const [chosen, setChosen] = useState<string | null>(null);
  const items = view?.proposals ?? [];
  const n = items.filter((p) => accepted.has(p.proposal.id)).length;
  const counts = countByKind(items);
  const groups = groupProposals(items, filter);
  const visible = groups.flatMap((g) => g.items);
  const current =
    visible.find((v) => v.proposal.id === chosen) ?? (visible.length > 0 ? visible[0] : undefined);

  // A new review starts from All, with the first change in view.
  const setId = view?.id;
  useEffect(() => {
    setFilter("all");
    setChosen(null);
  }, [setId]);

  return (
    <Dialog
      open={view !== null}
      onOpenChange={(o) => {
        if (!o) close();
      }}
    >
      <DialogContent className="flex h-[640px] max-w-5xl flex-col gap-0 p-0">
        <DialogHeader className="border-b px-5 py-4">
          <DialogTitle className="text-base font-semibold">
            Review {items.length} proposed change{items.length === 1 ? "" : "s"}
          </DialogTitle>
          <DialogDescription className="text-sm text-muted-foreground">
            Nothing is written until you apply. A snapshot is committed first, so every change can
            be undone from the history.
          </DialogDescription>
        </DialogHeader>
        <div
          role="group"
          aria-label="Show"
          className="flex flex-wrap items-center gap-2 border-b bg-sidebar px-5 py-2"
        >
          {KINDS.filter((k) => k.id === "all" || counts[k.id] > 0).map((k) => {
            const count = k.id === "all" ? items.length : counts[k.id];
            return (
              <button
                key={k.id}
                type="button"
                aria-pressed={filter === k.id}
                className={cn(
                  "rounded-full border px-3 py-0.5 text-xs",
                  filter === k.id
                    ? "border-transparent bg-accent text-accent-foreground"
                    : "bg-card",
                )}
                onClick={() => {
                  setFilter(k.id);
                }}
              >
                {k.label} {count}
              </button>
            );
          })}
        </div>
        <div className="flex min-h-0 flex-1">
          <div className="w-80 shrink-0 overflow-auto border-r p-2">
            {groups.map((g) => {
              const ids = g.items.map((v) => v.proposal.id);
              const all = ids.every((id) => accepted.has(id));
              return (
                <section key={g.key} aria-label={g.label} className="mb-2">
                  <div className="flex items-center gap-2 px-2 py-1">
                    <h3 className="min-w-0 flex-1 truncate section-label">
                      {g.label} · {g.items.length}
                    </h3>
                    <button
                      type="button"
                      className="rounded border px-2 py-0.5 text-[11px] hover:bg-muted"
                      onClick={() => {
                        setMany(ids, !all);
                      }}
                    >
                      {all ? "Reject group" : "Accept group"}
                    </button>
                  </div>
                  <ul>
                    {g.items.map((v) => {
                      const p = v.proposal;
                      const on = accepted.has(p.id);
                      return (
                        <li key={p.id}>
                          <button
                            type="button"
                            aria-current={current?.proposal.id === p.id}
                            className={cn(
                              "flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-[13px] hover:bg-muted",
                              current?.proposal.id === p.id && "bg-accent text-accent-foreground",
                              !on && "opacity-60",
                            )}
                            onClick={() => {
                              setChosen(p.id);
                            }}
                          >
                            <span
                              aria-label={on ? "Accepted" : "Rejected"}
                              className={cn(
                                "size-2 shrink-0 rounded-full",
                                on ? "bg-success" : "bg-muted-foreground",
                              )}
                            />
                            <span className="min-w-0 flex-1 truncate">{p.path}</span>
                            {!p.checks.every((c) => c.ok) && (
                              <TriangleAlert
                                className="size-3.5 shrink-0 text-warning"
                                aria-label="Did not pass Mimer's checks"
                              />
                            )}
                            {v.changedSinceProposal && (
                              <TriangleAlert
                                className="size-3.5 shrink-0 text-warning"
                                aria-label="Changed since proposal"
                              />
                            )}
                            <span
                              className={cn(
                                "rounded px-1.5 text-[10px] font-semibold",
                                badgeFor(p.action).cls,
                              )}
                            >
                              {badgeFor(p.action).label}
                            </span>
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                </section>
              );
            })}
          </div>
          {current ? (
            <ProposalDetail key={current.proposal.id} item={current} />
          ) : (
            <p className="p-4 text-sm text-muted-foreground">Nothing to show.</p>
          )}
        </div>
        <DialogFooter className="border-t px-5 py-3">
          <Button
            variant="ghost"
            disabled={applying}
            onClick={() => {
              void rejectAll();
            }}
          >
            Reject all
          </Button>
          <Button
            disabled={applying || !view || !canApply(view, accepted, confirmed)}
            onClick={() => {
              void applySelected();
            }}
          >
            {applying ? "Applying…" : `Apply selected (${String(n)})`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
