import {
  ArrowDownUp,
  CalendarDays,
  Check,
  ChevronsDownUp,
  Crosshair,
  FilePlus,
  FolderOpen,
  FolderPlus,
  MoreHorizontal,
  Plus,
  Users,
  Zap,
} from "lucide-react";
import { useState } from "react";
import { PromptDialog } from "@/components/PromptDialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { newNoteInCurrentFolder, openDailyNote, revealInTree } from "@/lib/actions";
import { formatShortcut } from "@/lib/shortcuts";
import { useNarrow } from "@/lib/useNarrow";
import { nameError } from "@/lib/nameConflict";
import { useTreeStore } from "@/stores/treeStore";
import { useUiStore } from "@/stores/uiStore";
import { currentFolder, useVaultStore } from "@/stores/vaultStore";

const iconButton = "rounded p-1 hover:bg-muted disabled:opacity-40 disabled:hover:bg-transparent";

/** Below this width the tree tools go into a "More" menu, so nothing is cut off at the edge. */
const NARROW = 280;

const SORTS: { id: "name" | "modified" | "manual"; label: string }[] = [
  { id: "name", label: "Name" },
  { id: "modified", label: "Last changed" },
  { id: "manual", label: "My own order" },
];

type Asking = "folder" | null;

/**
 * The row above the file tree: one New menu (note, meeting note, quick note, folder, project),
 * collapse all, show the open note, sort, quick open and search.
 */
export function TreeToolbar() {
  const activePath = useVaultStore((s) => s.activePath);
  const sort = useTreeStore((s) => s.sort);
  const setSort = useTreeStore((s) => s.setSort);
  const [asking, setAsking] = useState<Asking>(null);
  const { ref, narrow } = useNarrow<HTMLDivElement>(NARROW);

  const folder = (): string => {
    const v = useVaultStore.getState();
    return currentFolder(v) || (v.vault?.config.newNoteFolder ?? "");
  };

  const makeFolder = async (name: string): Promise<void> => {
    const v = useVaultStore.getState();
    const parent = currentFolder(v);
    const path = await v.createFolder(parent, name);
    if (path === null) return;
    useTreeStore.getState().expand(parent === "" ? path : parent);
  };

  return (
    <div
      ref={ref}
      className="flex h-9 shrink-0 items-center gap-1 border-b px-3 text-muted-foreground"
    >
      <h2 className="flex-1 truncate text-xs font-semibold text-foreground">Files</h2>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            className="inline-flex items-center gap-1 rounded bg-primary px-2 py-1 text-xs font-medium text-primary-foreground hover:opacity-90"
            aria-label="New"
            title="Create a note, folder or project"
          >
            <Plus className="size-3.5" /> New
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-60">
          <DropdownMenuItem
            onSelect={() => {
              newNoteInCurrentFolder();
            }}
          >
            <span className="flex items-center gap-2">
              <FilePlus className="size-4" /> Note
            </span>
            <span className="text-xs text-muted-foreground">{formatShortcut("Mod+N")}</span>
          </DropdownMenuItem>
          <DropdownMenuItem
            className="justify-start gap-2"
            onSelect={() => {
              useUiStore.getState().setMeetingFormOpen(true);
            }}
          >
            <Users className="size-4" /> Meeting note…
          </DropdownMenuItem>
          <DropdownMenuItem
            className="justify-start gap-2"
            onSelect={() => {
              useUiStore.getState().openCapture("note");
            }}
          >
            <Zap className="size-4" /> Quick note
            <span className="ml-auto text-xs text-muted-foreground">
              {formatShortcut("Mod+Shift+N")}
            </span>
          </DropdownMenuItem>
          <DropdownMenuItem
            className="justify-start gap-2"
            onSelect={() => {
              void openDailyNote();
            }}
          >
            <CalendarDays className="size-4" /> Today's daily note
            <span className="ml-auto text-xs text-muted-foreground">
              {formatShortcut("Mod+Shift+D")}
            </span>
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            className="justify-start gap-2"
            onSelect={() => {
              setAsking("folder");
            }}
          >
            <FolderPlus className="size-4" /> Folder…
          </DropdownMenuItem>
          <DropdownMenuItem
            className="justify-start gap-2"
            onSelect={() => {
              // A project is always a new folder in the vault root: its window asks for the name.
              useUiStore.getState().openProjectDialog({ folder: "", project: null });
            }}
          >
            <FolderOpen className="size-4" /> Project…
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      {narrow ? (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button type="button" className={iconButton} aria-label="More" title="More">
              <MoreHorizontal className="size-4" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem
              onSelect={() => {
                useTreeStore.getState().collapseAll();
              }}
            >
              <ChevronsDownUp className="size-4" /> Collapse all folders
            </DropdownMenuItem>
            <DropdownMenuItem
              disabled={activePath === null}
              onSelect={() => {
                if (activePath !== null) revealInTree(activePath);
              }}
            >
              <Crosshair className="size-4" /> Show the open note in the tree
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuLabel>Sort</DropdownMenuLabel>
            {SORTS.map((o) => (
              <DropdownMenuItem
                key={o.id}
                onSelect={() => {
                  setSort(o.id);
                }}
              >
                {o.label} {sort === o.id && <Check className="size-4" aria-label="Selected" />}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      ) : (
        <>
          <span className="mx-0.5 h-4 w-px bg-border" aria-hidden />
          <button
            type="button"
            className={iconButton}
            aria-label="Collapse all folders"
            title="Collapse all folders"
            onClick={() => {
              useTreeStore.getState().collapseAll();
            }}
          >
            <ChevronsDownUp className="size-4" />
          </button>
          <button
            type="button"
            className={iconButton}
            aria-label="Show the open note in the tree"
            title="Show the open note in the tree"
            disabled={activePath === null}
            onClick={() => {
              if (activePath !== null) revealInTree(activePath);
            }}
          >
            <Crosshair className="size-4" />
          </button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button type="button" className={iconButton} aria-label="Sort" title="Sort the notes">
                <ArrowDownUp className="size-4" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start">
              <DropdownMenuItem
                onSelect={() => {
                  setSort("name");
                }}
              >
                Name {sort === "name" && <Check className="size-4" aria-label="Selected" />}
              </DropdownMenuItem>
              <DropdownMenuItem
                onSelect={() => {
                  setSort("modified");
                }}
              >
                Last changed{" "}
                {sort === "modified" && <Check className="size-4" aria-label="Selected" />}
              </DropdownMenuItem>
              <DropdownMenuItem
                onSelect={() => {
                  setSort("manual");
                }}
              >
                My own order{" "}
                {sort === "manual" && <Check className="size-4" aria-label="Selected" />}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <span className="mx-0.5 h-4 w-px bg-border" aria-hidden />
        </>
      )}

      <PromptDialog
        open={asking === "folder"}
        title="New folder"
        label="Folder name"
        confirmLabel="Create"
        validate={(v) => {
          const state = useVaultStore.getState();
          return nameError(state.tree, state.projects, currentFolder(state), v, true);
        }}
        onCancel={() => {
          setAsking(null);
        }}
        onSubmit={(name) => {
          setAsking(null);
          void makeFolder(name.trim());
        }}
      />
      <span className="sr-only">
        {folder() === "" ? "Creating in the vault root" : `Creating in ${folder()}`}
      </span>
    </div>
  );
}
