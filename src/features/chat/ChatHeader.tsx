import { Plus, X } from "lucide-react";
import { BetaBadge } from "@/components/BetaBadge";
import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { PlainButton } from "@/components/ui/plain-button";

/** The top of the chat: its own buttons (the chat history, then New chat), and × in the window. */
export function ChatHeader({
  onNew,
  onClose,
  children,
}: {
  onNew: () => void;
  /** Shows a × at the end of the row (the chat as a window). */
  onClose?: () => void;
  children?: ReactNode;
}) {
  return (
    <div className="flex h-9 shrink-0 items-center gap-1 border-b px-3">
      <span className="flex items-center gap-1.5 text-xs font-semibold">
        Ask about my notes <BetaBadge />
      </span>
      <span className="flex-1" />
      {children}
      <Button size="sm" variant="ghost" onClick={onNew} aria-label="New chat">
        <Plus /> New chat
      </Button>
      {onClose && (
        <PlainButton
          type="button"
          aria-label="Close the chat"
          className="rounded p-1 hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring"
          onClick={onClose}
        >
          <X className="size-4" />
        </PlainButton>
      )}
    </div>
  );
}
