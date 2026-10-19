import { Plus, Sparkles, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  durationLabel,
  filterTasks,
  groupTasks,
  isOpen,
  noteName,
  todayIso,
  totalMinutes,
} from "@/lib/taskLogic";
import { cn } from "@/lib/utils";
import { useTaskStore, type GroupBy, type TaskWhen } from "@/stores/taskStore";
import { useUiStore } from "@/stores/uiStore";
import { useVaultStore } from "@/stores/vaultStore";
import { TaskRow } from "./TaskRow";
import { ViewHeader } from "@/components/ViewHeader";
import { useAiBlocked } from "@/lib/useAiBlocked";

const BANNER_KEY = "mimer.tasksBannerDay";

function bannerSeen(day: string): boolean {
  try {
    return localStorage.getItem(BANNER_KEY) === day;
  } catch {
    return false;
  }
}

function markBannerSeen(day: string): void {
  try {
    localStorage.setItem(BANNER_KEY, day);
  } catch {
    /* only a convenience */
  }
}

const WHEN_NAMES: Record<Exclude<TaskWhen, "all">, string> = {
  today: "today",
  moved: "tasks moved from earlier",
  week: "this week",
  later: "later",
  done: "done tasks",
};

const GROUPS: { id: GroupBy; label: string }[] = [
  { id: "when", label: "When" },
  { id: "note", label: "Note" },
  { id: "tag", label: "Tag" },
];

/** The task list: today on top, then what was left over, this week and later. */
export function TasksView() {
  const tasks = useTaskStore((s) => s.tasks);
  const loaded = useTaskStore((s) => s.loaded);
  const groupBy = useTaskStore((s) => s.groupBy);
  const showDone = useTaskStore((s) => s.showDone);
  const when = useTaskStore((s) => s.when);
  const tag = useTaskStore((s) => s.tag);
  const activePath = useVaultStore((s) => s.activePath);
  const aiOff = useAiBlocked();
  const [draft, setDraft] = useState("");
  const [later, setLater] = useState(false);
  const today = todayIso();
  const [banner, setBanner] = useState(() => !bannerSeen(today));

  useEffect(() => {
    void useTaskStore.getState().load();
  }, []);

  const groups = useMemo(
    () =>
      groupTasks(filterTasks(tasks, when, tag, today), groupBy, today, showDone || when === "done"),
    [tasks, groupBy, today, showDone, when, tag],
  );
  const open = tasks.filter(isOpen).length;

  const add = (): void => {
    const text = draft;
    setDraft("");
    void useTaskStore.getState().add(text);
  };

  return (
    <section aria-label="Tasks" className="flex h-full min-h-0 flex-col bg-background">
      <ViewHeader title="Tasks">
        <div
          role="group"
          aria-label="Group by"
          className="flex overflow-hidden rounded-md border text-xs"
        >
          {GROUPS.map((g, i) => (
            <button
              key={g.id}
              type="button"
              aria-pressed={groupBy === g.id}
              className={cn(
                "px-3 py-1.5",
                i > 0 && "border-l",
                groupBy === g.id ? "bg-accent text-accent-foreground" : "hover:bg-muted",
              )}
              onClick={() => {
                useTaskStore.getState().setGroupBy(g.id);
              }}
            >
              {g.label}
            </button>
          ))}
        </div>
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
          variant="outline"
          aria-pressed={showDone}
          onClick={() => {
            useTaskStore.getState().setShowDone(!showDone);
          }}
        >
          {showDone ? "Hide done" : "Show done"}
        </Button>
      </ViewHeader>

      {(when !== "all" || tag !== null) && (
        <div className="flex items-center gap-2 px-5 pt-3 text-xs text-muted-foreground">
          <span>
            Showing {when === "all" ? "all open tasks" : WHEN_NAMES[when]}
            {tag !== null && ` with #${tag}`}
          </span>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => {
              useTaskStore.getState().setWhen("all");
              useTaskStore.getState().setTag(null);
            }}
          >
            Show everything
          </Button>
        </div>
      )}

      <form
        className="flex gap-2 px-5 pb-1 pt-3"
        onSubmit={(e) => {
          e.preventDefault();
          if (draft.trim() !== "") add();
        }}
      >
        <div className="relative flex-1">
          <Plus
            className="pointer-events-none absolute left-2.5 top-2.5 size-4 text-muted-foreground"
            aria-hidden
          />
          <Input
            aria-label="Add a task"
            className="h-9 pl-8"
            placeholder="Add a task and press Enter. Add a date with “tomorrow” or “fri”."
            value={draft}
            onChange={(e) => {
              setDraft(e.target.value);
            }}
          />
        </div>
      </form>

      <div className="min-h-0 flex-1 overflow-auto px-5 pb-4">
        {banner && open > 0 && groupBy === "when" && (
          <div
            role="note"
            className="my-2 flex items-start gap-3 rounded-lg border border-primary/30 bg-accent px-4 py-3 text-accent-foreground"
          >
            <div className="flex-1">
              <p className="text-sm font-semibold">Good morning. What matters today?</p>
              <p className="text-xs">
                Press <b>Today</b> on the things that matter. Three is plenty. The rest can wait.
              </p>
            </div>
            <button
              type="button"
              aria-label="Dismiss"
              className="rounded p-1 hover:bg-background/60"
              onClick={() => {
                markBannerSeen(today);
                setBanner(false);
              }}
            >
              <X className="size-4" />
            </button>
          </div>
        )}

        {!loaded && <p className="py-6 text-sm text-muted-foreground">Reading your notes…</p>}
        {loaded && groups.length === 0 && (
          <div className="py-10 text-center text-sm text-muted-foreground">
            <p className="font-medium text-foreground">No tasks yet.</p>
            <p>
              Add one above, or write <code>- [ ] something</code> in any note. Mimer finds it.
            </p>
          </div>
        )}

        {groups.map((g) => {
          const collapsed = groupBy === "when" && g.id === "later" && !later && g.tasks.length > 3;
          const moved = g.id === "moved";
          return (
            <section key={g.id} aria-label={g.label} className="mt-4">
              <div className="flex items-center gap-2 px-3 pb-1">
                <h3 className="flex-1 section-label">
                  {g.label} · {g.tasks.length}
                </h3>
                {g.id === "today" && totalMinutes(g.tasks) > 0 && (
                  <span className="text-xs text-muted-foreground">
                    about {durationLabel(totalMinutes(g.tasks))}
                  </span>
                )}
                {g.id === "later" && g.tasks.length > 3 && (
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => {
                      setLater(!later);
                    }}
                  >
                    {later ? "Hide" : "Show"}
                  </Button>
                )}
              </div>
              {g.id === "today" && g.tasks.length > 3 && (
                <p className="px-3 pb-1 text-xs text-muted-foreground">
                  That is more than three. Move some to later if it feels like too much.
                </p>
              )}
              {moved && (
                <p className="px-3 pb-1 text-xs text-muted-foreground">
                  These were not finished. That happens. Nothing is lost.
                </p>
              )}
              {!collapsed && (
                <ul className={cn(moved && "rounded-lg bg-warning/10")}>
                  {g.tasks.map((t) => (
                    <TaskRow
                      key={`${t.path}:${String(t.line)}`}
                      task={t}
                      today={today}
                      planButtons={g.id !== "today" || true}
                    />
                  ))}
                </ul>
              )}
            </section>
          );
        })}
      </div>

      <p className="border-t bg-sidebar px-5 py-2 text-[11px] text-muted-foreground">
        {loaded
          ? `Found in ${String(new Set(tasks.map((t) => t.path)).size)} notes. Each task is a line in the note where you wrote it.`
          : ""}
      </p>
    </section>
  );
}
