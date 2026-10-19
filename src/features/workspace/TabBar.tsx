import { X } from "lucide-react";
import { useState } from "react";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";
import { tabLabels } from "./tabLabels";
import { useEditorStore } from "@/stores/editorStore";
import { reportError } from "@/stores/uiStore";
import { useWorkspaceStore, type PaneId } from "@/stores/workspaceStore";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";

const TAB_MIME = "application/x-mimer-tab";

/** Index of the tab under a drop position (end of the bar when past the last tab). */
export function dropIndex(tabCount: number, targetIndex: number | null): number {
  return targetIndex === null ? tabCount : Math.min(Math.max(targetIndex, 0), tabCount);
}

interface Props {
  paneId: PaneId;
}

/** Open note tabs of one pane: click to switch, × or middle-click to close, drag to reorder or move. */
export function TabBar({ paneId }: Props) {
  const pane = useWorkspaceStore((s) => s.layout.panes.find((p) => p.id === paneId));
  const otherPane: PaneId = paneId === "primary" ? "secondary" : "primary";
  const hasSplit = useWorkspaceStore((s) => s.layout.panes.some((p) => p.id === "secondary"));
  const status = useEditorStore((s) => s.statuses[paneId]);
  const [dragOver, setDragOver] = useState<number | null>(null);
  const ws = useWorkspaceStore;

  if (!pane || pane.tabs.length === 0) {
    return <div className="h-8 shrink-0 border-b" aria-hidden="true" />;
  }

  const close = (path: string): void => {
    ws.getState().close(path);
  };

  const onDrop = (e: React.DragEvent, index: number): void => {
    const raw = e.dataTransfer.getData(TAB_MIME);
    setDragOver(null);
    if (raw === "") return;
    e.preventDefault();
    e.stopPropagation();
    try {
      const { path, from } = JSON.parse(raw) as { path: string; from: PaneId };
      if (from === paneId) {
        const current = pane.tabs.indexOf(path);
        const target = dropIndex(pane.tabs.length, index);
        ws.getState().reorder(paneId, current, current < target ? target - 1 : target);
      } else {
        ws.getState().moveToPane(path, paneId, dropIndex(pane.tabs.length, index));
      }
    } catch {
      /* not a tab drag */
    }
  };

  const labels = tabLabels(pane.tabs);
  return (
    <div
      role="tablist"
      aria-label="Open notes"
      className="flex h-8 shrink-0 items-stretch overflow-x-auto border-b bg-sidebar"
      onDragOver={(e) => {
        if (e.dataTransfer.types.includes(TAB_MIME)) {
          e.preventDefault();
          setDragOver(pane.tabs.length);
        }
      }}
      onDrop={(e) => {
        onDrop(e, pane.tabs.length);
      }}
    >
      {pane.tabs.map((path, index) => {
        const selected = pane.active === path;
        const label = labels.get(path);
        const title = label?.title ?? path;
        const hint = label?.hint ?? null;
        const name = hint === null ? title : `${title} (${hint})`;
        return (
          <ContextMenu key={path}>
            <ContextMenuTrigger asChild>
              <div
                role="tab"
                aria-selected={selected}
                title={path}
                data-index={index}
                draggable
                tabIndex={0}
                className={cn(
                  "group flex max-w-[200px] cursor-default items-center gap-1 border-r px-2 text-xs",
                  selected
                    ? "bg-background text-foreground"
                    : "text-muted-foreground hover:bg-muted",
                  dragOver === index && "shadow-[inset_2px_0_0_var(--primary)]",
                )}
                onClick={() => {
                  ws.getState().activate(paneId, path);
                }}
                onAuxClick={(e) => {
                  if (e.button === 1) close(path);
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") ws.getState().activate(paneId, path);
                }}
                onDragStart={(e) => {
                  e.dataTransfer.setData(TAB_MIME, JSON.stringify({ path, from: paneId }));
                  e.dataTransfer.effectAllowed = "move";
                }}
                onDragOver={(e) => {
                  if (e.dataTransfer.types.includes(TAB_MIME)) {
                    e.preventDefault();
                    e.stopPropagation();
                    const rect = e.currentTarget.getBoundingClientRect();
                    setDragOver(e.clientX < rect.left + rect.width / 2 ? index : index + 1);
                  }
                }}
                onDragLeave={() => {
                  setDragOver(null);
                }}
                onDrop={(e) => {
                  onDrop(e, dragOver ?? index);
                }}
              >
                <span className="truncate">{title}</span>
                {hint !== null && (
                  <span className="min-w-0 max-w-[80px] shrink truncate text-[10px] text-muted-foreground">
                    {hint}
                  </span>
                )}
                {selected && status !== "saved" && (
                  <span className="text-[10px] text-primary" aria-label="Unsaved changes">
                    ●
                  </span>
                )}
                <button
                  type="button"
                  aria-label={`Close ${name}`}
                  className="rounded p-0.5 opacity-60 hover:bg-muted hover:opacity-100"
                  onClick={(e) => {
                    e.stopPropagation();
                    close(path);
                  }}
                >
                  <X className="size-3" />
                </button>
              </div>
            </ContextMenuTrigger>
            <ContextMenuContent>
              <ContextMenuItem
                onSelect={() => {
                  close(path);
                }}
              >
                Close
              </ContextMenuItem>
              <ContextMenuItem
                onSelect={() => {
                  for (const other of pane.tabs) if (other !== path) close(other);
                }}
              >
                Close others
              </ContextMenuItem>
              <ContextMenuItem
                onSelect={() => {
                  for (const other of pane.tabs) close(other);
                }}
              >
                Close all
              </ContextMenuItem>
              <ContextMenuSeparator />
              <ContextMenuItem
                onSelect={() => {
                  ws.getState().moveToPane(path, otherPane);
                }}
              >
                {hasSplit
                  ? paneId === "primary"
                    ? "Move to split view"
                    : "Move to main view"
                  : "Open in split view"}
              </ContextMenuItem>
              <ContextMenuItem
                onSelect={() => {
                  api.revealInFileManager(path).catch(reportError);
                }}
              >
                Reveal in file manager
              </ContextMenuItem>
            </ContextMenuContent>
          </ContextMenu>
        );
      })}
    </div>
  );
}
