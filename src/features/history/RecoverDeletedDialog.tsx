import { useEffect, useState } from "react";
import type { DeletedFile } from "@/bindings/DeletedFile";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { api } from "@/lib/api";
import { relativeTime } from "@/lib/utils";
import { reportError, useUiStore } from "@/stores/uiStore";
import { useVaultStore } from "@/stores/vaultStore";

/** File → Recover deleted notes: files in history that are not in the vault any more. */
export function RecoverDeletedDialog() {
  const open = useUiStore((s) => s.recoverOpen);
  const setOpen = useUiStore((s) => s.setRecoverOpen);
  const [items, setItems] = useState<DeletedFile[] | null>(null);

  useEffect(() => {
    if (!open) return;
    setItems(null);
    api.deletedFiles().then(setItems).catch(reportError);
  }, [open]);

  const restore = async (f: DeletedFile): Promise<void> => {
    try {
      await api.restoreDeleted(f.path, f.sha);
      const vault = useVaultStore.getState();
      await vault.refreshTree();
      setItems((cur) => cur?.filter((x) => x.path !== f.path) ?? null);
      useUiStore.getState().toast(`Restored ${f.path}`, "success");
      if (/\.md$/i.test(f.path)) await vault.openNote(f.path);
    } catch (e) {
      reportError(e);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle className="text-base font-semibold">Recover deleted notes</DialogTitle>
          <DialogDescription className="text-sm text-muted-foreground">
            Files that existed in an earlier version but are not in your vault now.
          </DialogDescription>
        </DialogHeader>
        <div className="min-h-24 overflow-auto">
          {items === null && (
            <p className="text-sm text-muted-foreground">Looking through the history…</p>
          )}
          {items?.length === 0 && (
            <p className="text-sm text-muted-foreground">Nothing to recover.</p>
          )}
          <ul>
            {items?.map((f) => (
              <li key={f.path} className="flex items-center gap-2 border-b py-1.5 last:border-b-0">
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm">{f.path}</div>
                  <div className="truncate text-xs text-muted-foreground">
                    Last seen {relativeTime(f.time)} · {f.shortSha} · {f.message}
                  </div>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    void restore(f);
                  }}
                >
                  Restore
                </Button>
              </li>
            ))}
          </ul>
        </div>
      </DialogContent>
    </Dialog>
  );
}
