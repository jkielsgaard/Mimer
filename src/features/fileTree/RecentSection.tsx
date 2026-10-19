import { FileText } from "lucide-react";
import { openFile } from "@/lib/actions";
import { basename, dirname } from "@/lib/utils";
import { useRecent } from "@/stores/recentStore";
import { useSettingsStore } from "@/stores/settingsStore";
import { useVaultStore } from "@/stores/vaultStore";
import { SidebarSection } from "./SidebarSection";
import { isManagedNote } from "./treeUtils";

/** The notes opened last, newest first. Hidden until there is one. */
export function RecentSection() {
  const remembered = useRecent((s) => s.paths);
  const limit = useSettingsStore((s) => s.settings?.editor.recentNotes ?? 4);
  const activePath = useVaultStore((s) => s.activePath);
  const paths = remembered.filter((p) => !isManagedNote(p)).slice(0, limit);
  if (paths.length === 0) return null;
  return (
    <SidebarSection title="Recent" storageKey="recent" count={paths.length}>
      <ul>
        {paths.map((p) => (
          <li key={p}>
            <button
              type="button"
              title={p}
              aria-current={activePath === p}
              className="flex w-full items-center gap-1.5 rounded px-3 py-[3px] text-left text-[13px] hover:bg-muted aria-[current=true]:bg-accent"
              onClick={() => {
                void openFile(p);
              }}
            >
              <FileText className="size-4 shrink-0 text-muted-foreground" />
              <span className="truncate">{basename(p).replace(/\.md$/i, "")}</span>
              {dirname(p) !== "" && (
                <span className="ml-auto truncate pl-2 text-[11px] text-muted-foreground">
                  {basename(dirname(p))}
                </span>
              )}
            </button>
          </li>
        ))}
      </ul>
    </SidebarSection>
  );
}
