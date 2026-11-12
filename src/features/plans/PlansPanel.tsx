import { FolderInput, Plus } from "lucide-react";
import { useEffect } from "react";
import { BetaBadge } from "@/components/BetaBadge";
import { PanelHeader } from "@/components/PanelHeader";
import { Button } from "@/components/ui/button";
import { PlainButton } from "@/components/ui/plain-button";
import { PLANS_LABEL } from "@/lib/planTree";
import { cn } from "@/lib/utils";
import { usePlanStore, type PlanSummary } from "@/stores/planStore";
import { useUiStore } from "@/stores/uiStore";

/** The left panel of the plans area: the plans that are going, and under them the finished ones. */
export function PlansPanel() {
  const plans = usePlanStore((s) => s.plans);
  const loaded = usePlanStore((s) => s.loaded);
  const current = usePlanStore((s) => s.path);
  const centerView = useUiStore((s) => s.centerView);

  useEffect(() => {
    void usePlanStore.getState().load();
  }, []);

  const ongoing = plans.filter((p) => !p.finished);
  const finished = plans.filter((p) => p.finished);
  const row = (p: PlanSummary) => {
    const on = centerView === "plans" && current === p.path;
    return (
      <li key={p.path}>
        <PlainButton
          type="button"
          aria-current={on}
          className={cn(
            "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring",
            on && "bg-accent text-accent-foreground",
            p.finished && "text-muted-foreground",
          )}
          onClick={() => {
            void usePlanStore.getState().open(p.path);
          }}
        >
          <span className="flex-1 truncate">{p.title}</span>
          <span className="text-xs text-muted-foreground tabular-nums">{p.ideas}</span>
        </PlainButton>
      </li>
    );
  };

  return (
    <div className="flex h-full min-h-0 flex-col">
      <PanelHeader title={PLANS_LABEL}>
        <BetaBadge title="Plans are in beta: still being built, and they will change." />
        <Button
          size="sm"
          variant="ghost"
          aria-label="Plan from a project"
          title="Make a plan of a project that is there"
          onClick={() => {
            usePlanStore.getState().setDialog({ kind: "import", folder: null });
            useUiStore.getState().openArea("plans");
          }}
        >
          <FolderInput />
        </Button>
        <Button
          size="sm"
          variant="ghost"
          aria-label="New plan"
          title="New plan"
          onClick={() => {
            usePlanStore.getState().setGuidedOpen(true);
          }}
        >
          <Plus />
        </Button>
      </PanelHeader>
      <div className="min-h-0 flex-1 overflow-auto px-2 py-2">
        <h3 className="section-label px-2 pb-1">Ongoing</h3>
        {loaded && ongoing.length === 0 && (
          <p className="px-2 text-xs text-muted-foreground">
            None yet. Press <b>+</b> to break something big down.
          </p>
        )}
        <ul>{ongoing.map(row)}</ul>
        {finished.length > 0 && (
          <>
            <h3 className="section-label px-2 pb-1 pt-3">Finished · {finished.length}</h3>
            <ul>{finished.map(row)}</ul>
          </>
        )}
      </div>
    </div>
  );
}
