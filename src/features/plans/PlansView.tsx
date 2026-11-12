import { Sparkles } from "lucide-react";
import { useEffect } from "react";
import { BetaBadge } from "@/components/BetaBadge";
import { ViewHeader } from "@/components/ViewHeader";
import { Button } from "@/components/ui/button";
import { PlainButton } from "@/components/ui/plain-button";
import { PLANS_LABEL } from "@/lib/planTree";
import { cn } from "@/lib/utils";
import { useAiBlocked } from "@/lib/useAiBlocked";
import { usePlanStore, type PlanView } from "@/stores/planStore";
import { useTaskStore } from "@/stores/taskStore";
import { useUiStore } from "@/stores/uiStore";
import { firstStep } from "./nodeInfo";
import { PlanDialogs } from "./PlanDialogs";
import { PlanMap } from "./PlanMap";
import { PlanOutline } from "./PlanOutline";
import { usePlanContext } from "./usePlanContext";

const VIEWS: { id: PlanView; label: string }[] = [
  { id: "outline", label: "Outline" },
  { id: "map", label: "Map" },
];

/** The open plan in the middle: its ideas as an outline or a map, and what to begin with. */
export function PlansView() {
  const path = usePlanStore((s) => s.path);
  const title = usePlanStore((s) => s.title);
  const finished = usePlanStore((s) => s.finished);
  const nodes = usePlanStore((s) => s.nodes);
  const view = usePlanStore((s) => s.view);
  const aiOff = useAiBlocked();
  const ctx = usePlanContext(path);
  const fromProject = useUiStore((s) => s.planFromProjectFolder);

  useEffect(() => {
    if (fromProject === null) return;
    usePlanStore.getState().setDialog({ kind: "import", folder: fromProject });
    useUiStore.getState().clearPlanFromProject();
  }, [fromProject]);

  useEffect(() => {
    if (!useTaskStore.getState().loaded) void useTaskStore.getState().load();
  }, []);

  if (path === null) {
    return (
      <section aria-label={PLANS_LABEL} className="flex h-full min-h-0 flex-col bg-background">
        <ViewHeader title={PLANS_LABEL}>
          <BetaBadge title="Plans are in beta: still being built, and they will change." />
          <Button
            size="sm"
            onClick={() => {
              usePlanStore.getState().setGuidedOpen(true);
            }}
          >
            New plan
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => {
              usePlanStore.getState().setDialog({ kind: "import", folder: null });
            }}
          >
            Plan from a project…
          </Button>
        </ViewHeader>
        <div className="mx-auto max-w-md py-12 text-center text-sm text-muted-foreground">
          <p className="font-medium text-foreground">Break something big down.</p>
          <p className="mb-2">Plans are in beta: they are still being built and will change.</p>
          <p>
            A plan is a tree of ideas: write down the parts, break them into smaller ones, and tie
            them to epics, tasks and notes. Choose a plan at the left, or press <b>New plan</b>.
          </p>
        </div>
        <PlanDialogs />
      </section>
    );
  }

  const start = firstStep(nodes, ctx);
  return (
    <section aria-label={PLANS_LABEL} className="flex h-full min-h-0 flex-col bg-background">
      <ViewHeader title={title}>
        <BetaBadge title="Plans are in beta: still being built, and they will change." />
        <div
          role="group"
          aria-label="View"
          className="flex overflow-hidden rounded-md border text-sm"
        >
          {VIEWS.map((v, i) => (
            <PlainButton
              key={v.id}
              type="button"
              aria-pressed={view === v.id}
              className={cn(
                "px-3 py-1",
                i > 0 && "border-l",
                view === v.id ? "bg-accent font-semibold text-accent-foreground" : "hover:bg-muted",
              )}
              onClick={() => {
                usePlanStore.getState().setView(v.id);
              }}
            >
              {v.label}
            </PlainButton>
          ))}
        </div>
        <Button
          size="sm"
          variant="outline"
          disabled={aiOff !== null || finished}
          title={aiOff ?? "The AI suggests parts of the plan"}
          onClick={() => {
            usePlanStore.getState().setDialog({ kind: "parts", path: [] });
          }}
        >
          <Sparkles /> Suggest parts
        </Button>
        {finished ? (
          <Button
            size="sm"
            variant="outline"
            onClick={() => {
              void usePlanStore.getState().setFinished(false);
            }}
          >
            Open it again
          </Button>
        ) : (
          <Button
            size="sm"
            variant="outline"
            onClick={() => {
              usePlanStore.getState().setDialog({ kind: "finish" });
            }}
          >
            Finish…
          </Button>
        )}
      </ViewHeader>
      <div className="min-h-0 flex-1 overflow-auto">
        {finished && (
          <p className="mx-7 mt-4 rounded-md bg-muted px-3 py-2 text-sm text-muted-foreground">
            This plan is finished. You can still read and change it, or open it again.
          </p>
        )}
        {view === "outline" ? (
          <div className="mx-auto flex max-w-3xl flex-col gap-4 px-7 py-5">
            <p className="text-xs text-muted-foreground">
              Write down everything that comes to mind: Enter adds an idea, Tab makes the next one a
              smaller part of it, Shift+Tab goes back up, and a pasted list becomes a tree. Nothing
              has to be tied to anything yet. When you want to, press ··· on an idea to make it a
              task, an epic or a note, or to link one that is there. Double-click an idea to change
              its words. There is no timer: take the time you need, or come back later.
            </p>
            <PlanOutline nodes={nodes} ctx={ctx} />
            {start && (
              <div className="flex items-center gap-3 rounded-xl border bg-card px-4 py-3">
                <div className="min-w-0 flex-1">
                  <span className="section-label">A small place to start</span>
                  <p className="truncate text-sm font-semibold">{start.task.title}</p>
                  <p className="truncate text-xs text-muted-foreground">Under “{start.idea}”.</p>
                </div>
                <Button
                  onClick={() => {
                    useTaskStore.getState().open(start.task);
                  }}
                >
                  Open the task
                </Button>
              </div>
            )}
          </div>
        ) : (
          <PlanMap nodes={nodes} ctx={ctx} />
        )}
      </div>
      <PlanDialogs />
    </section>
  );
}
