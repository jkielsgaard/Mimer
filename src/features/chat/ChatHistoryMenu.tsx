import { History, Trash2 } from "lucide-react";
import { useState } from "react";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { relativeTime } from "@/lib/utils";
import { useChatStore } from "@/stores/chatStore";

/** Lists saved chats of this vault; pick one to continue it, or delete. */
export function ChatHistoryMenu() {
  const chats = useChatStore((s) => s.chats);
  const chatId = useChatStore((s) => s.chatId);
  const streaming = useChatStore((s) => s.streaming);
  const openChat = useChatStore((s) => s.openChat);
  const deleteChat = useChatStore((s) => s.deleteChat);
  const deleteAllChats = useChatStore((s) => s.deleteAllChats);
  const [confirmAll, setConfirmAll] = useState(false);

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="sm" aria-label="Chat history" disabled={streaming}>
            <History /> History
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent className="max-h-80 w-72 overflow-auto">
          {chats.length === 0 && <DropdownMenuItem disabled>No earlier chats</DropdownMenuItem>}
          {chats.map((c) => (
            <DropdownMenuItem
              key={c.id}
              className={chatId === c.id ? "bg-accent" : undefined}
              onSelect={() => {
                void openChat(c.id);
              }}
            >
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[13px]">{c.title}</span>
                <span className="block text-[11px] text-muted-foreground">
                  {relativeTime(Date.parse(c.updatedAt) / 1000)} · {c.messageCount} messages
                </span>
              </span>
              <button
                type="button"
                aria-label="Delete chat"
                className="rounded p-1 text-muted-foreground hover:text-destructive"
                onClick={(e) => {
                  e.stopPropagation();
                  e.preventDefault();
                  void deleteChat(c.id);
                }}
              >
                <Trash2 className="size-3.5" />
              </button>
            </DropdownMenuItem>
          ))}
          {chats.length > 0 && <DropdownMenuSeparator />}
          <DropdownMenuItem
            disabled={chats.length === 0}
            onSelect={() => {
              setConfirmAll(true);
            }}
          >
            Delete all history…
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <ConfirmDialog
        open={confirmAll}
        title="Delete all chat history?"
        description="All saved chats in this vault will be deleted. This cannot be undone."
        confirmLabel="Delete all"
        destructive
        onCancel={() => {
          setConfirmAll(false);
        }}
        onConfirm={() => {
          setConfirmAll(false);
          void deleteAllChats();
        }}
      />
    </>
  );
}
