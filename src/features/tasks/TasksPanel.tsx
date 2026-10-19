import { Check, Plus } from "lucide-react";
import { PanelHeader } from "@/components/PanelHeader";
import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { countByWhen, filterTasks, tagCounts, todayIso } from "@/lib/taskLogic";
import { cn } from "@/lib/utils";
import { useTaskStore, type TaskWhen } from "@/stores/taskStore";
import { useUiStore } from "@/stores/uiStore";

const WHEN: { id: TaskWhen; label: string }[] = [
  { id: "all", label: "All open" },
  { id: "today", label: "Today" },
  { id: "moved", label: "Moved from earlier" },
  { id: "week", label: "This week" },
  { id: "later", label: "Later" },
  { id: "done", label: "Done" },
];

/** The most tasks of today the panel lists. The rest are in the list in the middle. */
const SHOWN = 8;

/**
 * The left panel of the Tasks area: add a task, choose which part of the time line or which tag
 * to look at, and see today's tasks while you write. The full list is in the middle.
 */
export function TasksPanel() {
  const tasks = useTaskStore((s) => s.tasks);
  const loaded = useTaskStore((s) => s.loaded);
  const when = useTaskStore((s) => s.when);
  const tag = useTaskStore((s) => s.tag);
  const [draft, setDraft] = useState("");
  const today = todayIso();

  useEffect(() => {
    void useTaskStore.getState().load();
  }, []);

  const counts = useMemo(() => countByWhen(tasks, today), [tasks, today]);
  const tags = useMemo(() => tagCounts(tasks), [tasks]);
  const todays = useMemo(() => filterTasks(tasks, "today", null, today), [tasks, today]);

  const show = (w: TaskWhen, t: string | null): void => {
    const store = useTaskStore.getState();
    store.setWhen(w);
    store.setTag(t);
    useUiStore.getState().setCenterView("tasks");
  };

  return (
    <div className="flex h-full min-h-0 flex-col">
      <PanelHeader title="Tasks">
        <Button
          size="sm"
          variant="outline"
          disabled={counts.today === 0}
          title={counts.today === 0 ? "Put a task on today's list first" : "Work on one thing"}
          onClick={() => {
            const first = todays[0];
            if (first) {
              useTaskStore
                .getState()
                .select({ path: first.path, line: first.line, title: first.title });
            }
            useUiStore.getState().setFocusOpen(true);
          }}
        >
          Focus
        </Button>
      </PanelHeader>
      <form
        className="px-3 pt-2"
        onSubmit={(e) => {
          e.preventDefault();
          const text = draft.trim();
          if (text === "") return;
          setDraft("");
          void useTaskStore.getState().add(text);
        }}
      >
        <div className="relative">
          <Plus
            className="pointer-events-none absolute left-2.5 top-2.5 size-4 text-muted-foreground"
            aria-hidden
          />
          <Input
            aria-label="Add a task here"
            className="h-9 pl-8"
            placeholder="Add a task…"
            value={draft}
            onChange={(e) => {
              setDraft(e.target.value);
            }}
          />
        </div>
      </form>
      <div className="min-h-0 flex-1 overflow-auto px-2 pb-3 pt-2">
        <nav aria-label="Show tasks">
          <ul>
            {WHEN.map((w) => (
              <li key={w.id}>
                <button
                  type="button"
                  aria-pressed={when === w.id && tag === null}
                  className={cn(
                    "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring",
                    when === w.id && tag === null && "bg-accent text-accent-foreground",
                    w.id === "moved" && counts.moved > 0 && "text-warning",
                  )}
                  onClick={() => {
                    show(w.id, null);
                  }}
                >
                  <span className="flex-1">{w.label}</span>
                  <span className="text-xs text-muted-foreground">{counts[w.id]}</span>
                </button>
              </li>
            ))}
          </ul>
        </nav>

        {tags.length > 0 && (
          <section aria-label="Tags" className="mt-3">
            <h3 className="px-2 pb-1 section-label">Tags</h3>
            <ul>
              {tags.map((t) => (
                <li key={t.tag}>
                  <button
                    type="button"
                    aria-pressed={tag === t.tag}
                    className={cn(
                      "flex w-full items-center gap-2 rounded-md px-2 py-1 text-left text-sm hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring",
                      tag === t.tag && "bg-accent text-accent-foreground",
                    )}
                    onClick={() => {
                      show("all", tag === t.tag ? null : t.tag);
                    }}
                  >
                    <span className="flex-1 truncate">#{t.tag}</span>
                    <span className="text-xs text-muted-foreground">{t.count}</span>
                  </button>
                </li>
              ))}
            </ul>
          </section>
        )}

        <section aria-label="Today" className="mt-3">
          <h3 className="px-2 pb-1 section-label">On today's list</h3>
          {loaded && todays.length === 0 && (
            <p className="px-2 text-xs text-muted-foreground">
              Nothing yet. Open a task and press Today to put it here.
            </p>
          )}
          <ul>
            {todays.slice(0, SHOWN).map((t) => (
              <li key={`${t.path}:${String(t.line)}`} className="flex items-center gap-2 px-1">
                <button
                  type="button"
                  role="checkbox"
                  aria-checked={false}
                  aria-label={`Mark as done: ${t.title}`}
                  className={cn(
                    "flex size-4 shrink-0 items-center justify-center rounded-[4px] border-2 border-muted-foreground bg-card focus-visible:ring-2 focus-visible:ring-ring",
                  )}
                  onClick={() => {
                    void useTaskStore.getState().setDone(t.path, t.line, t.key, true);
                  }}
                >
                  <Check className="size-3 opacity-0" aria-hidden />
                </button>
                <button
                  type="button"
                  className="min-w-0 flex-1 truncate rounded-md px-1 py-1 text-left text-sm hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring"
                  onClick={() => {
                    useTaskStore.getState().open(t);
                  }}
                >
                  {t.title}
                </button>
              </li>
            ))}
          </ul>
          {todays.length > SHOWN && (
            <p className="px-2 pt-1 text-xs text-muted-foreground">
              and {todays.length - SHOWN} more
            </p>
          )}
        </section>
      </div>
    </div>
  );
}
