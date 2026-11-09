import { useState } from "react";
import type { VaultBackup } from "@/bindings/VaultBackup";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { api, toApiError } from "@/lib/api";
import { backupLabel } from "@/lib/backup";
import { pickFolder } from "@/lib/dialogs";
import { reportError } from "@/stores/uiStore";
import { useSettingsStore } from "@/stores/settingsStore";
import { useVaultStore } from "@/stores/vaultStore";

const NONE: VaultBackup = { folder: "", onClose: false, lastOk: null, lastError: null };

/**
 * Settings → Vault → Backup: a copy of the notes and their whole history in another folder (an
 * external disk, or a folder that is synchronised). What is chosen here is saved at once; it is
 * kept per computer and not in the vault, so a folder path never travels with the notes.
 */
export function BackupSettings() {
  const vault = useVaultStore((s) => s.vault);
  const settings = useSettingsStore((s) => s.settings);
  const [busy, setBusy] = useState(false);
  if (!vault || !settings) return null;
  const backup = settings.backups[vault.path] ?? NONE;

  const change = async (patch: Partial<VaultBackup>): Promise<void> => {
    const next = { ...backup, ...patch };
    await useSettingsStore
      .getState()
      .save({ ...settings, backups: { ...settings.backups, [vault.path]: next } })
      .catch((e: unknown) => {
        reportError(toApiError(e));
      });
  };

  const choose = async (): Promise<void> => {
    try {
      const folder = await pickFolder();
      if (folder) await change({ folder });
    } catch (e) {
      reportError(toApiError(e));
    }
  };

  const now = async (): Promise<void> => {
    setBusy(true);
    try {
      await api.backupNow();
    } catch {
      /* the reason is saved with the backup and shown below */
    }
    await useSettingsStore.getState().load();
    setBusy(false);
  };

  return (
    <section aria-label="Backup" className="flex flex-col gap-2 border-t pt-3">
      <h3 className="text-sm font-semibold">Backup</h3>
      <p className="text-xs text-muted-foreground">
        A copy of your notes and their whole history in another folder: an external disk, or a
        folder that is synced. Mimer sends nothing anywhere. To get the notes back, copy or clone
        the <code>.git</code> folder from the backup and open it as a vault.
      </p>
      <div className="flex flex-col gap-1">
        <Label htmlFor="backup-folder">Backup folder</Label>
        <div className="flex gap-2">
          <Input
            data-no-ai
            id="backup-folder"
            readOnly
            value={backup.folder}
            placeholder="No folder chosen"
          />
          <Button
            variant="outline"
            onClick={() => {
              void choose();
            }}
          >
            Choose…
          </Button>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <Button
          disabled={busy || backup.folder === ""}
          onClick={() => {
            void now();
          }}
        >
          Back up now
        </Button>
        <span className="text-sm" role="status">
          {backup.lastError !== null && backup.lastError !== "" ? (
            <span className="text-destructive">{backup.lastError}</span>
          ) : (
            backupLabel(backup.lastOk)
          )}
        </span>
      </div>
      <Label className="flex items-center gap-2 text-sm font-normal text-foreground">
        <Checkbox
          checked={backup.onClose}
          disabled={backup.folder === ""}
          onChange={(e) => {
            void change({ onClose: e.target.checked });
          }}
        />
        Back up when Mimer closes
      </Label>
      <p className="text-xs text-muted-foreground">
        Files that Git does not keep (the saved chats and the search index of meanings) are not in
        the backup.
      </p>
    </section>
  );
}
