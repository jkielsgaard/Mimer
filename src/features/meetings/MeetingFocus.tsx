import { Check, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { MarkdownField } from "@/features/editor/MarkdownField";
import { CapturePicker } from "@/features/capture/CapturePicker";
import { api } from "@/lib/api";
import { flushPendingWrites } from "@/lib/flush";
import {
  actionsOf,
  addAction,
  addDecision,
  addItem,
  decisionsOf,
  markAction,
  markItem,
  meetingNotesText,
  parseMeeting,
  removeDecision,
  setMeetingNotes,
  setMeetingParts,
} from "@/lib/meeting";
import { todayIso } from "@/lib/taskLogic";
import { cn } from "@/lib/utils";
import { useMeetingStore } from "@/stores/meetingStore";
import { reportError, useUiStore } from "@/stores/uiStore";
import { PlainButton } from "@/components/ui/plain-button";
import { InlineInput } from "@/components/ui/inline-input";
import { PartsChoice } from "./PartsChoice";

/** A round-cornered tick box, the same for an agenda item and an action. */
function Tick({ done, label, onToggle }: { done: boolean; label: string; onToggle: () => void }) {
  return (
    <PlainButton
      type="button"
      role="checkbox"
      aria-checked={done}
      aria-label={label}
      className={cn(
        "flex size-[18px] shrink-0 items-center justify-center rounded-[5px] border-2 border-muted-foreground bg-card focus-visible:ring-2 focus-visible:ring-ring",
        done && "border-primary bg-primary text-primary-foreground",
      )}
      onClick={onToggle}
    >
      {done && <Check className="size-3" aria-hidden />}
    </PlainButton>
  );
}

/** A one-line box that adds what is typed when Enter is pressed. */
function AddBox({
  label,
  placeholder,
  onAdd,
}: {
  label: string;
  placeholder: string;
  onAdd: (text: string) => void;
}) {
  const [text, setText] = useState("");
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        const t = text.trim();
        if (t === "") return;
        setText("");
        onAdd(t);
      }}
    >
      <InlineInput
        aria-label={label}
        value={text}
        placeholder={placeholder}
        onChange={(e) => {
          setText(e.target.value);
        }}
        className="w-full rounded-md border border-dashed bg-background px-2.5 py-1.5 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      />
    </form>
  );
}

/**
 * A running meeting: the agenda (a checklist, with the item you are on marked) on the left, the
 * notes for the whole meeting in the middle with the decisions under them, the actions and the
 * write-it-down box on the right. The agenda, the decisions and the actions are parts a meeting
 * can leave out. Everything is written to the meeting's note as you go, and the note is an
 * ordinary note afterwards.
 */
export function MeetingFocus() {
  const path = useUiStore((s) => s.meetingFocus);
  const [content, setContent] = useState<string | null>(null);
  /** The agenda item you are on: only marked, it does not change what the notes show. */
  const [now, setNow] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [parked, setParked] = useState(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latest = useRef<{ path: string; content: string } | null>(null);

  /** Writes the note now (also what is waiting for the pause after typing). */
  const save = useCallback(async (): Promise<void> => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    const w = latest.current;
    if (!w) return;
    latest.current = null;
    try {
      await api.writeNote(w.path, w.content);
    } catch (e) {
      reportError(e);
    }
  }, []);

  /** Changes the note's text and writes it after a short pause. */
  const change = useCallback(
    (next: string): void => {
      setContent(next);
      if (path === null) return;
      latest.current = { path, content: next };
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => {
        void save();
      }, 600);
    },
    [path, save],
  );

  // Open: read the note, and mark the first agenda item that is not done.
  useEffect(() => {
    if (path === null) {
      setContent(null);
      return;
    }
    let live = true;
    setParked(0);
    void flushPendingWrites()
      .then(() => api.readNote(path))
      .then((n) => {
        if (!live) return;
        const m = parseMeeting(n.content);
        setContent(n.content);
        setNow((m.agenda.find((a) => !a.done) ?? m.agenda[0])?.text ?? null);
        setDraft(meetingNotesText(n.content));
      })
      .catch((e: unknown) => {
        reportError(e);
        useUiStore.getState().setMeetingFocus(null);
      });
    return () => {
      live = false;
    };
  }, [path]);

  const leave = useCallback((): void => {
    void save().then(() => {
      useUiStore.getState().setMeetingFocus(null);
      // What was written in the meeting shows in the Meetings area.
      void useMeetingStore.getState().load();
    });
  }, [save]);

  useEffect(() => {
    if (path === null) return;
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === "Escape") leave();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
    };
  }, [path, leave]);

  const meeting = useMemo(() => (content === null ? null : parseMeeting(content)), [content]);
  if (path === null || content === null || meeting === null) return null;

  const { parts } = meeting;
  const decisions = decisionsOf(content);
  const actions = actionsOf(content);

  const write = (text: string): void => {
    setDraft(text);
    change(setMeetingNotes(content, text));
  };

  return (
    <div
      role="dialog"
      aria-modal
      aria-label="Meeting"
      className="fixed inset-0 z-50 flex flex-col bg-background"
    >
      <div className="flex shrink-0 flex-wrap items-center gap-3 border-b bg-card px-6 py-3">
        <span className="section-label">Meeting</span>
        <h2 className="min-w-0 truncate text-base font-semibold">{meeting.title}</h2>
        {meeting.people.length > 0 && (
          <span className="truncate text-sm text-muted-foreground">
            with {meeting.people.join(", ")}
          </span>
        )}
        <span className="flex-1" />
        <PartsChoice
          compact
          value={parts}
          onChange={(next) => {
            change(setMeetingParts(content, next));
          }}
        />
        <Button size="sm" variant="outline" onClick={leave}>
          Leave meeting <kbd className="text-[10px] opacity-60">Esc</kbd>
        </Button>
      </div>
      <div
        className={cn(
          "grid min-h-0 flex-1 gap-6 overflow-auto px-6 py-5",
          parts.agenda
            ? "lg:grid-cols-[220px_minmax(0,1fr)_320px]"
            : "lg:grid-cols-[minmax(0,1fr)_320px]",
        )}
      >
        {parts.agenda && (
          <nav aria-label="Agenda" className="flex flex-col gap-1.5">
            <span className="section-label">Agenda</span>
            {meeting.agenda.length === 0 && (
              <p className="text-xs text-muted-foreground">No agenda. Add an item below.</p>
            )}
            {meeting.agenda.map((a) => (
              <div
                key={a.text}
                className={cn(
                  "-mx-2 flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm",
                  a.text === now && "bg-accent",
                )}
              >
                <Tick
                  done={a.done}
                  label={`${a.done ? "Mark as not done" : "Mark as done"}: ${a.text}`}
                  onToggle={() => {
                    change(markItem(content, a.text, !a.done));
                  }}
                />
                <PlainButton
                  type="button"
                  aria-current={a.text === now ? "step" : undefined}
                  className={cn(
                    "min-w-0 flex-1 truncate text-left",
                    a.done && "text-muted-foreground line-through",
                    a.text === now && "font-semibold",
                  )}
                  onClick={() => {
                    setNow(a.text);
                  }}
                >
                  {a.text}
                </PlainButton>
                {a.text === now && (
                  <span className="text-[11px] font-bold uppercase tracking-wider text-primary">
                    Now
                  </span>
                )}
              </div>
            ))}
            <AddBox
              label="Add an item to the agenda"
              placeholder="+ Add an item. Enter adds it."
              onAdd={(text) => {
                change(addItem(content, text));
                setNow(text);
              }}
            />
          </nav>
        )}

        <div className="flex min-w-0 flex-col gap-4">
          <div className="flex min-w-0 flex-col gap-2">
            <h3 className="section-label">Notes</h3>
            <MarkdownField
              label="Notes for the meeting"
              value={draft}
              autoFocus
              rows={12}
              maxRows={40}
              placeholder="Write while you talk."
              onChange={write}
              className="min-h-64 rounded-lg bg-card text-[15px]"
            />
          </div>
          {parts.decisions && (
            <div className="flex flex-col gap-1.5">
              <h3 className="section-label">Decisions</h3>
              <ul className="flex flex-col gap-1">
                {decisions.map((d) => (
                  <li
                    key={d}
                    className="flex items-center gap-2 rounded-md border bg-card px-2.5 py-1.5 text-sm"
                  >
                    <span aria-hidden className="text-primary">
                      ◆
                    </span>
                    <span className="min-w-0 flex-1">{d}</span>
                    <PlainButton
                      type="button"
                      aria-label={`Remove the decision: ${d}`}
                      className="text-muted-foreground hover:text-foreground"
                      onClick={() => {
                        change(removeDecision(content, d));
                      }}
                    >
                      <X className="size-3.5" aria-hidden />
                    </PlainButton>
                  </li>
                ))}
              </ul>
              <AddBox
                label="Add a decision"
                placeholder="+ Add a decision. Enter adds it."
                onAdd={(text) => {
                  change(addDecision(content, text));
                }}
              />
            </div>
          )}
        </div>

        <div className="flex min-w-0 flex-col gap-4">
          {parts.actions && (
            <div className="flex flex-col gap-1.5">
              <h3 className="section-label">Actions</h3>
              <ul className="flex flex-col gap-1">
                {actions.map((a) => (
                  <li key={a.raw} className="flex items-center gap-2 text-sm">
                    <Tick
                      done={a.done}
                      label={`${a.done ? "Mark as not done" : "Mark as done"}: ${a.text}`}
                      onToggle={() => {
                        change(markAction(content, a.raw, !a.done));
                      }}
                    />
                    <span className={cn(a.done && "text-muted-foreground line-through")}>
                      {a.text}
                    </span>
                  </li>
                ))}
              </ul>
              <AddBox
                label="Add an action"
                placeholder="+ Add an action. Enter adds it."
                onAdd={(text) => {
                  change(addAction(content, text, todayIso()));
                }}
              />
              <p className="text-xs text-muted-foreground">
                An action is a task: it is in the note and in Tasks.
              </p>
            </div>
          )}
          <div className="flex flex-col gap-1.5">
            <span className="section-label">Something popped into your head?</span>
            <CapturePicker
              aroundNote={{ path, title: meeting.title }}
              onSaved={() => {
                setParked((n) => n + 1);
              }}
            />
            <p className="text-xs text-muted-foreground" aria-live="polite">
              {parked > 0
                ? `${String(parked)} written down. The meeting goes on.`
                : "It does not end up in the meeting's notes."}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
