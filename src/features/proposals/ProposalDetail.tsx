import { TriangleAlert } from "lucide-react";
import { ChecksList } from "./ChecksList";
import { useEffect, useState } from "react";
import type { ProposalAction } from "@/bindings/ProposalAction";
import type { ProposalView } from "@/bindings/ProposalView";
import { DiffView } from "@/components/DiffView";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";
import { useProposalStore } from "@/stores/proposalStore";
import { firstLines } from "./proposalGroups";

/** Label and colour of the action badge. A switch keeps it exhaustive over `ProposalAction`. */
export function badgeFor(action: ProposalAction): { label: string; cls: string } {
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

/** The first lines of the note a move or delete is about, so it can be judged without opening it. */
function NotePreview({ path }: { path: string }) {
  const [text, setText] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    setText(null);
    api
      .readNote(path)
      .then((n) => {
        if (alive) setText(firstLines(n.content));
      })
      .catch(() => {
        if (alive) setText("");
      });
    return () => {
      alive = false;
    };
  }, [path]);
  return (
    <section aria-label="Start of the note" className="rounded-md border bg-card p-3">
      <h4 className="mb-1 section-label">Start of the note</h4>
      <pre className="whitespace-pre-wrap break-words font-sans text-sm text-muted-foreground">
        {text === null ? "Loading…" : text === "" ? "The note is empty." : text}
      </pre>
    </section>
  );
}

/** The chosen proposal: what happens, why, the decision, and a diff or a preview. */
export function ProposalDetail({ item }: { item: ProposalView }) {
  const { accepted, confirmed, toggle, confirm } = useProposalStore();
  const p = item.proposal;
  const on = accepted.has(p.id);
  const badge = badgeFor(p.action);
  return (
    <div className="flex min-w-0 flex-1 flex-col gap-3 overflow-auto p-4">
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className={cn("rounded px-1.5 py-0.5 text-[11px] font-semibold", badge.cls)}>
              {badge.label}
            </span>
            <span className="truncate text-sm font-semibold">{p.path}</span>
          </div>
          {p.action === "move" && (
            <div className="mt-0.5 text-xs text-muted-foreground">
              moves to <span className="font-medium text-foreground">{p.newPath}</span>. Links to it
              will be updated.
            </div>
          )}
        </div>
        <div
          role="group"
          aria-label={`Decision for ${p.path}`}
          className="flex shrink-0 overflow-hidden rounded-md border text-xs"
        >
          <button
            type="button"
            aria-pressed={on}
            className={cn("px-3 py-1.5", on ? "bg-success/25 font-semibold" : "hover:bg-muted")}
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
              "border-l px-3 py-1.5",
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
      {p.reason !== "" && (
        <section className="rounded-md border bg-muted/50 p-3" aria-label="Why">
          <h4 className="mb-0.5 section-label">Why</h4>
          <p className="text-sm">{p.reason}</p>
        </section>
      )}
      {p.checks.length > 0 && <ChecksList checks={p.checks} />}
      {item.changedSinceProposal && (
        <div className="flex items-center gap-2 rounded-md bg-warning/15 px-3 py-2 text-xs">
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
      {p.action === "move" ? (
        <NotePreview path={p.path} />
      ) : (
        <div className="min-h-0 overflow-auto rounded-md border">
          <DiffView
            original={p.original ?? ""}
            modified={p.action === "delete" ? "" : (p.content ?? "")}
          />
        </div>
      )}
    </div>
  );
}
