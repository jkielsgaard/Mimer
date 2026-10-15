import { Panel, PanelGroup, PanelResizeHandle } from "react-resizable-panels";

import { panelStorage } from "@/lib/safeStorage";

import { useWorkspaceStore } from "@/stores/workspaceStore";

import { EditorPane } from "./EditorPane";

/** The editor column: one pane, or two side by side in split view. */
export function EditorArea() {
  const split = useWorkspaceStore((s) => s.layout.panes.some((p) => p.id === "secondary"));
  const focused = useWorkspaceStore((s) => s.layout.focused);
  if (!split) {
    return <EditorPane paneId="primary" focused={focused === "primary"} split={false} />;
  }
  return (
    <PanelGroup direction="horizontal" autoSaveId="mimer-split" storage={panelStorage}>
      <Panel id="split-primary" order={1} minSize={20}>
        <EditorPane paneId="primary" focused={focused === "primary"} split />
      </Panel>
      <PanelResizeHandle className="w-px bg-border transition-colors hover:bg-primary" />
      <Panel id="split-secondary" order={2} minSize={20}>
        <EditorPane paneId="secondary" focused={focused === "secondary"} split />
      </Panel>
    </PanelGroup>
  );
}
