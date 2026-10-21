import { ChatPanel } from "@/features/chat/ChatPanel";
import { useUiStore } from "@/stores/uiStore";

/**
 * The chat, as a window over the right side of the note instead of a column that is always there.
 * The note stays usable while it is open. Esc or × closes it; the chat is kept.
 */
export function AskWindow() {
  const open = useUiStore((s) => s.askOpen);
  if (!open) return null;
  return (
    <aside
      aria-label="Ask about my notes"
      className="fixed bottom-10 right-14 top-14 z-30 flex w-[440px] max-w-[calc(100vw-5rem)] flex-col overflow-hidden rounded-lg border bg-sidebar shadow-2xl"
      onKeyDown={(e) => {
        if (e.key === "Escape" && !e.defaultPrevented) useUiStore.getState().setAskOpen(false);
      }}
    >
      <ChatPanel
        onClose={() => {
          useUiStore.getState().setAskOpen(false);
        }}
      />
    </aside>
  );
}
