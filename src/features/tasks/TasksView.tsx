import { ChevronDown, ChevronRight, Plus, Sparkles } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { PromptDialog } from "@/components/PromptDialog";
import { ViewHeader } from "@/components/ViewHeader";
import { Button } from "@/components/ui/button";
import { epicGroups, noteName, todayIso, type EpicGroup } from "@/lib/taskLogic";
import { cn } from "@/lib/utils";
import { useAiBlocked } from "@/lib/useAiBlocked";
import { useTaskStore } from "@/stores/taskStore";
import { useUiStore } from "@/stores/uiStore";
import { useVaultStore } from "@/stores/vaultStore";
import { TaskRow } from "./TaskRow";

/** How far an epic has come: a thin bar and "2 of 4". */
export function EpicProgress({ group }: { group: EpicGroup }) {
  const pct = group.total === 0 ? 0 : (group.done / group.total) * 100;
  return (
    <>
      <span
        role="progressbar"
        aria-label={`${group.title} progress`}
        aria-valuemin={0}
        aria-valuemax={group.total}
        aria-valuenow={group.done}
        className="hidden h-1.5 w-24 overflow-hidden rounded-full bg-muted sm:block"
      >
        <span
          className={cn("block h-full", group.allDone ? "bg-success" : "bg-primary")}
          style={{ width: `${String(pct)}%` }}
        />
      </span>
      <span className="text-xs font-semibold tabular-nums">
        {group.done} of {group.total}
      </span>
    </>
  );
}

/** The task list: every epic task (a note with tasks) as a box you can fold. */
export function TasksView() {
  const tasks = useTaskStore((s) => s.tasks);
  const epics = useTaskStore((s) => s.epics);
  const loaded = useTaskStore((s) => s.loaded);
  const folded = useTaskStore((s) => s.folded);
  const activePath = useVaultStore((s) => s.activePath);
  const aiOff = useAiBlocked();
  const [naming, setNaming] = useState(false);
  const today = todayIso();

  useEffect(() => {
    void useTaskStore.getState().load();
  }, []);

  const groups = useMemo(() => epicGroups(tasks, epics, today), [tasks, epics, today]);
  const open = groups.filter((g) => !g.allDone);
  const done = groups.filter((g) => g.allDone);

  const box = (g: EpicGroup) => {
    const isFolded = g.allDone ? folded[g.path] !== false : folded[g.path] === true;
    return (
      <section
        key={g.path}
        aria-label={g.title}
        className={cn("rounded-lg border bg-card p-1.5", g.allDone && "bg-sidebar")}
      >
        <div className="flex items-center gap-3 px-2 py-1.5">
          <button
            type="button"
            aria-expanded={!isFolded}
            aria-label={`${isFolded ? "Unfold" : "Fold"} ${g.title}`}
            className="rounded p-0.5 hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring"
            onClick={() => {
              useTaskStore.getState().toggleFold(g.path);
            }}
          >
            {isFolded ? <ChevronRight className="size-4" /> : <ChevronDown className="size-4" />}
          </button>
          <button
            type="button"
            className={cn(
              "min-w-0 flex-1 truncate text-left text-sm font-semibold hover:underline focus-visible:ring-2 focus-visible:ring-ring",
              g.allDone && "text-muted-foreground",
            )}
            onClick={() => {
              useTaskStore.getState().openEpic(g.path);
            }}
          >
            {g.title}
          </button>
          {g.source !== null && (
            <span className="hidden text-xs text-muted-foreground md:inline">
              from {noteName(g.source)}
            </span>
          )}
          {!g.native && (
            <span className="hidden text-xs text-muted-foreground md:inline">in a note</span>
          )}
          <EpicProgress group={g} />
          {g.allDone && <span className="rounded-full border px-2 text-xs text-success">Done</span>}
          <Button
            size="sm"
            variant="ghost"
            onClick={() => {
              useTaskStore.getState().openEpic(g.path);
            }}
          >
            Open
          </Button>
        </div>
        {!isFolded && (
          <ul>
            {g.tasks.map((t) => (
              <TaskRow
                key={`${t.path}:${String(t.line)}`}
                task={t}
                today={today}
                planButtons={false}
                showNote={false}
              />
            ))}
            {g.tasks.length === 0 && (
              <li className="px-4 py-2 text-xs text-muted-foreground">
                No tasks yet. Open the epic to add some.
              </li>
            )}
          </ul>
        )}
      </section>
    );
  };

  return (
    <section aria-label="Tasks" className="flex h-full min-h-0 flex-col bg-background">
      <ViewHeader title="Tasks">
        <Button
          size="sm"
          variant="outline"
          disabled={activePath === null || aiOff !== null}
          title={
            aiOff ??
            (activePath === null
              ? "Open a note first, then the AI can look for tasks in it"
              : `Let the AI look for tasks in “${noteName(activePath)}”`)
          }
          onClick={() => {
            useUiStore.getState().setFindTasksOpen(true);
          }}
        >
          <Sparkles /> Find tasks in a note
        </Button>
        <Button
          size="sm"
          onClick={() => {
            setNaming(true);
          }}
        >
          <Plus /> New epic task
        </Button>
      </ViewHeader>
      <div className="min-h-0 flex-1 space-y-3 overflow-auto px-5 py-4">
        {!loaded && <p className="py-6 text-sm text-muted-foreground">Reading your notes…</p>}
        {loaded && groups.length === 0 && (
          <div className="py-10 text-center text-sm text-muted-foreground">
            <p className="font-medium text-foreground">No epic tasks yet.</p>
            <p>
              An epic task is a note with tasks. Press <b>New epic task</b>, or write{" "}
              <code>- [ ] something</code> in any note. Mimer finds it.
            </p>
          </div>
        )}
        {open.map(box)}
        {done.length > 0 && (
          <>
            <h3 className="section-label px-1 pt-2">Done · {done.length}</h3>
            {done.map(box)}
          </>
        )}
        {loaded && groups.length > 0 && (
          <p className="px-1 text-xs text-muted-foreground">
            Fold an epic to hide its tasks. When every task in it is done, it moves to Done by
            itself.
          </p>
        )}
      </div>
      <PromptDialog
        open={naming}
        title="New epic task"
        label="Name"
        confirmLabel="Make it"
        initialValue=""
        validate={(v) => (v.trim() === "" ? "Enter a name" : null)}
        onCancel={() => {
          setNaming(false);
        }}
        onSubmit={(name) => {
          setNaming(false);
          void useTaskStore.getState().createEpic(name);
        }}
      />
    </section>
  );
}
