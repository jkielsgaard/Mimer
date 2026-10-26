import { FileText, Link2, Plus, Sparkles, Target } from "lucide-react";
import { useMemo, useState } from "react";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { NoteBox } from "@/components/NoteBox";
import { ViewHeader } from "@/components/ViewHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { epicGroups, noteName } from "@/lib/taskLogic";
import { useAiBlocked } from "@/lib/useAiBlocked";
import { useTaskStore } from "@/stores/taskStore";
import { useUiStore } from "@/stores/uiStore";
import { useVaultStore } from "@/stores/vaultStore";
import { EpicProgress } from "./TasksView";
import { TaskRow } from "./TaskRow";
import { firstOpenTask, focusEpic } from "./focusEpic";

/** One epic task: the note its tasks are in, how far it has come, and its tasks. */
export function EpicPage() {
  const tasks = useTaskStore((s) => s.tasks);
  const epics = useTaskStore((s) => s.epics);
  const epicOrder = useTaskStore((s) => s.epicOrder);
  const epicPath = useTaskStore((s) => s.epicPath);
  const resolver = useVaultStore((s) => s.resolver);
  const aiOff = useAiBlocked();
  const [draft, setDraft] = useState("");
  const [deleting, setDeleting] = useState(false);
  const epic = epics.find((e) => e.path === epicPath);
  const group = useMemo(
    () => epicGroups(tasks, epics, epicOrder).find((g) => g.path === epicPath) ?? null,
    [tasks, epics, epicOrder, epicPath],
  );
  const back = {
    label: "Tasks",
    run: () => {
      useUiStore.getState().setCenterView("tasks");
    },
  };

  if (!group) {
    return (
      <section aria-label="Epic task" className="flex h-full min-h-0 flex-col bg-background">
        <ViewHeader title="Epic task" back={back} />
        <p className="p-6 text-sm text-muted-foreground">
          This epic task is no longer there. Its note may have been moved or deleted.
        </p>
      </section>
    );
  }

  const from = group.source === null ? null : resolver.resolve(group.source);
  const firstOpen = firstOpenTask(group);

  return (
    <section aria-label="Epic task" className="flex h-full min-h-0 flex-col bg-background">
      <ViewHeader title="Epic task" back={back}>
        <Button
          size="sm"
          variant="outline"
          disabled={firstOpen === undefined}
          onClick={() => {
            focusEpic(group);
          }}
        >
          <Target /> Focus
        </Button>
        {group.native && (
          <Button
            size="sm"
            variant="ghost"
            onClick={() => {
              setDeleting(true);
            }}
          >
            Delete
          </Button>
        )}
      </ViewHeader>
      <div className="min-h-0 flex-1 overflow-auto px-7 py-5">
        <div className="mx-auto flex max-w-3xl flex-col gap-5">
          <div className="flex flex-col gap-1">
            <h2 className="text-2xl font-semibold">{group.title}</h2>
            <p className="text-xs text-muted-foreground">
              {group.native
                ? "The tasks of this epic are kept in the note "
                : "These tasks are written in the note "}
              <b className="text-foreground">{group.path.replace(/\.md$/i, "")}</b>
            </p>
          </div>

          {group.native && (
            <NoteBox
              label="Note"
              value={epic?.description ?? ""}
              placeholder="What is this epic task about?"
              hint="Kept as text under the heading of the epic's note."
              onSave={(text) => {
                void useTaskStore.getState().setDescription(group.path, text);
              }}
            />
          )}

          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                void useVaultStore.getState().openNote(group.path);
              }}
            >
              <FileText /> {group.native ? "Go to the epic's note" : "Go to the note"}
            </Button>
            {from !== null && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  void useVaultStore.getState().openNote(from);
                }}
              >
                <Link2 /> Came from: {noteName(from)}
              </Button>
            )}
            <span className="grow" />
            <EpicProgress group={group} />
            {group.allDone && <span className="text-xs font-semibold text-success">Done</span>}
          </div>

          <section aria-label="Tasks" className="rounded-lg border bg-card p-2">
            <h3 className="section-label px-2 pb-1 pt-1">Tasks</h3>
            <ul>
              {group.tasks.map((t, i, all) => (
                <TaskRow
                  key={`${t.path}:${String(t.line)}`}
                  task={t}
                  showNote={false}
                  canMove={{ up: i > 0, down: i < all.length - 1 }}
                />
              ))}
            </ul>
            {group.tasks.length === 0 && (
              <p className="px-2 py-2 text-xs text-muted-foreground">
                No tasks yet. Add one below, or let the AI suggest some from the note.
              </p>
            )}
            <form
              className="flex gap-2 p-2"
              onSubmit={(e) => {
                e.preventDefault();
                const text = draft.trim();
                if (text === "") return;
                setDraft("");
                void useTaskStore.getState().add(text, undefined, undefined, group.path);
              }}
            >
              <div className="relative flex-1">
                <Plus
                  className="pointer-events-none absolute left-2.5 top-2.5 size-4 text-muted-foreground"
                  aria-hidden
                />
                <Input
                  aria-label="Add a task to this epic"
                  className="h-9 pl-8"
                  placeholder="Add a task to this epic…"
                  value={draft}
                  onChange={(e) => {
                    setDraft(e.target.value);
                  }}
                />
              </div>
            </form>
          </section>

          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={aiOff !== null}
              title={aiOff ?? "The AI reads the note and suggests the next steps"}
              onClick={() => {
                useUiStore
                  .getState()
                  .setFindTasksOpen(true, undefined, { path: group.path, mode: "steps" });
              }}
            >
              <Sparkles /> Suggest steps from the note
            </Button>
            <span className="text-xs text-muted-foreground">
              The AI reads the note, not only the title. You choose which steps are added.
            </span>
          </div>
        </div>
      </div>
      <ConfirmDialog
        open={deleting}
        title="Delete this epic task?"
        description="Its note and the tasks in it are removed, but they stay in the version history, so they can be brought back."
        confirmLabel="Delete"
        destructive
        onCancel={() => {
          setDeleting(false);
        }}
        onConfirm={() => {
          setDeleting(false);
          void useVaultStore
            .getState()
            .deletePath(group.path)
            .then(async () => {
              await useTaskStore.getState().load();
              useUiStore.getState().setCenterView("tasks");
            });
        }}
      />
    </section>
  );
}
