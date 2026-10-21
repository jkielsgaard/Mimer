import { useEffect, useMemo } from "react";
import { PanelHeader } from "@/components/PanelHeader";
import { Target } from "lucide-react";
import { Button } from "@/components/ui/button";
import { epicGroups, todayIso } from "@/lib/taskLogic";
import { cn } from "@/lib/utils";
import { useTaskStore } from "@/stores/taskStore";
import { useUiStore } from "@/stores/uiStore";

/**
 * The left panel of the Tasks area: the epic tasks, so they are one click away. Done epics are
 * listed last. A click opens the epic in the middle.
 */
export function TasksPanel() {
  const tasks = useTaskStore((s) => s.tasks);
  const epics = useTaskStore((s) => s.epics);
  const epicPath = useTaskStore((s) => s.epicPath);
  const loaded = useTaskStore((s) => s.loaded);
  const centerView = useUiStore((s) => s.centerView);
  const today = todayIso();

  useEffect(() => {
    void useTaskStore.getState().load();
  }, []);

  const groups = useMemo(() => epicGroups(tasks, epics, today), [tasks, epics, today]);
  const open = groups.filter((g) => !g.allDone);
  const done = groups.filter((g) => g.allDone);
  const firstToday = tasks.find((t) => t.plan === today && !t.done);

  const row = (g: (typeof groups)[number]) => (
    <li key={g.path}>
      <button
        type="button"
        aria-current={centerView === "epic" && epicPath === g.path}
        className={cn(
          "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring",
          centerView === "epic" && epicPath === g.path && "bg-accent text-accent-foreground",
          g.allDone && "text-muted-foreground",
        )}
        onClick={() => {
          useTaskStore.getState().openEpic(g.path);
        }}
      >
        <span className="flex-1 truncate">{g.title}</span>
        <span className="text-xs text-muted-foreground tabular-nums">
          {g.done}/{g.total}
        </span>
      </button>
    </li>
  );

  return (
    <div className="flex h-full min-h-0 flex-col">
      <PanelHeader title="Tasks">
        <Button
          size="sm"
          variant="outline"
          disabled={firstToday === undefined}
          title={
            firstToday === undefined ? "Put a task on today's list first" : "Work on one thing"
          }
          onClick={() => {
            if (firstToday) {
              useTaskStore
                .getState()
                .select({ path: firstToday.path, line: firstToday.line, title: firstToday.title });
            }
            useUiStore.getState().setFocusOpen(true);
          }}
        >
          <Target /> Focus
        </Button>
      </PanelHeader>
      <div className="min-h-0 flex-1 overflow-auto px-2 py-2">
        <h3 className="section-label px-2 pb-1">Epic tasks</h3>
        {loaded && open.length === 0 && (
          <p className="px-2 text-xs text-muted-foreground">
            None yet. Press <b>New epic task</b> in the middle.
          </p>
        )}
        <ul>{open.map(row)}</ul>
        {done.length > 0 && (
          <>
            <h3 className="section-label px-2 pb-1 pt-3">Done · {done.length}</h3>
            <ul>{done.map(row)}</ul>
          </>
        )}
        <button
          type="button"
          className="mt-3 w-full rounded-md px-2 py-1.5 text-left text-xs text-muted-foreground hover:bg-muted"
          onClick={() => {
            useUiStore.getState().setCenterView("tasks");
          }}
        >
          Show all tasks
        </button>
      </div>
    </div>
  );
}
