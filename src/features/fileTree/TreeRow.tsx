import { countNotes, displayName, findFolder, topLevelPaths, type RowProps } from "./treeUtils";
import { SkillsSubmenu } from "./SkillsSubmenu";
import { makeLinkIndex } from "@/lib/linkIndex";
import {
  ChevronDown,
  ChevronRight,
  Download,
  File,
  FileImage,
  FilePlus,
  FileText,
  Folder,
  FolderKanban,
  FolderOpen,
  FolderPlus,
  History,
  ListTree,
  Pencil,
  SquareArrowOutUpRight,
  Trash2,
} from "lucide-react";
import { useState } from "react";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuShortcut,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import { formatShortcut } from "@/lib/shortcuts";
import { api } from "@/lib/api";
import { openFile, openInSplit } from "@/lib/actions";
import { cn, dirname, isImage, isMarkdown } from "@/lib/utils";
import { reportError, useUiStore } from "@/stores/uiStore";
import { useTreeStore } from "@/stores/treeStore";
import { droppedPaths, moveBeside, moveStep } from "./treeMoves";
import { useVaultStore } from "@/stores/vaultStore";

/** Which part of the row the pointer is over: the top or bottom edge, or (for a folder) the middle. */
function dropZone(e: React.DragEvent, isDir: boolean): "before" | "after" | "into" {
  const r = e.currentTarget.getBoundingClientRect();
  const y = r.height > 0 ? (e.clientY - r.top) / r.height : 0.5;
  if (isDir) return y < 0.25 ? "before" : y > 0.75 ? "after" : "into";
  return y < 0.5 ? "before" : "after";
}

export function TreeRow({
  node,
  depth,
  expanded,
  toggle,
  projectFolders,
  forceOpen,
  onAction,
  onDropOn,
}: RowProps) {
  const activePath = useVaultStore((s) => s.activePath);
  const selectedPath = useVaultStore((s) => s.selectedPath);
  const select = useVaultStore((s) => s.select);
  const [dragOver, setDragOver] = useState(false);
  /** In "My own order": where a dragged item would land relative to this row. */
  const [zone, setZone] = useState<"before" | "after" | null>(null);
  const manual = useTreeStore((s) => s.sort === "manual" && s.filter.trim() === "");
  const multi = useTreeStore((s) => s.multi);
  const ticked = multi.has(node.path);
  const isOpen = forceOpen || expanded.has(node.path);
  const isProject = node.isDir && projectFolders.includes(node.path);
  const selected =
    ticked ||
    (multi.size === 0 && (selectedPath === node.path || (!node.isDir && activePath === node.path)));
  /** What the menu and the keys act on when this row is one of several ticked items. */
  const targets = ticked && multi.size > 1 ? topLevelPaths([...multi]) : null;
  const container = node.isDir ? node.path : dirname(node.path);
  /** The notes and folders a skill from the AI menu would run on (images and files are left out). */
  const skillTargets = (): { path: string; isDir: boolean }[] | null => {
    const tree = useVaultStore.getState().tree;
    const picked = targets ?? [node.path];
    const items = picked.map((path) => ({ path, isDir: findFolder(tree, path) !== null }));
    return items.every((i) => i.isDir || isMarkdown(i.path)) ? items : null;
  };

  const Icon = node.isDir
    ? isProject
      ? FolderKanban
      : isOpen
        ? FolderOpen
        : Folder
    : isImage(node.name)
      ? FileImage
      : isMarkdown(node.name)
        ? FileText
        : File;

  const activate = (e?: { ctrlKey: boolean; metaKey: boolean; shiftKey: boolean }): void => {
    const tree = useTreeStore.getState();
    if (e && (e.ctrlKey || e.metaKey)) {
      // Tick or untick this item; the item selected before counts as ticked too.
      const next = new Set(tree.multi);
      if (next.size === 0 && selectedPath !== null) next.add(selectedPath);
      if (next.has(node.path)) next.delete(node.path);
      else next.add(node.path);
      tree.setMulti(next);
      select(node.path);
      return;
    }
    if (e?.shiftKey && selectedPath !== null) {
      // Tick everything between the selected item and this one, as listed on screen.
      const rows = [...document.querySelectorAll("[data-tree-path]")].map((r) =>
        r.getAttribute("data-tree-path"),
      );
      const a = rows.indexOf(selectedPath);
      const b = rows.indexOf(node.path);
      if (a >= 0 && b >= 0) {
        const range = rows.slice(Math.min(a, b), Math.max(a, b) + 1);
        tree.setMulti(range.filter((p): p is string => p !== null));
        return;
      }
    }
    tree.clearMulti();
    select(node.path);
    if (node.isDir) toggle(node.path);
    else void openFile(node.path);
  };

  return (
    <li role="none">
      <ContextMenu>
        <ContextMenuTrigger asChild>
          <div
            role="treeitem"
            aria-expanded={node.isDir ? isOpen : undefined}
            aria-selected={selected}
            tabIndex={0}
            draggable
            data-testid={`tree-${node.path}`}
            data-tree-path={node.path}
            className={cn(
              "flex cursor-default items-center gap-1 rounded px-1 py-[3px] text-[13px] outline-none hover:bg-muted focus-visible:ring-1 focus-visible:ring-ring",
              selected && "bg-accent text-accent-foreground",
              dragOver && "ring-1 ring-primary",
              zone === "before" && "shadow-[inset_0_2px_0_0_var(--color-primary)]",
              zone === "after" && "shadow-[inset_0_-2px_0_0_var(--color-primary)]",
            )}
            style={{ paddingLeft: 4 + depth * 14 }}
            onClick={activate}
            onKeyDown={(e) => {
              if (e.key === "Enter") activate();
              else if (e.key === "F2") onAction({ kind: "rename", node });
              else if (e.key === "Delete") {
                onAction(
                  targets ? { kind: "deleteMany", paths: targets } : { kind: "delete", node },
                );
              } else if (e.key === "Escape") useTreeStore.getState().clearMulti();
              else if (manual && e.altKey && (e.key === "ArrowUp" || e.key === "ArrowDown")) {
                e.preventDefault();
                void moveStep(node.path, e.key === "ArrowUp" ? -1 : 1).catch(reportError);
              }
            }}
            onContextMenu={() => {
              // Right-clicking outside the ticked items goes back to a single item.
              if (!ticked) useTreeStore.getState().clearMulti();
              select(node.path);
            }}
            onDragStart={(e) => {
              e.dataTransfer.setData("application/x-mimer-path", node.path);
              if (targets) {
                e.dataTransfer.setData("application/x-mimer-paths", JSON.stringify(targets));
              }
              e.dataTransfer.effectAllowed = "move";
            }}
            onDragOver={(e) => {
              if (e.dataTransfer.types.includes("application/x-mimer-path")) {
                e.preventDefault();
                e.stopPropagation();
                const z = manual ? dropZone(e, node.isDir) : null;
                setZone(z === "into" ? null : z);
                setDragOver(z === null || z === "into");
              }
            }}
            onDragLeave={() => {
              setDragOver(false);
              setZone(null);
            }}
            onDrop={(e) => {
              const z = manual ? dropZone(e, node.isDir) : null;
              setDragOver(false);
              setZone(null);
              e.stopPropagation();
              if (z === "before" || z === "after") {
                const paths = droppedPaths(e.dataTransfer);
                if (paths.length > 0) {
                  e.preventDefault();
                  void moveBeside(paths, node.path, z).catch(reportError);
                }
                return;
              }
              onDropOn(container, e);
            }}
          >
            {node.isDir ? (
              isOpen ? (
                <ChevronDown className="size-3.5 shrink-0 text-muted-foreground" />
              ) : (
                <ChevronRight className="size-3.5 shrink-0 text-muted-foreground" />
              )
            ) : (
              <span className="size-3.5 shrink-0" />
            )}
            <Icon
              className={cn(
                "size-4 shrink-0",
                isProject ? "text-primary" : "text-muted-foreground",
              )}
            />
            <span className={cn("truncate", isProject && "font-medium text-primary")}>
              {displayName(node)}
            </span>
            {node.isDir && countNotes(node) > 0 && (
              <span
                className="ml-auto shrink-0 pl-2 text-[11px] tabular-nums text-muted-foreground"
                title={`${String(countNotes(node))} notes`}
              >
                {countNotes(node)}
              </span>
            )}
          </div>
        </ContextMenuTrigger>
        <ContextMenuContent>
          {targets ? (
            <>
              <ContextMenuItem
                onSelect={() => {
                  onAction({ kind: "moveMany", paths: targets });
                }}
              >
                Move {targets.length} items to…
              </ContextMenuItem>
              <ContextMenuItem
                onSelect={() => {
                  onAction({ kind: "deleteMany", paths: targets });
                }}
              >
                Delete {targets.length} items
              </ContextMenuItem>
              {skillTargets() && <SkillsSubmenu targets={skillTargets() ?? []} />}
              <ContextMenuSeparator />
              <ContextMenuItem
                onSelect={() => {
                  useTreeStore.getState().clearMulti();
                }}
              >
                Clear selection
              </ContextMenuItem>
            </>
          ) : (
            <>
              {manual && (
                <>
                  <ContextMenuItem
                    onSelect={() => {
                      void moveStep(node.path, -1).catch(reportError);
                    }}
                  >
                    Move up
                  </ContextMenuItem>
                  <ContextMenuItem
                    onSelect={() => {
                      void moveStep(node.path, 1).catch(reportError);
                    }}
                  >
                    Move down
                  </ContextMenuItem>
                  <ContextMenuSeparator />
                </>
              )}
              <ContextMenuItem
                onSelect={() => {
                  onAction({ kind: "newNote", folder: container });
                }}
              >
                <FilePlus className="size-4" aria-hidden /> New note
                <ContextMenuShortcut>{formatShortcut("Mod+N")}</ContextMenuShortcut>
              </ContextMenuItem>
              <ContextMenuItem
                onSelect={() => {
                  onAction({ kind: "newFolder", folder: container });
                }}
              >
                <FolderPlus className="size-4" aria-hidden /> New folder
              </ContextMenuItem>
              <ContextMenuSeparator />
              {skillTargets() && <SkillsSubmenu targets={skillTargets() ?? []} />}
              {node.isDir && (
                <ContextMenuItem
                  title="A note with a link to every note in this folder. No AI is used."
                  onSelect={() => {
                    void makeLinkIndex(node.path);
                  }}
                >
                  <ListTree className="size-4" aria-hidden /> Make an index page
                </ContextMenuItem>
              )}
              <ContextMenuItem
                onSelect={() => {
                  onAction({ kind: "rename", node });
                }}
              >
                <Pencil className="size-4" aria-hidden /> Rename
                <ContextMenuShortcut>F2</ContextMenuShortcut>
              </ContextMenuItem>
              <ContextMenuItem
                className="text-destructive"
                onSelect={() => {
                  onAction({ kind: "delete", node });
                }}
              >
                <Trash2 className="size-4" aria-hidden /> Delete
                <ContextMenuShortcut>Del</ContextMenuShortcut>
              </ContextMenuItem>
              {node.isDir && (
                <>
                  <ContextMenuSeparator />
                  <ContextMenuItem
                    onSelect={() => {
                      void useVaultStore.getState().createIndexPage(node.path);
                    }}
                  >
                    <ListTree className="size-4" aria-hidden /> Create index page
                  </ContextMenuItem>
                  {isProject && (
                    <ContextMenuItem
                      onSelect={() => {
                        const project =
                          useVaultStore.getState().projects.find((p) => p.folder === node.path) ??
                          null;
                        useUiStore.getState().openProjectDialog({ folder: node.path, project });
                      }}
                    >
                      Project settings
                    </ContextMenuItem>
                  )}
                </>
              )}
              <ContextMenuItem
                onSelect={() => {
                  useUiStore.getState().openExportDialog({ path: node.path, isFolder: node.isDir });
                }}
              >
                <Download className="size-4" aria-hidden /> Export…
              </ContextMenuItem>
              {isMarkdown(node.name) && (
                <ContextMenuItem
                  onSelect={() => {
                    void openInSplit(node.path);
                  }}
                >
                  <SquareArrowOutUpRight className="size-4" aria-hidden /> Open in split view
                </ContextMenuItem>
              )}
              {isMarkdown(node.name) && (
                <ContextMenuItem
                  onSelect={() => {
                    void useVaultStore
                      .getState()
                      .openNote(node.path)
                      .then(() => {
                        useUiStore.getState().setRightTab("history");
                      });
                  }}
                >
                  <History className="size-4" aria-hidden /> Show history
                </ContextMenuItem>
              )}
              <ContextMenuSeparator />
              <ContextMenuItem
                onSelect={() => {
                  api.revealInFileManager(node.path).catch(reportError);
                }}
              >
                Reveal in file manager
              </ContextMenuItem>
            </>
          )}
        </ContextMenuContent>
      </ContextMenu>
      {node.isDir && isOpen && (
        <ul role="group">
          {node.children.map((c) => (
            <TreeRow
              key={c.path}
              node={c}
              depth={depth + 1}
              expanded={expanded}
              toggle={toggle}
              projectFolders={projectFolders}
              forceOpen={forceOpen}
              onAction={onAction}
              onDropOn={onDropOn}
            />
          ))}
        </ul>
      )}
    </li>
  );
}
