import { useCallback, useMemo } from "react";

import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";

import { useTreeStore } from "@/stores/treeStore";
import { reportError } from "@/stores/uiStore";
import { useVaultStore } from "@/stores/vaultStore";
import { TreeRow } from "./TreeRow";
import { droppedPaths, moveMany } from "./treeMoves";
import { filterTree, pinFirst, sortTree, type Action } from "./treeUtils";
import type { TreeNode } from "@/bindings/TreeNode";
import { cn } from "@/lib/utils";

interface Props {
  /** The top level of this tree: the whole vault without its projects, or the inside of a project. */
  nodes: readonly TreeNode[];
  /** The folder new notes and drops on empty space go to ("" = the vault root). */
  rootFolder: string;
  /** Text shown when the tree has nothing in it and no filter is used. */
  emptyText?: string;
  /** Top-level folders shown first (Meetings and Quick notes in "All files"). */
  pinned?: readonly string[];
  /** The name of the tree for screen readers (default: Files). */
  label?: string;
  className?: string;
  onAction: (a: Action) => void;
}

const NO_FOLDERS: readonly string[] = [];

/** Folders-first file tree with context menu and drag-and-drop moves. */
export function FileTree({
  nodes,
  rootFolder,
  emptyText,
  pinned = NO_FOLDERS,
  label,
  className,
  onAction,
}: Props) {
  const projects = useVaultStore((s) => s.projects);
  const expanded = useTreeStore((s) => s.expanded);
  const toggle = useTreeStore((s) => s.toggle);
  const filter = useTreeStore((s) => s.filter);
  const sort = useTreeStore((s) => s.sort);
  const order = useTreeStore((s) => s.order);
  const projectFolders = useMemo(() => projects.map((p) => p.folder), [projects]);
  const filtering = filter.trim() !== "";
  const shown = useMemo(() => {
    const sorted = sortTree(filterTree(nodes, filter), sort, order, rootFolder);
    // With a hand-made order nothing is moved to the top by itself.
    return sort === "manual" ? sorted : pinFirst(sorted, pinned);
  }, [nodes, filter, sort, order, pinned, rootFolder]);

  const onDropOn = useCallback((folder: string, e: React.DragEvent) => {
    const paths = droppedPaths(e.dataTransfer);
    if (paths.length > 0) {
      e.preventDefault();
      void moveMany(paths, folder).catch(reportError);
    }
  }, []);

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        <div
          className={cn("p-1.5", className)}
          onDragOver={(e) => {
            if (e.dataTransfer.types.includes("application/x-mimer-path")) e.preventDefault();
          }}
          onDrop={(e) => {
            onDropOn(rootFolder, e);
          }}
        >
          <ul
            role="tree"
            aria-label={label ?? (rootFolder === "" ? "Files" : `Files in ${rootFolder}`)}
          >
            {shown.map((n) => (
              <TreeRow
                key={n.path}
                node={n}
                depth={0}
                expanded={expanded}
                toggle={toggle}
                projectFolders={projectFolders}
                forceOpen={filtering}
                onAction={onAction}
                onDropOn={onDropOn}
              />
            ))}
          </ul>
          {filtering && shown.length === 0 && (
            <p className="p-3 text-xs text-muted-foreground">No notes match “{filter.trim()}”.</p>
          )}
          {!filtering && nodes.length === 0 && emptyText !== undefined && (
            <p className="p-3 text-xs text-muted-foreground">{emptyText}</p>
          )}
        </div>
      </ContextMenuTrigger>
      <ContextMenuContent>
        <ContextMenuItem
          onSelect={() => {
            onAction({ kind: "newNote", folder: rootFolder });
          }}
        >
          New note
        </ContextMenuItem>
        <ContextMenuItem
          onSelect={() => {
            onAction({ kind: "newFolder", folder: rootFolder });
          }}
        >
          New folder
        </ContextMenuItem>
        <ContextMenuItem
          onSelect={() => {
            void useVaultStore.getState().createIndexPage(rootFolder);
          }}
        >
          {rootFolder === "" ? "Create index page for the whole vault" : "Create index page"}
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  );
}
