import { History, Image, Link2, ListTree, MessageSquare } from "lucide-react";
import { cn } from "@/lib/utils";
import { useChatStore } from "@/stores/chatStore";
import { type RightTab, useUiStore } from "@/stores/uiStore";

const PANELS: { id: RightTab; label: string; Icon: typeof ListTree }[] = [
  { id: "outline", label: "Outline", Icon: ListTree },
  { id: "links", label: "Links", Icon: Link2 },
  { id: "history", label: "History", Icon: History },
  { id: "images", label: "Images", Icon: Image },
];

const BUTTON =
  "relative flex size-8 items-center justify-center rounded-md text-muted-foreground outline-none hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring";

/**
 * The narrow bar of icons at the right edge. The first ones open a small panel about the open
 * note (pressing the icon again closes it); the last one opens the chat window.
 */
export function RightRail() {
  const tab = useUiStore((s) => s.rightTab);
  const collapsed = useUiStore((s) => s.rightCollapsed);
  const ask = useUiStore((s) => s.askOpen);
  const streaming = useChatStore((s) => s.streaming);
  return (
    <div className="flex w-11 shrink-0 flex-col items-center gap-1 border-l bg-sidebar py-2">
      <div
        role="tablist"
        aria-label="Note panels"
        aria-orientation="vertical"
        className="flex flex-col items-center gap-1"
      >
        {PANELS.map(({ id, label, Icon }) => {
          const on = tab === id && !collapsed;
          return (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={on}
              aria-label={label}
              title={label}
              className={cn(BUTTON, on && "bg-accent text-accent-foreground")}
              onClick={() => {
                const ui = useUiStore.getState();
                if (ui.rightTab === id && !ui.rightCollapsed) ui.toggleRight();
                else ui.setRightTab(id);
              }}
            >
              <Icon className="size-4" aria-hidden />
            </button>
          );
        })}
      </div>
      <span className="my-1 h-px w-6 bg-border" aria-hidden />
      <button
        type="button"
        aria-label="Ask about my notes"
        title="Ask about my notes (Ctrl/Cmd+L)"
        aria-pressed={ask}
        className={cn(BUTTON, ask && "bg-accent text-accent-foreground")}
        onClick={() => {
          const ui = useUiStore.getState();
          if (ui.askOpen) ui.setAskOpen(false);
          else ui.focusChat();
        }}
      >
        <MessageSquare className="size-4" aria-hidden />
        {streaming && (
          <span className="absolute right-1 top-1 size-2 rounded-full bg-primary" aria-hidden />
        )}
      </button>
    </div>
  );
}
