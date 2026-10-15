import { AlertCircle } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";

interface Props {
  open: boolean;
  title: string;
  label?: string;
  initialValue?: string;
  confirmLabel?: string;
  /** Return an error message to keep the dialog open, or null to accept. It runs while typing. */
  validate?: (value: string) => string | null;
  onSubmit: (value: string) => void;
  onCancel: () => void;
}

/** Small "enter a name" dialog. */
export function PromptDialog({
  open,
  title,
  label,
  initialValue = "",
  confirmLabel = "OK",
  validate,
  onSubmit,
  onCancel,
}: Props) {
  const [value, setValue] = useState(initialValue);
  const [touched, setTouched] = useState(false);

  useEffect(() => {
    if (open) {
      setValue(initialValue);
      setTouched(false);
    }
  }, [open, initialValue]);

  // Checked while typing, so a name that cannot be used is explained before Create is pressed.
  const problem = validate ? validate(value) : null;
  // An empty box is not an error until the user has typed or pressed Create.
  const shown = problem !== null && (value.trim() !== "" || touched) ? problem : null;

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) onCancel();
      }}
    >
      <DialogContent>
        <form
          className="flex flex-col gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            setTouched(true);
            if (problem === null) onSubmit(value);
          }}
        >
          <DialogHeader>
            <DialogTitle className="text-base font-semibold">{title}</DialogTitle>
          </DialogHeader>
          {label && (
            <label className="text-xs text-muted-foreground" htmlFor="prompt-input">
              {label}
            </label>
          )}
          <Input
            id="prompt-input"
            autoFocus
            value={value}
            onChange={(e) => {
              setValue(e.target.value);
              setTouched(true);
            }}
            aria-invalid={shown !== null}
            onFocus={(e) => {
              e.currentTarget.select();
            }}
          />
          {shown && (
            <p
              role="alert"
              className="flex items-start gap-2 rounded-md border border-destructive/60 bg-destructive/10 px-3 py-2 text-sm font-medium text-destructive"
            >
              <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden />
              {shown}
            </p>
          )}
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={onCancel}>
              Cancel
            </Button>
            <Button type="submit" disabled={problem !== null}>
              {confirmLabel}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
