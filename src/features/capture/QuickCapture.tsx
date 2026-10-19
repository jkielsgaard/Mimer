import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { formatShortcut } from "@/lib/shortcuts";
import { useUiStore } from "@/stores/uiStore";
import { CaptureBox } from "./CaptureBox";

/** The write-it-down box that opens from anywhere. The note you are writing is not touched. */
export function QuickCapture() {
  const kind = useUiStore((s) => s.captureKind);
  const toast = useUiStore((s) => s.toast);
  return (
    <Dialog
      open={kind !== null}
      onOpenChange={(o) => {
        if (!o) useUiStore.getState().closeCapture();
      }}
    >
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Write it down</DialogTitle>
          <DialogDescription>
            Choose what it is, write it, and go on. Open it again with{" "}
            {formatShortcut("Mod+Shift+N")}.
          </DialogDescription>
        </DialogHeader>
        {kind !== null && (
          <CaptureBox
            autoFocus
            initialKind={kind}
            taskPlan="today"
            onSaved={(what) => {
              toast(`Saved ${what}.`, "success");
              useUiStore.getState().closeCapture();
            }}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}
