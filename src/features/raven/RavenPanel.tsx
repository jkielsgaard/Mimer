import { Flag, Plus, Send, Square } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { PrivacyNote } from "@/features/chat/PrivacyNote";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { safeStorage } from "@/lib/safeStorage";
import { useRavenStore } from "@/stores/ravenStore";
import { reportAi } from "@/lib/reportAi";
import { reportError, useUiStore } from "@/stores/uiStore";
import { RavenBubble } from "./RavenBubble";
import { SaveAnswerDialog } from "./SaveAnswerDialog";
import { useRaven } from "./useRaven";

const NOTICE_KEY = "mimer.raven.noticeSeen";

/** Right-panel "Raven" tab: a chat with a cloud AI that has no access to the notes. */
export function RavenPanel() {
  const provider = useRaven();
  const { messages, streaming, draft, setDraft, send, stop, newChat } = useRavenStore();
  const focusNonce = useUiStore((s) => s.focusRavenNonce);
  const [noticeSeen, setNoticeSeen] = useState(() => safeStorage.getItem(NOTICE_KEY) === "1");
  const [saving, setSaving] = useState<string | null>(null);
  const input = useRef<HTMLTextAreaElement>(null);
  const bottom = useRef<HTMLDivElement>(null);

  useEffect(() => {
    input.current?.focus();
  }, [focusNonce]);

  useEffect(() => {
    bottom.current?.scrollIntoView({ block: "end" });
  }, [messages]);

  const submit = (): void => {
    if (draft.trim() === "" || !noticeSeen) return;
    void send(draft);
  };

  return (
    <div className="flex h-full min-h-0 flex-col">
      <PrivacyNote kind="cloud" providerName={provider?.name} />
      <div className="flex items-center gap-2 border-b px-3 py-2 text-xs">
        <div className="min-w-0 flex-1">
          <div className="font-medium">Raven</div>
          <div className="truncate text-muted-foreground">
            {provider
              ? `${provider.name}${provider.model ? ` · ${provider.model}` : " · no model selected"}`
              : "No cloud provider"}
          </div>
        </div>
        <Button
          size="icon"
          variant="ghost"
          aria-label="Report inappropriate AI content"
          title="Report inappropriate AI content"
          onClick={() => {
            reportAi("Raven").catch(reportError);
          }}
        >
          <Flag />
        </Button>
        <Button size="sm" variant="ghost" onClick={newChat} aria-label="New chat">
          <Plus /> New chat
        </Button>
      </div>
      {!noticeSeen && (
        <div
          role="alert"
          data-testid="raven-notice"
          className="space-y-2 border-b bg-warning/15 px-3 py-2 text-xs"
        >
          <p className="font-medium">Before you use Raven</p>
          <p>
            Everything you type here is sent to {provider?.name ?? "the cloud provider"}, and that
            company may keep it. Raven cannot see your notes. If you paste text from a note into
            this chat, that text leaves your computer: it is your own decision.
          </p>
          <Button
            size="sm"
            onClick={() => {
              safeStorage.setItem(NOTICE_KEY, "1");
              setNoticeSeen(true);
            }}
          >
            I understand
          </Button>
        </div>
      )}
      <div className="min-h-0 flex-1 space-y-3 overflow-auto p-3" aria-live="polite">
        {messages.length === 0 && (
          <p className="text-xs text-muted-foreground">
            Ask Raven for knowledge from outside your notes: facts, explanations, comparisons.
            Whether it can look things up on the internet depends on the provider and the model. To
            work on your own notes, ask Mimer in the other tab.
          </p>
        )}
        {messages.map((m) => (
          <RavenBubble key={m.id} m={m} onSave={setSaving} />
        ))}
        <div ref={bottom} />
      </div>
      <div className="border-t p-2">
        <div className="flex items-end gap-2">
          <Textarea
            ref={input}
            aria-label="Message Raven"
            rows={2}
            disabled={!noticeSeen}
            className="max-h-40 min-h-12 resize-none"
            placeholder="Message Raven…  (Enter to send, Shift+Enter for a new line)"
            value={draft}
            onChange={(e) => {
              setDraft(e.target.value);
            }}
            onKeyDown={(e) => {
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
            <Button
              size="icon"
              aria-label="Send"
              disabled={draft.trim() === "" || !noticeSeen}
              onClick={submit}
            >
              <Send />
            </Button>
          )}
        </div>
      </div>
      <SaveAnswerDialog
        answer={saving}
        onClose={() => {
          setSaving(null);
        }}
      />
    </div>
  );
}
