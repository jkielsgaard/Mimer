import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

/**
 * "Send your notes to a cloud AI?": what leaves the computer, whose terms apply, and a box the
 * user must tick before the cloud AI can be turned on.
 */
export function CloudConsentDialog({
  open,
  providerName,
  onCancel,
  onConfirm,
}: {
  open: boolean;
  providerName: string;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const [agreed, setAgreed] = useState(false);
  const close = () => {
    setAgreed(false);
    onCancel();
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
          <DialogTitle className="text-base font-semibold">
            Send your notes to a cloud AI?
          </DialogTitle>
          <DialogDescription className="text-sm text-foreground/80">
            With <strong className="text-foreground">{providerName}</strong> as Mimer's AI,
            everything the AI works on leaves this computer and goes to that company:
          </DialogDescription>
        </DialogHeader>
        <ul className="list-disc space-y-0.5 pl-5 text-sm text-foreground/80">
          <li>the open note and the text you select,</li>
          <li>notes the chat searches and reads,</li>
          <li>your questions and the chat history.</li>
        </ul>
        <p className="text-sm text-foreground/80">
          What the company does with it is up to its terms, not Mimer. Check that you may send these
          notes there, for example under your employer's rules. Projects marked Local AI only never
          use it.
        </p>
        <label className="flex items-start gap-2.5 rounded-md bg-warning/15 p-3 text-sm">
          <input
            type="checkbox"
            className="mt-1"
            checked={agreed}
            onChange={(e) => {
              setAgreed(e.target.checked);
            }}
          />
          <span>
            I understand that my notes are sent to {providerName}, and that this is my
            responsibility.
          </span>
        </label>
        <DialogFooter>
          <Button variant="outline" onClick={close}>
            Keep the AI on this computer
          </Button>
          <Button
            disabled={!agreed}
            className="bg-warning text-white hover:bg-warning/90"
            onClick={() => {
              setAgreed(false);
              onConfirm();
            }}
          >
            Use the cloud AI
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
