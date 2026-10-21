import { useEffect, useState } from "react";
import { PromptDialog } from "@/components/PromptDialog";
import { nameProblem } from "@/lib/nameConflict";
import { useSettingsStore } from "@/stores/settingsStore";
import { reportError } from "@/stores/uiStore";
import { useVaultStore } from "@/stores/vaultStore";

interface Props {
  /** The folder the new vault is made in, or null when the dialog is closed. */
  parent: string | null;
  onClose: () => void;
}

/**
 * Asks for the name of a new vault, and whether Mimer should trace the work in the daily note.
 * The second choice is the same global setting as in Settings, set here so it need not be found
 * afterwards.
 */
export function NewVaultDialog({ parent, onClose }: Props) {
  const createVault = useVaultStore((s) => s.createVault);
  const settings = useSettingsStore((s) => s.settings);
  const save = useSettingsStore((s) => s.save);
  const [trace, setTrace] = useState(false);

  useEffect(() => {
    if (parent !== null) setTrace(settings?.editor.traceWork ?? false);
    // Only when the dialog opens: a change made while it is open is the user's.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [parent]);

  return (
    <PromptDialog
      open={parent !== null}
      title="Create new vault"
      label={`Vault name (a new folder inside ${parent ?? ""})`}
      confirmLabel="Create"
      validate={nameProblem}
      onCancel={onClose}
      onSubmit={(name) => {
        const p = parent;
        onClose();
        if (p === null) return;
        if (settings !== null && trace !== settings.editor.traceWork) {
          save({ ...settings, editor: { ...settings.editor, traceWork: trace } }).catch(
            reportError,
          );
        }
        void createVault(p, name.trim());
      }}
    >
      <label className="flex items-start gap-2 text-sm">
        <input
          type="checkbox"
          className="mt-1"
          checked={trace}
          onChange={(e) => {
            setTrace(e.target.checked);
          }}
        />
        <span>
          Trace my work in today's daily note
          <span className="block text-xs text-muted-foreground">
            One short line a day for each note you write in and each task you make, work on or
            finish. No AI is used. You can change this later in Settings.
          </span>
        </span>
      </label>
    </PromptDialog>
  );
}
