import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

import { canApply, useProposalStore } from "@/stores/proposalStore";
import { ProposalRow } from "./ProposalRow";

/** Modal that lists every proposed file change with Accept/Reject per file. */
export function ProposalReview() {
  const { view, accepted, confirmed, applying, applySelected, rejectAll, close } =
    useProposalStore();
  const n = view?.proposals.filter((p) => accepted.has(p.proposal.id)).length ?? 0;
  return (
    <Dialog
      open={view !== null}
      onOpenChange={(o) => {
        if (!o) close();
      }}
    >
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle className="text-base font-semibold">Review proposed changes</DialogTitle>
          <DialogDescription className="text-sm text-muted-foreground">
            Nothing is written until you apply. A snapshot is committed first, so every change can
            be undone from the history.
          </DialogDescription>
        </DialogHeader>
        <ul className="flex min-h-0 flex-col gap-2 overflow-auto">
          {view?.proposals.map((p) => (
            <ProposalRow key={p.proposal.id} item={p} />
          ))}
        </ul>
        <DialogFooter>
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
            {applying ? "Applying…" : `Apply selected (${n})`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
