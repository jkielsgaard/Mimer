import { Plus } from "lucide-react";
import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";

/** The top of the chat: its own buttons (the chat history, then New chat). */
export function ChatHeader({ onNew, children }: { onNew: () => void; children?: ReactNode }) {
  return (
    <div className="flex h-9 shrink-0 items-center gap-1 border-b px-3">
      <span className="flex-1 text-xs font-semibold">Ask about my notes</span>
      {children}
      <Button size="sm" variant="ghost" onClick={onNew} aria-label="New chat">
        <Plus /> New chat
      </Button>
    </div>
  );
}
