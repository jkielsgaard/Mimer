import {
  CalendarClock,
  Files,
  House,
  Lightbulb,
  ListChecks,
  Network,
  Search,
  Settings,
} from "lucide-react";
import { PLANS_LABEL } from "@/lib/planTree";
import { cn } from "@/lib/utils";
import { type LeftTab, useUiStore } from "@/stores/uiStore";

const TABS: { id: LeftTab; label: string; Icon: typeof Files }[] = [
  { id: "plans", label: PLANS_LABEL, Icon: Network },
  { id: "files", label: "Files", Icon: Files },
  { id: "search", label: "Search", Icon: Search },
  { id: "tasks", label: "Tasks", Icon: ListChecks },
  { id: "meetings", label: "Meetings", Icon: CalendarClock },
  { id: "ideas", label: "Ideas", Icon: Lightbulb },
];

/** The name of an icon, shown at its right when the mouse rests on it or it has the focus. */
function Name({ label }: { label: string }) {
  return (
    <span
      aria-hidden
      className="pointer-events-none absolute left-full top-1/2 z-50 ml-2 -translate-y-1/2 whitespace-nowrap rounded-md border bg-popover px-2 py-1 text-xs text-popover-foreground opacity-0 shadow-md transition-opacity group-hover/icon:opacity-100"
    >
      {label}
    </span>
  );
}

/**
 * The narrow bar of icons at the left edge: choose what the left panel shows. Pressing the icon of
 * the open panel hides the panel; pressing another one shows it again.
 */
export function ActivityRail() {
  const leftTab = useUiStore((s) => s.leftTab);
  const collapsed = useUiStore((s) => s.leftCollapsed);
  const startOn = useUiStore((s) => s.centerView === "start");
  return (
    <div className="flex w-11 shrink-0 flex-col items-center gap-1 border-r bg-sidebar py-2">
      <div className="group/icon relative">
        <button
          type="button"
          aria-label="Start"
          aria-pressed={startOn}
          className={cn(
            "flex size-8 items-center justify-center rounded-md text-muted-foreground outline-none hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring",
            startOn && "bg-accent text-accent-foreground",
          )}
          onClick={() => {
            useUiStore.getState().openStart();
          }}
        >
          <House className="size-4" aria-hidden />
        </button>
        <Name label="Start page" />
      </div>
      <div
        role="tablist"
        aria-label="Sidebar"
        aria-orientation="vertical"
        className="flex flex-col items-center gap-1"
      >
        {TABS.map(({ id, label, Icon }) => {
          const on = leftTab === id && !collapsed && !startOn;
          return (
            <div key={id} className="group/icon relative">
              <button
                type="button"
                role="tab"
                aria-selected={on}
                aria-label={label}
                className={cn(
                  "flex size-8 items-center justify-center rounded-md text-muted-foreground outline-none hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring",
                  on && "bg-accent text-accent-foreground",
                )}
                onClick={() => {
                  const ui = useUiStore.getState();
                  if (ui.leftTab === id && !ui.leftCollapsed && ui.centerView !== "start") {
                    ui.toggleLeft();
                    return;
                  }
                  if (id === "ideas" || id === "tasks" || id === "meetings" || id === "plans")
                    ui.openArea(id);
                  else {
                    // Files and Search are about notes, so the note comes back in the middle.
                    ui.setLeftTab(id);
                    ui.setCenterView("notes");
                  }
                }}
              >
                <Icon className="size-4" aria-hidden />
              </button>
              <Name label={label} />
            </div>
          );
        })}
      </div>
      <span className="grow" />
      <div className="group/icon relative">
        <button
          type="button"
          aria-label="Settings"
          className="flex size-8 items-center justify-center rounded-md text-muted-foreground outline-none hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
          onClick={() => {
            useUiStore.getState().setSettingsOpen(true);
          }}
        >
          <Settings className="size-4" aria-hidden />
        </button>
        <Name label="Settings" />
      </div>
    </div>
  );
}
