import * as DialogPrimitive from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import * as React from "react";
import { cn } from "@/lib/utils";

export const Dialog = DialogPrimitive.Root;
export const DialogTitle = DialogPrimitive.Title;
export const DialogDescription = DialogPrimitive.Description;

export function DialogContent({
  className,
  closeClassName,
  children,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Content> & {
  /** Extra classes for the × (for example to keep it visible on a picture). */
  closeClassName?: string;
}) {
  return (
    <DialogPrimitive.Portal>
      <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/50" />
      <DialogPrimitive.Content
        className={cn(
          "fixed left-1/2 top-1/2 z-50 flex max-h-[85vh] w-[92vw] max-w-md -translate-x-1/2 -translate-y-1/2 flex-col gap-3 rounded-lg border bg-card p-4 shadow-xl outline-none",
          className,
        )}
        {...props}
        // A dialog is drawn in a portal, but React still passes its mouse events up to the parents
        // it was written inside. A bar that keeps the focus in the editor (the toolbar) would then
        // stop every click in the dialog from focusing a box. The events stay in the dialog.
        onMouseDown={(e) => {
          props.onMouseDown?.(e);
          e.stopPropagation();
        }}
      >
        {children}
        <DialogPrimitive.Close
          aria-label="Close"
          className={cn(
            "absolute right-3 top-3 rounded-sm text-muted-foreground hover:text-foreground",
            closeClassName,
          )}
        >
          <X className="size-4" />
        </DialogPrimitive.Close>
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  );
}

export function DialogHeader({ className, ...props }: React.ComponentProps<"div">) {
  return <div className={cn("flex flex-col gap-1 pr-6", className)} {...props} />;
}

export function DialogFooter({ className, ...props }: React.ComponentProps<"div">) {
  return <div className={cn("flex flex-wrap justify-end gap-2 pt-1", className)} {...props} />;
}
