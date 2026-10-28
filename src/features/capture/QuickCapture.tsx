import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useUiStore } from "@/stores/uiStore";
import { CAPTURE_KINDS, CaptureBox, type CaptureKind } from "./CaptureBox";

const CHOICES: { kind: CaptureKind; key: string; label: string }[] = [
  { kind: "task", key: "t", label: "Task" },
  { kind: "idea", key: "i", label: "Idea" },
  { kind: "note", key: "n", label: "Quick note" },
];

/** Ctrl/Cmd+Shift+N without a kind: a small choice first, by button or by its letter. */
function Choose() {
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      const hit = CHOICES.find((c) => c.key === e.key.toLowerCase());
      if (!hit) return;
      e.preventDefault();
      useUiStore.getState().openCapture(hit.kind);
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
    };
  }, []);
  return (
    <div className="flex gap-2">
      {CHOICES.map((c) => (
        <Button
          key={c.kind}
          variant="outline"
          className="flex-1"
          autoFocus={c.kind === "task"}
          onClick={() => {
            useUiStore.getState().openCapture(c.kind);
          }}
        >
          <kbd className="rounded bg-muted px-1.5 text-xs font-bold uppercase">{c.key}</kbd>
          {c.label}
        </Button>
      ))}
    </div>
  );
}

/**
 * The window for writing one thing down: Quick note, New task or New idea, each its own box. Opened
 * without a kind (Ctrl/Cmd+Shift+N) it first asks which. The note you are writing is not touched.
 */
export function QuickCapture() {
  const kind = useUiStore((s) => s.captureKind);
  return (
    <Dialog
      open={kind !== null}
      onOpenChange={(o) => {
        if (!o) useUiStore.getState().closeCapture();
      }}
    >
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {kind === null || kind === "choose" ? "Write down a…" : CAPTURE_KINDS[kind].title}
          </DialogTitle>
          <DialogDescription>
            {kind === null || kind === "choose"
              ? "Press T, I or N, or choose below."
              : CAPTURE_KINDS[kind].help}
          </DialogDescription>
        </DialogHeader>
        {kind === "choose" && <Choose />}
        {kind !== null && kind !== "choose" && (
          <CaptureBox
            key={kind}
            kind={kind}
            autoFocus
            onSaved={(what, open) => {
              useUiStore
                .getState()
                .toast(`Saved ${what}.`, "success", { label: "Open", run: open });
              useUiStore.getState().closeCapture();
            }}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}
