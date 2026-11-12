import { ChevronRight } from "lucide-react";
import { PlainButton } from "@/components/ui/plain-button";
import { epicSummary, type EpicGroup } from "@/lib/taskLogic";
import { cn } from "@/lib/utils";
import { useTaskStore } from "@/stores/taskStore";
import { EpicProgress } from "./TasksView";

/**
 * A folded epic on the task list, as a card: its name, how far it has come, how many tasks are
 * being worked on or waited for, and the next task. Open it (the arrow or the name) to see its
 * tasks.
 */
export function EpicCard({ group }: { group: EpicGroup }) {
  const sum = epicSummary(group);
  return (
    <section
      aria-label={group.title}
      className="flex flex-col gap-2 rounded-lg border bg-card p-3 text-sm"
    >
      <div className="flex items-center gap-2">
        <PlainButton
          type="button"
          aria-expanded={false}
          aria-label={`Unfold ${group.title}`}
          className="rounded p-0.5 hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring"
          onClick={() => {
            useTaskStore.getState().setFolded([group.path], false);
          }}
        >
          <ChevronRight className="size-4" />
        </PlainButton>
        <PlainButton
          type="button"
          title={`Open ${group.title}`}
          className="min-w-0 flex-1 truncate text-left font-semibold hover:underline focus-visible:ring-2 focus-visible:ring-ring"
          onClick={() => {
            useTaskStore.getState().openEpic(group.path);
          }}
        >
          {group.title}
        </PlainButton>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {sum.doing > 0 && (
          <span className="shrink-0 rounded-full bg-accent px-2 py-0.5 text-xs text-accent-foreground">
            Doing {sum.doing}
          </span>
        )}
        {sum.waiting > 0 && (
          <span className="shrink-0 rounded-full bg-warning/25 px-2 py-0.5 text-xs">
            Waiting {sum.waiting}
          </span>
        )}
        <EpicProgress group={group} />
      </div>
      {sum.next !== null && (
        <div>
          <span className="section-label">Next</span>
          <div className="truncate">{sum.next.title}</div>
        </div>
      )}
      {sum.waitingOn.length > 0 && (
        <div className={cn(sum.next !== null && "-mt-1")}>
          <span className="section-label">Waiting for</span>
          {sum.waitingOn.slice(0, 2).map((w) => (
            <div key={w} className="truncate">
              {w}
            </div>
          ))}
          {sum.waitingOn.length > 2 && (
            <div className="text-xs text-muted-foreground">and {sum.waitingOn.length - 2} more</div>
          )}
        </div>
      )}
    </section>
  );
}
