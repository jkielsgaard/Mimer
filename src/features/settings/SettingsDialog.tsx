import { Dialog } from "@/components/ui/dialog";
import { useSettingsStore } from "@/stores/settingsStore";
import { useUiStore } from "@/stores/uiStore";
import { SettingsContent } from "./SettingsContent";

/** Settings dialog: General, AI providers, AI, Version history and Vault. */
export function SettingsDialog() {
  const open = useUiStore((s) => s.settingsOpen);
  const setOpen = useUiStore((s) => s.setSettingsOpen);
  const stored = useSettingsStore((s) => s.settings);
  if (!stored) return null;
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      {open && (
        <SettingsContent
          stored={stored}
          onClose={() => {
            setOpen(false);
          }}
        />
      )}
    </Dialog>
  );
}
