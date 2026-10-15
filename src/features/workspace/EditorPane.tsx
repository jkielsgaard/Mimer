import { Editor } from "@/features/editor/Editor";
import { cn } from "@/lib/utils";
import { useWorkspaceStore, type PaneId } from "@/stores/workspaceStore";
import { Breadcrumb } from "./Breadcrumb";
import { TabBar } from "./TabBar";

export function EditorPane({
  paneId,
  focused,
  split,
}: {
  paneId: PaneId;
  focused: boolean;
  split: boolean;
}) {
  const active = useWorkspaceStore(
    (s) => s.layout.panes.find((p) => p.id === paneId)?.active ?? null,
  );
  return (
    <div
      className={cn(
        "flex h-full min-h-0 flex-col",
        split && focused && "shadow-[inset_0_2px_0_var(--primary)]",
      )}
    >
      <TabBar paneId={paneId} />
      <Breadcrumb path={active} />
      <div className="min-h-0 flex-1">
        <Editor paneId={paneId} />
      </div>
    </div>
  );
}
