import { History as HistoryIcon, RotateCcw } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import type { CommitEntry } from "@/bindings/CommitEntry";
import { DiffView } from "@/components/DiffView";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api";
import { onCommitted } from "@/lib/events";
import { flushPendingWrites } from "@/lib/flush";
import { cn, relativeTime } from "@/lib/utils";
import { reportError, useUiStore } from "@/stores/uiStore";
import { useVaultStore } from "@/stores/vaultStore";

/** Commits that touched the current note, with a diff (old version → current) and restore. */
export function HistoryPanel() {
  const activePath = useVaultStore((s) => s.activePath);
  const [entries, setEntries] = useState<CommitEntry[]>([]);
  const [selected, setSelected] = useState<CommitEntry | null>(null);
  const [oldText, setOldText] = useState("");
  const [current, setCurrent] = useState("");
  const [nonce, setNonce] = useState(0);

  const refresh = useCallback(() => {
    setNonce((n) => n + 1);
  }, []);

  useEffect(() => {
    let unlisten: (() => void) | undefined;
    let disposed = false;
    void onCommitted(refresh).then((fn) => {
      if (disposed) fn();
      else unlisten = fn;
    });
    return () => {
      disposed = true;
      unlisten?.();
    };
  }, [refresh]);

  useEffect(() => {
    setSelected(null);
  }, [activePath]);

  useEffect(() => {
    if (activePath === null) {
      setEntries([]);
      return;
    }
    let cancelled = false;
    api
      .fileHistory(activePath)
      .then((e) => {
        if (!cancelled) setEntries(e);
      })
      .catch(reportError);
    return () => {
      cancelled = true;
    };
  }, [activePath, nonce]);

  useEffect(() => {
    if (!selected || activePath === null) return;
    const run = { cancelled: false };
    void (async () => {
      try {
        await flushPendingWrites();
        const [old, now] = await Promise.all([
          api.fileAtCommit(selected.path, selected.sha),
          api.readNote(activePath),
        ]);
        if (!run.cancelled) {
          setOldText(old);
          setCurrent(now.content);
        }
      } catch (e) {
        reportError(e);
      }
    })();
    return () => {
      run.cancelled = true;
    };
  }, [selected, activePath]);

  const restore = async (): Promise<void> => {
    if (!selected || activePath === null) return;
    try {
      await flushPendingWrites();
      await api.restoreFile(activePath, selected.sha);
      useVaultStore.setState((s) => ({ reloadNonce: s.reloadNonce + 1 }));
      useUiStore
        .getState()
        .toast(
          `Restored ${selected.shortSha}. The previous version is kept in history.`,
          "success",
        );
      setSelected(null);
      refresh();
    } catch (e) {
      reportError(e);
    }
  };

  if (activePath === null) {
    return <p className="p-3 text-xs text-muted-foreground">Open a note to see its history.</p>;
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <ul className={cn("overflow-auto", selected ? "max-h-[40%] border-b" : "flex-1")}>
        {entries.length === 0 && (
          <li className="p-3 text-xs text-muted-foreground">
            No saved versions yet. Press Ctrl/Cmd+S to save and commit this note.
          </li>
        )}
        {entries.map((e) => (
          <li key={e.sha}>
            <button
              type="button"
              className={cn(
                "w-full px-3 py-1.5 text-left hover:bg-muted",
                selected?.sha === e.sha && "bg-accent",
              )}
              onClick={() => {
                setSelected(e);
              }}
            >
              <div className="truncate text-[13px]">{e.message}</div>
              <div className="flex gap-2 text-[11px] text-muted-foreground">
                <span>{relativeTime(e.time)}</span>
                <code>{e.shortSha}</code>
              </div>
            </button>
          </li>
        ))}
      </ul>
      {selected && (
        <div className="flex min-h-0 flex-1 flex-col">
          <div className="flex items-center justify-between gap-2 border-b px-3 py-1.5">
            <span className="flex items-center gap-1 text-xs text-muted-foreground">
              <HistoryIcon className="size-3.5" /> {selected.shortSha} → current
            </span>
            <Button size="sm" variant="outline" onClick={() => void restore()}>
              <RotateCcw /> Restore this version
            </Button>
          </div>
          <div className="min-h-0 flex-1 overflow-auto">
            <DiffView original={oldText} modified={current} />
          </div>
        </div>
      )}
    </div>
  );
}
