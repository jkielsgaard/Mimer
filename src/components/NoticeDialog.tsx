import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useUiStore } from "@/stores/uiStore";

/** A message the user has to read and close, for things that must not be overlooked. */
export function NoticeDialog() {
  const notice = useUiStore((s) => s.notice);
  const show = useUiStore((s) => s.showNotice);
  const close = (): void => {
    show(null);
  };
  return (
    <Dialog
      open={notice !== null}
      onOpenChange={(o) => {
        if (!o) close();
      }}
    >
      <DialogContent role="alertdialog">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base font-semibold">
            <AlertTriangle className="size-4 shrink-0 text-warning-foreground" aria-hidden />
            {notice?.title}
          </DialogTitle>
          <DialogDescription asChild>
            <div className="space-y-2 text-sm text-foreground">
              {notice?.details.map((d) => (
                <p key={d} className="font-medium">
                  {d}
                </p>
              ))}
              <p className="text-muted-foreground">{notice?.hint}</p>
            </div>
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button autoFocus onClick={close}>
            OK
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
