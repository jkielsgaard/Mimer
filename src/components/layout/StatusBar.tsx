import { useActiveAi } from "@/features/chat/useActiveAi";
import { useChatStore } from "@/stores/chatStore";
import { useEngineStore } from "@/stores/engineStore";
import { appVersion, buildDateLabel, releaseStage } from "@/lib/version";
import { saveStatusLabel, useFocusedSaveStatus } from "@/stores/editorStore";

/** Save status · project · provider/model · app version. */
export function StatusBar() {
  const status = useFocusedSaveStatus();
  const { project, provider } = useActiveAi();
  const working = useChatStore((s) => s.streaming);
  const engineState = useEngineStore((s) => s.status?.state);
  const builtinNote =
    provider?.kind === "builtin" ? (engineState === "awake" ? " · awake" : " · asleep") : "";
  return (
    <footer className="flex h-6 shrink-0 items-center gap-4 border-t bg-sidebar px-3 text-[11px] text-muted-foreground">
      <span role="status" data-testid="save-status">
        {saveStatusLabel(status)}
      </span>
      <span className="truncate">{project ? `Project: ${project.name}` : "No project"}</span>
      {working && (
        <span role="status" data-testid="ai-working" className="text-foreground">
          Mimer is working…
        </span>
      )}
      <span className="ml-auto flex items-center gap-1 truncate">
        {provider
          ? `${provider.name}${provider.kind === "builtin" ? "" : provider.model ? ` · ${provider.model}` : ""}${builtinNote}`
          : "No AI provider"}
      </span>
      <span data-testid="app-version" title={`Mimer ${appVersion}, built ${buildDateLabel()}`}>
        v{appVersion} {releaseStage}
      </span>
    </footer>
  );
}
