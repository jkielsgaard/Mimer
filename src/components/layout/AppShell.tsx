import { useRef } from "react";
import {
  Panel,
  PanelGroup,
  PanelResizeHandle,
  type ImperativePanelHandle,
} from "react-resizable-panels";
import { ChatPanel } from "@/features/chat/ChatPanel";
import { EditorArea } from "@/features/workspace/EditorArea";
import { FilesPanel } from "@/features/fileTree/FilesPanel";
import { HistoryPanel } from "@/features/history/HistoryPanel";
import { ImagesPanel } from "@/features/images/ImagesPanel";
import { RavenPanel } from "@/features/raven/RavenPanel";
import { useRaven } from "@/features/raven/useRaven";
import { SearchPanel } from "@/features/search/SearchPanel";
import { panelStorage } from "@/lib/safeStorage";

import { type LeftTab, type RightTab, useUiStore } from "@/stores/uiStore";
import { Header } from "./Header";
import { StatusBar } from "./StatusBar";
import { usePanelCollapse } from "./usePanelCollapse";
import { useChatStore } from "@/stores/chatStore";
import { useRavenStore } from "@/stores/ravenStore";
import { Tabs } from "./Tabs";

const LEFT_TABS: { id: LeftTab; label: string }[] = [
  { id: "files", label: "Files" },
  { id: "search", label: "Search" },
];
const RIGHT_TABS: { id: RightTab; label: string }[] = [
  { id: "assistant", label: "Mimer" },
  { id: "images", label: "Images" },
  { id: "history", label: "History" },
];
const RAVEN_TAB: { id: RightTab; label: string } = { id: "raven", label: "Raven" };

/** Title bar, three resizable/collapsible columns and the status bar. */
export function AppShell() {
  const ui = useUiStore();
  const streaming = useChatStore((s) => s.streaming);
  const ravenStreaming = useRavenStore((s) => s.streaming);
  // The Raven tab is there only when a cloud provider has been chosen for it.
  const raven = useRaven();
  const rightTabs = raven
    ? [RIGHT_TABS[0] ?? RAVEN_TAB, RAVEN_TAB, ...RIGHT_TABS.slice(1)]
    : RIGHT_TABS;
  const rightTab = ui.rightTab === "raven" && !raven ? "assistant" : ui.rightTab;
  const left = useRef<ImperativePanelHandle>(null);
  const right = useRef<ImperativePanelHandle>(null);

  usePanelCollapse(left, ui.leftCollapsed);
  usePanelCollapse(right, ui.rightCollapsed);

  return (
    <div className="flex h-full flex-col">
      <Header />
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
            if (!useUiStore.getState().leftCollapsed) useUiStore.setState({ leftCollapsed: true });
          }}
          onExpand={() => {
            if (useUiStore.getState().leftCollapsed) useUiStore.setState({ leftCollapsed: false });
          }}
          className="bg-sidebar"
        >
          <div className="flex h-full min-h-0 flex-col">
            <Tabs tabs={LEFT_TABS} value={ui.leftTab} onChange={ui.setLeftTab} label="Sidebar" />
            {ui.leftTab === "files" ? (
              <>
                <FilesPanel />
              </>
            ) : (
              <div className="min-h-0 flex-1">
                <SearchPanel />
              </div>
            )}
          </div>
        </Panel>
        <PanelResizeHandle className="w-px bg-border transition-colors hover:bg-primary data-[resize-handle-active]:bg-primary" />
        <Panel id="center" order={2} minSize={30}>
          <main className="h-full min-h-0">
            <EditorArea />
          </main>
        </Panel>
        <PanelResizeHandle className="w-px bg-border transition-colors hover:bg-primary data-[resize-handle-active]:bg-primary" />
        <Panel
          ref={right}
          id="right"
          order={3}
          defaultSize={26}
          minSize={16}
          maxSize={50}
          collapsible
          collapsedSize={0}
          onCollapse={() => {
            if (!useUiStore.getState().rightCollapsed)
              useUiStore.setState({ rightCollapsed: true });
          }}
          onExpand={() => {
            if (useUiStore.getState().rightCollapsed)
              useUiStore.setState({ rightCollapsed: false });
          }}
          className="bg-sidebar"
        >
          <div className="flex h-full min-h-0 flex-col">
            <Tabs
              tabs={rightTabs}
              value={rightTab}
              onChange={ui.setRightTab}
              label="Right panel"
              busy={[
                ...(streaming ? (["assistant"] as const) : []),
                ...(ravenStreaming ? (["raven"] as const) : []),
              ]}
            />
            <div className="min-h-0 flex-1">
              {rightTab === "assistant" && <ChatPanel />}
              {rightTab === "raven" && <RavenPanel />}
              {rightTab === "images" && <ImagesPanel />}
              {rightTab === "history" && <HistoryPanel />}
            </div>
          </div>
        </Panel>
      </PanelGroup>
      <StatusBar />
    </div>
  );
}
