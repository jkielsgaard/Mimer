import { FolderInput } from "lucide-react";
import { useMemo } from "react";
import { Button } from "@/components/ui/button";
import { openFile } from "@/lib/actions";
import { noteTitle } from "@/lib/utils";
import { isNewNote, useSeen } from "@/stores/seenStore";
import { useVaultStore } from "@/stores/vaultStore";
import { FileTree } from "./FileTree";
import { SidebarSection } from "./SidebarSection";
import { landingNodes, newNotesIn, type Action } from "./treeUtils";

/**
 * The place new notes land: the folders for meetings, quick notes and epic tasks, kept together
 * above the projects, so they do not fill "All files". New notes are listed first, with a button
 * to move them to a project or a folder when they have a home.
 */
export function LandingSection({
  folders,
  onAction,
}: {
  folders: readonly string[];
  onAction: (a: Action) => void;
}) {
  const tree = useVaultStore((s) => s.tree);
  const seen = useSeen((s) => s.paths);
  const nodes = useMemo(() => landingNodes(tree, folders), [tree, folders]);
  const fresh = useMemo(
    () => newNotesIn(nodes).filter((n) => isNewNote(n.path, n.modified, seen)),
    [nodes, seen],
  );
  if (nodes.length === 0) return null;
  return (
    <SidebarSection title="Landing" storageKey="landing" count={fresh.length}>
      {fresh.length > 0 && (
        <ul aria-label="New notes" className="px-1 pb-1">
          {fresh.map((n) => (
            <li key={n.path} className="flex items-center gap-1 rounded px-2 py-0.5 hover:bg-muted">
              <span className="rounded bg-primary px-1 text-[9px] font-bold text-primary-foreground">
                NEW
              </span>
              <button
                type="button"
                title={n.path}
                className="min-w-0 flex-1 truncate text-left text-[13px]"
                onClick={() => {
                  void openFile(n.path);
                }}
              >
                {noteTitle(n.path)}
              </button>
              <Button
                size="icon"
                variant="ghost"
                className="size-6"
                aria-label={`Move ${noteTitle(n.path)} to…`}
                title="Move to a project or a folder"
                onClick={() => {
                  onAction({ kind: "moveMany", paths: [n.path] });
                }}
              >
                <FolderInput />
              </Button>
            </li>
          ))}
        </ul>
      )}
      <FileTree nodes={nodes} rootFolder="" label="Landing folders" onAction={onAction} />
    </SidebarSection>
  );
}
