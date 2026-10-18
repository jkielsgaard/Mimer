import { Paperclip, Plus, Send, Sparkles, Square, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import type { Skill } from "@/bindings/Skill";
import { api } from "@/lib/api";
import { recentSkillIds } from "@/lib/recentSkills";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

import { folderNoteCounts } from "@/features/fileTree/treeUtils";
import { findMentionQuery, mentionCandidates, removeMentionQuery } from "@/lib/mentionQuery";
import { useChatStore } from "@/stores/chatStore";
import { useUiStore } from "@/stores/uiStore";
import { useVaultStore } from "@/stores/vaultStore";
import { useActiveAi } from "./useActiveAi";
import { ChatHistoryMenu } from "./ChatHistoryMenu";
import { FoundryBar } from "@/features/engine/FoundryBar";
import { EngineBar } from "@/features/engine/EngineBar";
import { useEngineStore } from "@/stores/engineStore";
import { useFoundryStore } from "@/stores/foundryStore";
import { AiSwitcher } from "./AiSwitcher";
import { PrivacyNote } from "./PrivacyNote";
import { PromptsMenu } from "./PromptsMenu";
import { localAiProblem } from "@/lib/skills";
import { SkillsMenu } from "./SkillsMenu";
import { Bubble } from "./Bubble";
import { MentionChips } from "./MentionChips";
import { MentionPicker } from "./MentionPicker";
import { InfoHint } from "@/components/InfoHint";

/** The skills offered as cards in an empty chat. */
const STARTERS = [
  "builtin:fix-spelling",
  "builtin:improve-structure",
  "builtin:summarise",
  "builtin:sort-into-folders",
];

/** Right-panel "Mimer" tab: the chat with the assistant. */
export function ChatPanel() {
  const {
    messages,
    streaming,
    includeNote,
    draftMentions,
    draftSkill,
    setDraftSkill,
    send,
    stop,
    newChat,
    setIncludeNote,
    addMention,
    removeMention,
  } = useChatStore();
  const focusNonce = useUiStore((s) => s.focusChatNonce);
  const activePath = useVaultStore((s) => s.activePath);
  const { project, provider } = useActiveAi();
  // With the built-in AI the model must be loaded (Mimer awake) before a message can be written.
  const engineState = useEngineStore((s) => s.status?.state);
  const foundryState = useFoundryStore((s) => s.status?.state);
  const locked =
    (provider?.kind === "builtin" && engineState !== "awake") ||
    (provider?.kind === "foundry_local" && foundryState !== "awake");
  const files = useVaultStore((s) => s.files);
  const tree = useVaultStore((s) => s.tree);
  const folders = useMemo(() => folderNoteCounts(tree), [tree]);
  const [draft, setDraft] = useState("");
  const [caret, setCaret] = useState(0);
  const [active, setActive] = useState(0);
  /** Position of a `/` the user closed with Esc; it stays closed until the text changes. */
  const [dismissed, setDismissed] = useState<number | null>(null);
  const input = useRef<HTMLTextAreaElement>(null);
  const [skills, setSkills] = useState<Skill[]>([]);
  useEffect(() => {
    api
      .listSkills()
      .then(setSkills)
      .catch(() => undefined);
  }, [draftSkill]);
  const recent = recentSkillIds()
    .map((id) => skills.find((s) => s.id === id))
    .filter((s): s is Skill => s !== undefined)
    .slice(0, 4);
  const starters = STARTERS.map((id) => skills.find((s) => s.id === id)).filter(
    (s): s is Skill => s !== undefined,
  );
  const chooseSkill = (s: Skill): void => {
    setDraftSkill(s);
    input.current?.focus();
  };
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
    if ((draft.trim() === "" && draftSkill === null) || locked) return;
    const text = draft;
    if (draftSkill === null) {
      setDraft("");
      void send(text);
      return;
    }
    // A skill works on notes, so a local AI must be running before it starts.
    void localAiProblem().then((problem) => {
      if (problem !== null) {
        useUiStore.getState().toast(problem, "error");
        return;
      }
      setDraft("");
      void send(text);
    });
  };

  return (
    <div className="flex h-full min-h-0 flex-col">
      <PrivacyNote kind="local" />
      {provider?.kind === "builtin" && <EngineBar />}
      {provider?.kind === "foundry_local" && <FoundryBar />}
      <div className="flex items-center gap-2 border-b px-3 py-2 text-xs">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1 font-medium">
            <span className="truncate">{project?.name ?? "Vault"}</span>
          </div>
          <AiSwitcher role="mimer" disabled={streaming} />
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
          <div className="flex flex-col gap-3">
            {starters.length > 0 && (
              <>
                <h3 className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                  What do you want done?
                </h3>
                <div className="grid grid-cols-2 gap-2">
                  {starters.map((s) => (
                    <button
                      key={s.id}
                      type="button"
                      className="flex flex-col gap-0.5 rounded-lg border bg-card px-3 py-2 text-left hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring"
                      onClick={() => {
                        chooseSkill(s);
                      }}
                    >
                      <span className="text-[13px] font-semibold">{s.name}</span>
                      <span className="text-[11px] text-muted-foreground">{s.description}</span>
                    </button>
                  ))}
                </div>
              </>
            )}
            <p className="text-xs text-muted-foreground">
              Or ask a question. Mimer only reads the notes you attach or open, and proposed changes
              are always shown for your review before anything is written.
            </p>
          </div>
        )}
        {messages.map((m) => (
          <Bubble key={m.id} m={m} />
        ))}
        <div ref={bottom} />
      </div>
      <div className="border-t p-2">
        {draftSkill && (
          <p
            className="mb-1 inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-xs"
            data-testid="draft-skill"
          >
            <Sparkles className="size-3" aria-hidden />
            <span>Skill: {draftSkill.name}</span>
            <button
              type="button"
              aria-label="Remove the skill"
              className="rounded-full p-0.5 hover:bg-background/60"
              onClick={() => {
                setDraftSkill(null);
              }}
            >
              <X className="size-3" />
            </button>
          </p>
        )}
        {recent.length > 0 && draftSkill === null && (
          <div className="mb-1 flex flex-wrap items-center gap-1" aria-label="Recent skills">
            <span className="text-[11px] text-muted-foreground">Recent</span>
            {recent.map((s) => (
              <button
                key={s.id}
                type="button"
                className="rounded-full border bg-card px-2 py-0.5 text-xs hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring"
                onClick={() => {
                  chooseSkill(s);
                }}
              >
                {s.name}
              </button>
            ))}
          </div>
        )}
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
            <SkillsMenu
              onChosen={() => {
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
            disabled={streaming || locked}
            onClick={openPicker}
          >
            <Paperclip />
          </Button>
          <Textarea
            ref={input}
            aria-label="Message Mimer"
            rows={2}
            disabled={locked}
            className="max-h-40 min-h-12 resize-none"
            placeholder={
              locked
                ? "Wake Mimer to start chatting"
                : draftSkill
                  ? "Extra instructions for the skill (optional). Enter to run it."
                  : "Message Mimer…  (Enter to send, Shift+Enter for a new line)"
            }
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
            <Button
              size="icon"
              aria-label="Send"
              disabled={(draft.trim() === "" && draftSkill === null) || locked}
              onClick={submit}
            >
              <Send />
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
