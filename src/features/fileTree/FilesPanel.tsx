import { useMemo, useState } from "react";
import { InfoHint } from "@/components/InfoHint";
import { useVaultStore } from "@/stores/vaultStore";
import { FileTree } from "./FileTree";
import { ProjectsSection } from "./ProjectsSection";
import { RecentSection } from "./RecentSection";
import { TreeDialogs } from "./TreeDialogs";
import { TreeFilter } from "./TreeFilter";
import { TreeToolbar } from "./TreeToolbar";
import { withoutFolders, withoutImages, type Action } from "./treeUtils";

/** The whole Files tab: toolbar, filter, Recent, Projects and the file tree of everything else. */
export function FilesPanel() {
  const tree = useVaultStore((s) => s.tree);
  const projects = useVaultStore((s) => s.projects);
  const config = useVaultStore((s) => s.vault?.config);
  const attachments = config?.attachmentsFolder;
  const [action, setAction] = useState<Action | null>(null);
  const others = useMemo(
    () =>
      withoutFolders(withoutImages(tree), [
        ...projects.map((p) => p.folder),
        // Pictures are listed in the Images tab.
        ...(attachments ? [attachments] : []),
      ]),
    [tree, projects, attachments],
  );
  const pinned = useMemo(
    () => [config?.meetingsFolder, config?.quickNotesFolder].filter((f): f is string => !!f),
    [config?.meetingsFolder, config?.quickNotesFolder],
  );
  return (
    <div className="flex h-full min-h-0 flex-col">
      <TreeToolbar />
      <TreeFilter />
      <div className="min-h-0 flex-1 overflow-auto">
        <RecentSection />
        <ProjectsSection onAction={setAction} />
        <div className="flex items-center gap-1.5 px-2 pt-1.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
          All files
          <InfoHint
            label="The file tree"
            text="Everything that is not in a project. Meetings and Quick notes are kept at the top. Right-click a folder or a note for more, and drag notes to move them, also into a project."
            topic="start"
          />
        </div>
        <FileTree
          nodes={others}
          rootFolder=""
          pinned={pinned}
          className="min-h-full"
          emptyText={
            tree.length === 0
              ? "This vault has no notes yet. Right-click here to create one."
              : "Everything is in a project. Right-click here to create a note."
          }
          onAction={setAction}
        />
      </div>
      <TreeDialogs
        action={action}
        close={() => {
          setAction(null);
        }}
      />
    </div>
  );
}
