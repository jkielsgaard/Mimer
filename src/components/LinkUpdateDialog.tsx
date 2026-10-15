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

/** "Update N links in M notes?" shown when renaming or moving a linked note. */
export function LinkUpdateDialog() {
  const prompt = useUiStore((s) => s.linkUpdate);
  const answer = useUiStore((s) => s.answerLinkUpdate);
  const n = prompt?.preview.linkCount ?? 0;
  const m = prompt?.preview.noteCount ?? 0;
  return (
    <Dialog
      open={prompt !== null}
      onOpenChange={(o) => {
        if (!o) answer("cancel");
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="text-base font-semibold">
            Update {n} link{n === 1 ? "" : "s"} in {m} note{m === 1 ? "" : "s"}?
          </DialogTitle>
          <DialogDescription className="text-sm text-muted-foreground">
            Other notes link to what you are renaming. Updating keeps those links working. All
            changes go in one commit, so they can be undone from the history.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button
            variant="ghost"
            onClick={() => {
              answer("cancel");
            }}
          >
            Cancel
          </Button>
          <Button
            variant="outline"
            onClick={() => {
              answer("skip");
            }}
          >
            Don’t update
          </Button>
          <Button
            autoFocus
            onClick={() => {
              answer("update");
            }}
          >
            Update links
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
