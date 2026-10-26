import { useEffect } from "react";
import { BetaBadge } from "@/components/BetaBadge";
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
import { betaNoticeSeen, markBetaNoticeSeen } from "./betaNotice";

/**
 * The first time Mimer starts: this is a first version and will change, and the AI part is beta.
 * "Got it" is remembered. Help → "About the AI beta" opens the same text again.
 */
export function BetaNoticeDialog() {
  const open = useUiStore((s) => s.betaNoticeOpen);
  const setOpen = useUiStore((s) => s.setBetaNoticeOpen);

  useEffect(() => {
    if (!betaNoticeSeen()) setOpen(true);
  }, [setOpen]);

  const close = (): void => {
    markBetaNoticeSeen();
    setOpen(false);
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) close();
      }}
    >
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="text-xl">Welcome to Mimer</DialogTitle>
          <DialogDescription className="text-sm text-foreground/80">
            This is the first version of Mimer, and things will change as it grows. Your notes stay
            plain Markdown files, and every change is kept in Git.
          </DialogDescription>
        </DialogHeader>
        <div className="rounded-md border border-warning/50 bg-warning/15 p-3 text-sm">
          <div className="mb-1 flex items-center gap-2 font-semibold">
            <BetaBadge /> The AI is still being built
          </div>
          <p>
            The chat, the text commands and the other AI help will change and can make mistakes.
            Everything else in Mimer works without AI.
          </p>
        </div>
        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => {
              close();
              useUiStore.getState().openHelp();
            }}
          >
            Read more
          </Button>
          <Button onClick={close}>Got it</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
