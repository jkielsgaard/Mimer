import { ChevronDown, ChevronRight, Plus, Sparkles } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { MoveButtons, moveKey } from "@/components/MoveButtons";
import { PromptDialog } from "@/components/PromptDialog";
import { ViewHeader } from "@/components/ViewHeader";
import { Button } from "@/components/ui/button";
import { epicGroups, noteName, shortDate, type EpicGroup } from "@/lib/taskLogic";
import { cn } from "@/lib/utils";
import { useAiBlocked } from "@/lib/useAiBlocked";
import { INBOX_PATH, useTaskStore } from "@/stores/taskStore";
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

/** "+ Add a task" at the bottom of an open epic task: Enter adds it to that epic's note. */
function AddTask({ group }: { group: EpicGroup }) {
  const [text, setText] = useState("");
  return (
    <form
      className="px-1 pb-1 pl-8"
      onSubmit={(e) => {
        e.preventDefault();
        const value = text.trim();
        if (value === "") return;
        setText("");
        void useTaskStore.getState().add(value, undefined, undefined, group.path);
      }}
    >
      <input
        aria-label={`Add a task to ${group.title}`}
        placeholder={`+ Add a task to ${group.title}`}
        value={text}
        onChange={(e) => {
          setText(e.target.value);
        }}
        className="w-full rounded-md border border-dashed border-input bg-transparent px-2.5 py-1.5 text-sm placeholder:text-muted-foreground focus-visible:border-solid focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      />
    </form>
  );
}

/** Whether an epic is folded in the list: open ones are open, done ones folded, unless chosen. */
export function isFolded(g: EpicGroup, folded: Record<string, boolean>): boolean {
  const chosen = folded[g.path];
  return chosen ?? g.allDone;
}

/**
 * The task list: one outline of epic tasks, each a box you can fold, with its tasks, and their
 * steps, which can be unfolded too. Done epics are folded together at the bottom.
 */
export function TasksView() {
  const tasks = useTaskStore((s) => s.tasks);
  const epics = useTaskStore((s) => s.epics);
  const epicOrder = useTaskStore((s) => s.epicOrder);
  const loaded = useTaskStore((s) => s.loaded);
  const folded = useTaskStore((s) => s.folded);
  const activePath = useVaultStore((s) => s.activePath);
  const aiOff = useAiBlocked();
  const [naming, setNaming] = useState(false);
  const [showDone, setShowDone] = useState(false);

  useEffect(() => {
    void useTaskStore.getState().load();
  }, []);

  const groups = useMemo(() => epicGroups(tasks, epics, epicOrder), [tasks, epics, epicOrder]);
  const open = groups.filter((g) => !g.allDone);
  const done = groups.filter((g) => g.allDone);
  // The Inbox stays at the top; the other open epics are moved in the order shown.
  const movable = open.map((g) => g.path).filter((p) => p !== INBOX_PATH);

  const box = (g: EpicGroup) => {
    const shut = isFolded(g, folded);
    const at = movable.indexOf(g.path);
    const can = { up: at > 0, down: at !== -1 && at < movable.length - 1 };
    const moveUp = () => useTaskStore.getState().moveEpic(g.path, true, movable);
    const moveDown = () => useTaskStore.getState().moveEpic(g.path, false, movable);
    return (
      <section
        key={g.path}
        aria-label={g.title}
        className={cn("rounded-lg border bg-card p-1.5", g.allDone && "bg-sidebar")}
      >
        <div
          className="group flex items-center gap-3 px-2 py-1.5"
          onKeyDown={(e) => {
            if (at !== -1) moveKey(e, g.title, can, moveUp, moveDown);
          }}
        >
          <button
            type="button"
            aria-expanded={!shut}
            aria-label={`${shut ? "Unfold" : "Fold"} ${g.title}`}
            className="rounded p-0.5 hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring"
            onClick={() => {
              useTaskStore.getState().setFolded([g.path], !shut);
            }}
          >
            {shut ? <ChevronRight className="size-4" /> : <ChevronDown className="size-4" />}
          </button>
          <button
            type="button"
            title={`Open ${g.title}`}
            className={cn(
              "min-w-0 flex-1 truncate text-left text-sm font-semibold hover:underline focus-visible:ring-2 focus-visible:ring-ring",
              g.allDone && "text-muted-foreground",
            )}
            onClick={() => {
              useTaskStore.getState().openEpic(g.path);
            }}
          >
            {g.title}
            {g.made !== null && (
              <span className="font-normal text-muted-foreground">
                {" "}
                · made {shortDate(g.made).replace(/^\S+ /, "")}
              </span>
            )}
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
          {at !== -1 && (
            <MoveButtons
              label={g.title}
              canUp={can.up}
              canDown={can.down}
              onUp={moveUp}
              onDown={moveDown}
            />
          )}
        </div>
        {!shut && (
          <>
            <ul>
              {g.tasks.map((t, i, all) => (
                <TaskRow
                  key={`${t.path}:${String(t.line)}`}
                  task={t}
                  showNote={false}
                  canMove={{ up: i > 0, down: i < all.length - 1 }}
                />
              ))}
              {g.tasks.length === 0 && (
                <li className="px-8 py-1 text-xs text-muted-foreground">No tasks yet.</li>
              )}
            </ul>
            {!g.allDone && <AddTask group={g} />}
          </>
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
          variant="ghost"
          disabled={open.length === 0}
          onClick={() => {
            useTaskStore.getState().setFolded(
              open.map((g) => g.path),
              true,
            );
          }}
        >
          Fold all
        </Button>
        <Button
          size="sm"
          variant="ghost"
          disabled={open.length === 0}
          onClick={() => {
            useTaskStore.getState().setFolded(
              open.map((g) => g.path),
              false,
            );
          }}
        >
          Unfold all
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
            <button
              type="button"
              aria-expanded={showDone}
              className="flex items-center gap-1 px-1 pt-2 section-label hover:text-foreground"
              onClick={() => {
                setShowDone(!showDone);
              }}
            >
              {showDone ? <ChevronDown className="size-3" /> : <ChevronRight className="size-3" />}
              Done · {done.length}
            </button>
            {showDone && done.map(box)}
          </>
        )}
        {loaded && groups.length > 0 && (
          <p className="px-1 text-xs text-muted-foreground">
            Fold an epic task to see only its name and how far it is. When every task in it is done,
            it moves to Done.
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
