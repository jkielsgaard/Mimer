import { Lock, Paperclip, Plus, Send, Square } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

import { folderNoteCounts } from "@/features/fileTree/treeUtils";
import { findMentionQuery, mentionCandidates, removeMentionQuery } from "@/lib/mentionQuery";
import { useChatStore } from "@/stores/chatStore";
import { useUiStore } from "@/stores/uiStore";
import { useVaultStore } from "@/stores/vaultStore";
import { useActiveAi } from "./useActiveAi";
import { ChatHistoryMenu } from "./ChatHistoryMenu";
import { PromptsMenu } from "./PromptsMenu";
import { TasksMenu } from "./TasksMenu";
import { Bubble } from "./Bubble";
import { MentionChips } from "./MentionChips";
import { MentionPicker } from "./MentionPicker";
import { InfoHint } from "@/components/InfoHint";

/** Right-panel "Mimer" tab: the chat with the assistant. */
export function ChatPanel() {
  const {
    messages,
    streaming,
    includeNote,
    draftMentions,
    send,
    stop,
    newChat,
    setIncludeNote,
    addMention,
    removeMention,
  } = useChatStore();
  const focusNonce = useUiStore((s) => s.focusChatNonce);
  const activePath = useVaultStore((s) => s.activePath);
  const { project, provider, localOnly } = useActiveAi();
  const files = useVaultStore((s) => s.files);
  const tree = useVaultStore((s) => s.tree);
  const folders = useMemo(() => folderNoteCounts(tree), [tree]);
  const [draft, setDraft] = useState("");
  const [caret, setCaret] = useState(0);
  const [active, setActive] = useState(0);
  /** Position of a `/` the user closed with Esc; it stays closed until the text changes. */
  const [dismissed, setDismissed] = useState<number | null>(null);
  const input = useRef<HTMLTextAreaElement>(null);
  const bottom = useRef<HTMLDivElement>(null);

  useEffect(() => {
    input.current?.focus();
  }, [focusNonce]);

  const vaultPath = useVaultStore((s) => s.vault?.path ?? null);
  const refreshChats = useChatStore((s) => s.refreshChats);
  useEffect(() => {
    if (vaultPath !== null) void refreshChats();
  }, [vaultPath, refreshChats]);

  useEffect(() => {
    bottom.current?.scrollIntoView({ block: "end" });
  }, [messages]);

  const slash = findMentionQuery(draft, caret);
  const pickerOpen = slash !== null && slash.start !== dismissed;
  const candidates = useMemo(
    () =>
      pickerOpen
        ? mentionCandidates(files, slash.query, project?.folder ?? null, draftMentions, 8, folders)
        : [],
    [pickerOpen, files, folders, slash?.query, project?.folder, draftMentions],
  );

  useEffect(() => {
    setActive(0);
  }, [slash?.query]);

  useEffect(() => {
    if (slash === null) setDismissed(null);
  }, [slash]);

  /** Attaches a note and removes the `/text` that was typed to find it. */
  const pick = (path: string): void => {
    addMention(path);
    if (slash !== null) {
      const next = removeMentionQuery(draft, slash, caret);
      setDraft(next.text);
      setCaret(next.caret);
      requestAnimationFrame(() => {
        input.current?.setSelectionRange(next.caret, next.caret);
      });
    }
    input.current?.focus();
  };

  /** The paperclip types the `/` for the user, so both ways use the same list. */
  const openPicker = (): void => {
    const el = input.current;
    const at = el?.selectionStart ?? draft.length;
    const lead = at > 0 && !/\s/.test(draft.charAt(at - 1)) ? " " : "";
    setDraft(draft.slice(0, at) + lead + "/" + draft.slice(at));
    setCaret(at + lead.length + 1);
    setDismissed(null);
    el?.focus();
  };

  const submit = (): void => {
    if (draft.trim() === "") return;
    const text = draft;
    setDraft("");
    void send(text);
  };

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex items-center gap-2 border-b px-3 py-2 text-xs">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1 font-medium">
            <span className="truncate">{project?.name ?? "Vault"}</span>
            {localOnly && (
              <Lock className="size-3 shrink-0 text-success" aria-label="Local AI only" />
            )}
          </div>
          <div className="truncate text-muted-foreground">
            {provider
              ? `${provider.name}${provider.model ? ` · ${provider.model}` : " · no model selected"}`
              : "No provider"}
          </div>
        </div>
        <ChatHistoryMenu />
        <Button size="sm" variant="ghost" onClick={newChat} aria-label="New chat">
          <Plus /> New chat
        </Button>
      </div>
      {provider && !provider.supportsTools && (
        <div className="border-b bg-warning/15 px-3 py-1.5 text-xs">
          This model does not support tools. Vault search and file changes are unavailable.
        </div>
      )}
      <div className="min-h-0 flex-1 space-y-3 overflow-auto p-3" aria-live="polite">
        {messages.length === 0 && (
          <p className="text-xs text-muted-foreground">
            Ask Mimer about your notes, or ask for edits. Proposed changes are always shown for your
            review before anything is written.
          </p>
        )}
        {messages.map((m) => (
          <Bubble key={m.id} m={m} />
        ))}
        <div ref={bottom} />
      </div>
      <div className="border-t p-2">
        <MentionChips paths={draftMentions} onRemove={removeMention} />
        <label className="mb-1 flex items-center gap-1.5 text-xs text-muted-foreground">
          <input
            type="checkbox"
            checked={includeNote}
            disabled={activePath === null}
            onChange={(e) => {
              setIncludeNote(e.target.checked);
            }}
          />
          Include current note
          <InfoHint
            label="Include current note"
            text="Lets Mimer read the note you have open. Turn it off for general questions. Type / in the box to attach other notes."
            topic="mimer"
          />
          <span className="ml-auto flex">
            <TasksMenu
              onInsert={(t) => {
                setDraft((d) => (d.trim() === "" ? t : `${d}\n${t}`));
                input.current?.focus();
              }}
            />
            <PromptsMenu
              draft={draft}
              onInsert={(t) => {
                setDraft((d) => (d.trim() === "" ? t : `${d}\n${t}`));
                input.current?.focus();
              }}
            />
          </span>
        </label>
        <div className="relative flex items-end gap-2">
          {pickerOpen && (
            <MentionPicker
              items={candidates}
              activeIndex={active}
              folders={folders}
              onPick={pick}
            />
          )}
          <Button
            variant="ghost"
            size="icon"
            aria-label="Attach a note or folder"
            title="Attach a note or folder (or type /)"
            disabled={streaming}
            onClick={openPicker}
          >
            <Paperclip />
          </Button>
          <Textarea
            ref={input}
            aria-label="Message Mimer"
            rows={2}
            className="max-h-40 min-h-12 resize-none"
            placeholder="Message Mimer…  (Enter to send, Shift+Enter for a new line)"
            value={draft}
            onChange={(e) => {
              setDraft(e.target.value);
              setCaret(e.target.selectionStart);
            }}
            onSelect={(e) => {
              setCaret(e.currentTarget.selectionStart);
            }}
            onKeyDown={(e) => {
              if (pickerOpen && !e.nativeEvent.isComposing) {
                if (e.key === "ArrowDown" || e.key === "ArrowUp") {
                  e.preventDefault();
                  if (candidates.length > 0) {
                    const step = e.key === "ArrowDown" ? 1 : -1;
                    setActive((a) => (a + step + candidates.length) % candidates.length);
                  }
                  return;
                }
                const chosen = candidates[active];
                if ((e.key === "Enter" || e.key === "Tab") && !e.shiftKey && chosen !== undefined) {
                  e.preventDefault();
                  pick(chosen);
                  return;
                }
                if (e.key === "Escape") {
                  e.preventDefault();
                  setDismissed(slash.start);
                  return;
                }
              }
              if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                e.preventDefault();
                submit();
              }
            }}
          />
          {streaming ? (
            <Button variant="destructive" size="icon" aria-label="Stop" onClick={() => void stop()}>
              <Square />
            </Button>
          ) : (
            <Button size="icon" aria-label="Send" disabled={draft.trim() === ""} onClick={submit}>
              <Send />
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
