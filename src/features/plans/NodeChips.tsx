import { PlainButton } from "@/components/ui/plain-button";
import { cn } from "@/lib/utils";
import { useTaskStore } from "@/stores/taskStore";
import { useVaultStore } from "@/stores/vaultStore";
import type { NodeInfo } from "./nodeInfo";

const CHIP =
  "shrink-0 rounded-full px-2 py-0.5 text-xs focus-visible:ring-2 focus-visible:ring-ring";

/** What an idea is tied to: its epic (with progress), its notes and its task. Each opens that. */
export function NodeChips({ info }: { info: NodeInfo }) {
  const { epic, notes, task } = info;
  return (
    <>
      {epic && (
        <PlainButton
          type="button"
          title={`Open the epic ${epic.title}`}
          className={cn(CHIP, "bg-accent text-accent-foreground")}
          onClick={() => {
            useTaskStore.getState().openEpic(epic.path);
          }}
        >
          Epic · {epic.done} of {epic.total}
        </PlainButton>
      )}
      {notes.slice(0, 2).map((p) => (
        <PlainButton
          key={p}
          type="button"
          title={`Open the note ${p}`}
          className={cn(CHIP, "max-w-40 truncate bg-muted")}
          onClick={() => {
            void useVaultStore.getState().openNote(p);
          }}
        >
          Note · {p.replace(/^.*\//, "").replace(/\.md$/i, "")}
        </PlainButton>
      ))}
      {task && (
        <PlainButton
          type="button"
          title="Open the task"
          className={cn(
            CHIP,
            task.done
              ? "bg-success/15 text-success"
              : task.status === "waiting"
                ? "bg-warning/25 text-foreground"
                : "bg-muted text-muted-foreground",
          )}
          onClick={() => {
            useTaskStore.getState().open(task);
          }}
        >
          Task{task.done ? " · done" : task.status === "waiting" ? " · waiting" : ""}
        </PlainButton>
      )}
    </>
  );
}
