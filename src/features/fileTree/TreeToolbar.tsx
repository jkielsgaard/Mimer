import {
  ArrowDownUp,
  Check,
  ChevronsDownUp,
  Crosshair,
  FilePlus,
  FolderOpen,
  FolderPlus,
  Plus,
  Search,
  Users,
  Zap,
} from "lucide-react";
import { useState } from "react";
import { PromptDialog } from "@/components/PromptDialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { newNoteInCurrentFolder, revealInTree } from "@/lib/actions";
import { formatShortcut } from "@/lib/shortcuts";
import { isInside } from "@/lib/utils";
import { useTreeStore } from "@/stores/treeStore";
import { useUiStore } from "@/stores/uiStore";
import { currentFolder, useVaultStore } from "@/stores/vaultStore";

const iconButton = "rounded p-1 hover:bg-muted disabled:opacity-40 disabled:hover:bg-transparent";

type Asking = "meeting" | "folder" | "project" | null;

/**
 * The row above the file tree: one New menu (note, meeting note, quick note, folder, project),
 * collapse all, show the open note, sort, quick open and search.
 */
export function TreeToolbar() {
  const activePath = useVaultStore((s) => s.activePath);
  const sort = useTreeStore((s) => s.sort);
  const setSort = useTreeStore((s) => s.setSort);
  const [asking, setAsking] = useState<Asking>(null);

  const folder = (): string => {
    const v = useVaultStore.getState();
    return currentFolder(v) || (v.vault?.config.newNoteFolder ?? "");
  };

  const makeFolder = async (name: string, asProject: boolean): Promise<void> => {
    const v = useVaultStore.getState();
    const parent = currentFolder(v);
    if (asProject && v.projects.some((p) => isInside(parent, p.folder))) {
      useUiStore
        .getState()
        .toast(
          "A project cannot be inside another project. Select a folder outside it first.",
          "error",
        );
      return;
    }
    const path = await v.createFolder(parent, name);
    if (path === null) return;
    useTreeStore.getState().expand(parent === "" ? path : parent);
    if (asProject) useUiStore.getState().openProjectDialog({ folder: path, project: null });
  };

  return (
    <div className="flex items-center gap-1 border-b px-2 py-1 text-muted-foreground">
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
              void newNoteInCurrentFolder();
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
              setAsking("meeting");
            }}
          >
            <Users className="size-4" /> Meeting note…
          </DropdownMenuItem>
          <DropdownMenuItem
            className="justify-start gap-2"
            onSelect={() => {
              void useVaultStore.getState().createStandardNote("quick");
            }}
          >
            <Zap className="size-4" /> Quick note
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
              setAsking("project");
            }}
          >
            <FolderOpen className="size-4" /> Project…
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

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
            Last changed {sort === "modified" && <Check className="size-4" aria-label="Selected" />}
          </DropdownMenuItem>
          <DropdownMenuItem
            onSelect={() => {
              setSort("manual");
            }}
          >
            My own order {sort === "manual" && <Check className="size-4" aria-label="Selected" />}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <span className="mx-0.5 h-4 w-px bg-border" aria-hidden />
      <button
        type="button"
        className={iconButton}
        aria-label="Quick open"
        title={`Quick open (${formatShortcut("Mod+P")})`}
        onClick={() => {
          useUiStore.getState().setQuickOpen(true);
        }}
      >
        <FolderOpen className="size-4" />
      </button>
      <button
        type="button"
        className={iconButton}
        aria-label="Search"
        title={`Search the vault (${formatShortcut("Mod+Shift+F")})`}
        onClick={() => {
          useUiStore.getState().focusSearch();
        }}
      >
        <Search className="size-4" />
      </button>

      <PromptDialog
        open={asking === "meeting"}
        title="New meeting note"
        label="Meeting title"
        initialValue="Meeting"
        confirmLabel="Create"
        validate={(v) => (v.trim() === "" ? "Enter a title" : null)}
        onCancel={() => {
          setAsking(null);
        }}
        onSubmit={(title) => {
          setAsking(null);
          void useVaultStore.getState().createStandardNote("meeting", title.trim());
        }}
      />
      <PromptDialog
        open={asking === "folder" || asking === "project"}
        title={asking === "project" ? "New project" : "New folder"}
        label={asking === "project" ? "Project folder name" : "Folder name"}
        confirmLabel="Create"
        validate={(v) =>
          v.trim() === "" || /[\\/:*?"<>|]/.test(v) ? "Enter a valid folder name" : null
        }
        onCancel={() => {
          setAsking(null);
        }}
        onSubmit={(name) => {
          const asProject = asking === "project";
          setAsking(null);
          void makeFolder(name.trim(), asProject);
        }}
      />
      <span className="sr-only">
        {folder() === "" ? "Creating in the vault root" : `Creating in ${folder()}`}
      </span>
    </div>
  );
}
