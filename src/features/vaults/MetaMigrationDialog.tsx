// TEMPORARY, for version 0.23 only: remove this file, its test, the mount in App.tsx and the Rust
// `meta::migrate` together in the version after it (see docs/DECISIONS.md).
import { useEffect, useState } from "react";
import type { MigrationCount } from "@/bindings/MigrationCount";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { api } from "@/lib/api";
import { usePinStore } from "@/features/start/useStartData";
import { useTaskStore } from "@/stores/taskStore";
import { reportError, useUiStore } from "@/stores/uiStore";
import { useVaultStore } from "@/stores/vaultStore";

function words(c: MigrationCount): string {
  const parts = [
    c.pinned > 0 ? `${String(c.pinned)} pinned note${c.pinned === 1 ? "" : "s"}` : null,
    c.tasks > 0 ? `${String(c.tasks)} task${c.tasks === 1 ? "" : "s"} that wait` : null,
  ].filter((p) => p !== null);
  return parts.join(" and ");
}

/**
 * When a vault is opened and some of Mimer's own bookkeeping is still written the old way in its
 * notes (a `pinned` tag, `for:` and `after:` on a task), asks if Mimer may move it to its own file
 * (`.vault/meta.json`). It keeps working either way in this version; the next one only reads the
 * new place, so a note that was not moved loses its pin and what its tasks wait for. Nothing is
 * moved before the person says yes, and the notes are committed first, so History has them as
 * they were.
 */
export function MetaMigrationDialog() {
  const root = useVaultStore((s) => s.vault?.path ?? null);
  const [count, setCount] = useState<MigrationCount | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setCount(null);
    if (root === null) return;
    let live = true;
    void Promise.resolve()
      .then(() => api.metaMigrationStatus())
      .then((c) => {
        if (live && (c.pinned > 0 || c.tasks > 0)) setCount(c);
      })
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, [root]);

  if (count === null) return null;

  const move = (): void => {
    setBusy(true);
    void api
      .metaMigrate()
      .then(async (done) => {
        await useTaskStore.getState().load();
        await usePinStore.getState().load();
        await useVaultStore.getState().refreshTree();
        useUiStore
          .getState()
          .toast(`Moved ${words(done)}. History has the notes as they were.`, "success");
        setCount(null);
      })
      .catch(reportError)
      .finally(() => {
        setBusy(false);
      });
  };

  return (
    <Dialog
      open
      onOpenChange={(o) => {
        if (!o && !busy) setCount(null);
      }}
    >
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Move what Mimer keeps to its own file?</DialogTitle>
          <DialogDescription>
            This vault has {words(count)} written the old way, inside the notes. Mimer now keeps
            them in its own file, <code>.vault/meta.json</code>, so your notes stay clean.
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-2 text-sm">
          <p>
            <b>Everything works the way it does now until you choose.</b> But the next version of
            Mimer only reads the new place: a note you have not moved loses its pin, and a task
            loses what it waits for.
          </p>
          <p className="text-muted-foreground">
            Your text is not changed. Only the tag <code>pinned</code> and the words{" "}
            <code>for:</code> and <code>after:</code> on a task line are taken out of the notes. The
            notes are saved in History first, so it can be undone.
          </p>
        </div>
        <DialogFooter>
          <Button
            variant="ghost"
            disabled={busy}
            onClick={() => {
              setCount(null);
            }}
          >
            Not now
          </Button>
          <Button disabled={busy} onClick={move}>
            {busy ? "Moving…" : "Move them now"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
