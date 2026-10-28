import { CalendarClock, Files, House, Lightbulb, ListChecks, Search, Settings } from "lucide-react";
import { cn } from "@/lib/utils";
import { type LeftTab, useUiStore } from "@/stores/uiStore";

const TABS: { id: LeftTab; label: string; Icon: typeof Files }[] = [
  { id: "files", label: "Files", Icon: Files },
  { id: "search", label: "Search", Icon: Search },
  { id: "ideas", label: "Ideas", Icon: Lightbulb },
  { id: "tasks", label: "Tasks", Icon: ListChecks },
  { id: "meetings", label: "Meetings", Icon: CalendarClock },
];

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
      <button
        type="button"
        aria-label="Start"
        aria-pressed={startOn}
        title="Start page"
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
      <div
        role="tablist"
        aria-label="Sidebar"
        aria-orientation="vertical"
        className="flex flex-col items-center gap-1"
      >
        {TABS.map(({ id, label, Icon }) => {
          const on = leftTab === id && !collapsed && !startOn;
          return (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={on}
              aria-label={label}
              title={label}
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
                if (id === "ideas" || id === "tasks" || id === "meetings") ui.openArea(id);
                else {
                  // Files and Search are about notes, so the note comes back in the middle.
                  ui.setLeftTab(id);
                  ui.setCenterView("notes");
                }
              }}
            >
              <Icon className="size-4" aria-hidden />
            </button>
          );
        })}
      </div>
      <span className="grow" />
      <button
        type="button"
        aria-label="Settings"
        title="Settings"
        className="flex size-8 items-center justify-center rounded-md text-muted-foreground outline-none hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
        onClick={() => {
          useUiStore.getState().setSettingsOpen(true);
        }}
      >
        <Settings className="size-4" aria-hidden />
      </button>
    </div>
  );
}
