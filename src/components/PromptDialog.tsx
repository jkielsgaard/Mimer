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
  /** Return an error message to keep the dialog open, or null to accept. */
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
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setValue(initialValue);
      setError(null);
    }
  }, [open, initialValue]);

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
            const msg = validate ? validate(value) : null;
            if (msg) setError(msg);
            else onSubmit(value);
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
              setError(null);
            }}
            onFocus={(e) => {
              e.currentTarget.select();
            }}
          />
          {error && <p className="text-xs text-destructive">{error}</p>}
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={onCancel}>
              Cancel
            </Button>
            <Button type="submit">{confirmLabel}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
