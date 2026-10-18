import { useActiveAi } from "@/features/chat/useActiveAi";
import { appVersion, buildDateLabel, releaseStage } from "@/lib/version";
import { saveStatusLabel, useFocusedSaveStatus } from "@/stores/editorStore";
import { AiChip } from "./AiChip";

/** Save status · project · AI chip · app version. */
export function StatusBar() {
  const status = useFocusedSaveStatus();
  const { project } = useActiveAi();
  return (
    <footer className="flex h-6 shrink-0 items-center gap-4 border-t bg-sidebar px-3 text-[11px] text-muted-foreground">
      <span role="status" data-testid="save-status">
        {saveStatusLabel(status)}
      </span>
      <span className="truncate">{project ? `Project: ${project.name}` : "No project"}</span>
      <span className="ml-auto">
        <AiChip />
      </span>
      <span data-testid="app-version" title={`Mimer ${appVersion}, built ${buildDateLabel()}`}>
        v{appVersion} {releaseStage}
      </span>
    </footer>
  );
}
