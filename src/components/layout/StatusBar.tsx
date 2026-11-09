import { useActiveAi } from "@/features/chat/useActiveAi";
import { backupWarning } from "@/lib/backup";
import { useSettingsStore } from "@/stores/settingsStore";
import { useUiStore } from "@/stores/uiStore";
import { useVaultStore } from "@/stores/vaultStore";
import { appVersion, buildDateLabel, releaseStage } from "@/lib/version";
import { saveStatusLabel, useFocusedSaveStatus } from "@/stores/editorStore";
import { AiChip } from "./AiChip";
import { PlainButton } from "@/components/ui/plain-button";
import { SpellingToggle } from "./SpellingToggle";

/** Save status · project · AI chip · app version. */
export function StatusBar() {
  const status = useFocusedSaveStatus();
  const { project } = useActiveAi();
  const vault = useVaultStore((s) => s.vault);
  const backups = useSettingsStore((s) => s.settings?.backups);
  const warning = vault ? backupWarning(backups?.[vault.path]) : null;
  return (
    <footer className="flex h-6 shrink-0 items-center gap-4 border-t bg-sidebar px-3 text-[11px] text-muted-foreground">
      <span role="status" data-testid="save-status">
        {saveStatusLabel(status)}
      </span>
      <span className="truncate">{project ? `Project: ${project.name}` : "No project"}</span>
      {warning !== null && (
        <PlainButton
          type="button"
          className="text-warning underline-offset-2 hover:underline"
          title="Open the backup settings"
          onClick={() => {
            useUiStore.getState().openVaultSettings();
          }}
        >
          {warning}
        </PlainButton>
      )}
      <span className="ml-auto">
        <SpellingToggle />
      </span>
      <span>
        <AiChip />
      </span>
      <span data-testid="app-version" title={`Mimer ${appVersion}, built ${buildDateLabel()}`}>
        v{appVersion} {releaseStage}
      </span>
    </footer>
  );
}
