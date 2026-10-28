import { useRef } from "react";
import {
  Panel,
  PanelGroup,
  PanelResizeHandle,
  type ImperativePanelHandle,
} from "react-resizable-panels";
import { EditorArea } from "@/features/workspace/EditorArea";
import { IdeasPanel } from "@/features/capture/IdeasPanel";
import { IdeasView } from "@/features/capture/IdeasView";
import { MeetingsPanel } from "@/features/meetings/MeetingsPanel";
import { MeetingsView } from "@/features/meetings/MeetingsView";
import { StartPage } from "@/features/start/StartPage";
import { EpicPage } from "@/features/tasks/EpicPage";
import { TaskPage } from "@/features/tasks/TaskPage";
import { TasksPanel } from "@/features/tasks/TasksPanel";
import { TasksView } from "@/features/tasks/TasksView";
import { cn } from "@/lib/utils";
import { FilesPanel } from "@/features/fileTree/FilesPanel";
import { HistoryPanel } from "@/features/history/HistoryPanel";
import { ImagesPanel } from "@/features/images/ImagesPanel";
import { SearchPanel } from "@/features/search/SearchPanel";
import { panelStorage } from "@/lib/safeStorage";

import { type RightTab, useUiStore } from "@/stores/uiStore";
import { Header } from "./Header";
import { StatusBar } from "./StatusBar";
import { usePanelCollapse } from "./usePanelCollapse";
import { ActivityRail } from "./ActivityRail";
import { FieldAi } from "@/features/fieldAi/FieldAi";
import { AskWindow } from "./AskWindow";
import { RightRail } from "./RightRail";
import { LinksPanel } from "@/features/notePanels/LinksPanel";
import { OutlinePanel } from "@/features/notePanels/OutlinePanel";
import { X } from "lucide-react";
import { PanelHeader } from "@/components/PanelHeader";
import { activeTitle, useVaultStore } from "@/stores/vaultStore";

const RIGHT_LABELS: Record<RightTab, string> = {
  outline: "Outline",
  links: "Links",
  history: "History",
  images: "Images",
};

/** Title bar, three resizable/collapsible columns and the status bar. */
export function AppShell() {
  const ui = useUiStore();
  const rightTab = ui.rightTab;
  const activePath = useVaultStore((s) => s.activePath);
  const left = useRef<ImperativePanelHandle>(null);
  const right = useRef<ImperativePanelHandle>(null);

  // With no note open the middle shows the start page instead of an empty editor.
  const showStart = ui.centerView === "start" || (ui.centerView === "notes" && activePath === null);
  const showNotes = ui.centerView === "notes" && !showStart;

  // The house opens the start page on its own: both side panels go while it is shown (and come
  // back as they were). With no note open they stay.
  const startOnly = ui.centerView === "start";
  usePanelCollapse(left, ui.leftCollapsed || startOnly);
  usePanelCollapse(right, ui.rightCollapsed || startOnly);

  return (
    <div className="flex h-full flex-col">
      <Header />
      <div className="flex min-h-0 flex-1">
        <ActivityRail />
        <PanelGroup
          direction="horizontal"
          autoSaveId="mimer-layout"
          storage={panelStorage}
          className="min-h-0 flex-1"
        >
          <Panel
            ref={left}
            id="left"
            order={1}
            defaultSize={20}
            minSize={12}
            maxSize={40}
            collapsible
            collapsedSize={0}
            onCollapse={() => {
              if (
                useUiStore.getState().centerView !== "start" &&
                !useUiStore.getState().leftCollapsed
              )
                useUiStore.setState({ leftCollapsed: true });
            }}
            onExpand={() => {
              if (
                useUiStore.getState().centerView !== "start" &&
                useUiStore.getState().leftCollapsed
              )
                useUiStore.setState({ leftCollapsed: false });
            }}
            className="bg-sidebar"
          >
            <div className="flex h-full min-h-0 flex-col">
              {ui.leftTab === "files" && <FilesPanel />}
              {ui.leftTab === "search" && (
                <div className="min-h-0 flex-1">
                  <SearchPanel />
                </div>
              )}
              {ui.leftTab === "tasks" && <TasksPanel />}
              {ui.leftTab === "ideas" && <IdeasPanel />}
              {ui.leftTab === "meetings" && <MeetingsPanel />}
            </div>
          </Panel>
          <PanelResizeHandle className="w-px bg-border transition-colors hover:bg-primary data-[resize-handle-active]:bg-primary" />
          <Panel id="center" order={2} minSize={30}>
            <main className="h-full min-h-0">
              {/* The notes stay mounted while the tasks are shown, so nothing typed is lost. */}
              <div className={cn("h-full min-h-0", !showNotes && "hidden")}>
                <EditorArea />
              </div>
              {ui.centerView === "tasks" && <TasksView />}
              {ui.centerView === "epic" && <EpicPage />}
              {ui.centerView === "task" && <TaskPage />}
              {ui.centerView === "ideas" && <IdeasView />}
              {ui.centerView === "meetings" && <MeetingsView />}
              {showStart && <StartPage />}
            </main>
          </Panel>
          <PanelResizeHandle className="w-px bg-border transition-colors hover:bg-primary data-[resize-handle-active]:bg-primary" />
          <Panel
            ref={right}
            id="right"
            order={3}
            defaultSize={20}
            minSize={14}
            maxSize={50}
            collapsible
            collapsedSize={0}
            onCollapse={() => {
              if (
                useUiStore.getState().centerView !== "start" &&
                !useUiStore.getState().rightCollapsed
              )
                useUiStore.setState({ rightCollapsed: true });
            }}
            onExpand={() => {
              if (
                useUiStore.getState().centerView !== "start" &&
                useUiStore.getState().rightCollapsed
              )
                useUiStore.setState({ rightCollapsed: false });
            }}
            className="bg-sidebar"
          >
            <div className="flex h-full min-h-0 flex-col">
              <PanelHeader
                title={RIGHT_LABELS[rightTab]}
                about={rightTab === "images" ? null : activeTitle(activePath)}
              >
                <button
                  type="button"
                  aria-label="Close the panel"
                  className="rounded p-1 text-muted-foreground hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring"
                  onClick={ui.toggleRight}
                >
                  <X className="size-3.5" />
                </button>
              </PanelHeader>
              <div className="min-h-0 flex-1">
                {rightTab === "outline" && <OutlinePanel />}
                {rightTab === "links" && <LinksPanel />}
                {rightTab === "images" && <ImagesPanel />}
                {rightTab === "history" && <HistoryPanel />}
              </div>
            </div>
          </Panel>
        </PanelGroup>
        {!startOnly && <RightRail />}
      </div>
      <AskWindow />
      <FieldAi />
      <StatusBar />
    </div>
  );
}
