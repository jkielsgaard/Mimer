import { ClipboardCheck } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api";
import { useProposalStore } from "@/stores/proposalStore";

/** "Review N proposed changes" card shown in the chat when a turn produced proposals. */
export function ProposalCard({ setId }: { setId: string }) {
  const [count, setCount] = useState<number | null>(null);
  const open = useProposalStore((s) => s.open);

  useEffect(() => {
    api
      .getProposals(setId)
      .then((v) => {
        setCount(v.proposals.length);
      })
      .catch(() => {
        setCount(0);
      });
  }, [setId]);

  if (count === 0) {
    return <p className="text-xs text-muted-foreground">These proposals were already handled.</p>;
  }
  return (
    <div className="flex items-center gap-3 rounded-md border bg-card px-3 py-2">
      <ClipboardCheck className="size-4 text-primary" />
      <span className="text-sm">
        {count === null ? "Proposed changes" : `${count} proposed change${count === 1 ? "" : "s"}`}
      </span>
      <Button
        size="sm"
        onClick={() => {
          void open(setId);
        }}
      >
        Review {count ?? ""} proposed {count === 1 ? "change" : "changes"}
      </Button>
    </div>
  );
}
