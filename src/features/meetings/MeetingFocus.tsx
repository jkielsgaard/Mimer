import { Check } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { MarkdownField } from "@/features/editor/MarkdownField";
import { CapturePicker } from "@/features/capture/CapturePicker";
import { api } from "@/lib/api";
import { flushPendingWrites } from "@/lib/flush";
import { addItem, GENERAL, itemNotes, markItem, parseMeeting, setItemNotes } from "@/lib/meeting";
import { cn } from "@/lib/utils";
import { useMeetingStore } from "@/stores/meetingStore";
import { reportError, useUiStore } from "@/stores/uiStore";
import { PlainButton } from "@/components/ui/plain-button";
import { InlineInput } from "@/components/ui/inline-input";

/**
 * A running meeting: the agenda on the left (one item at a time), the notes for that item in the
 * middle with buttons that mark a line, and the write-it-down box on the right. Everything is
 * written to the meeting's note as you go, and the note is an ordinary note afterwards.
 */
export function MeetingFocus() {
  const path = useUiStore((s) => s.meetingFocus);
  const [content, setContent] = useState<string | null>(null);
  const [current, setCurrent] = useState(GENERAL);
  const [draft, setDraft] = useState("");
  const [adding, setAdding] = useState("");
  const [parked, setParked] = useState(0);
  const [last, setLast] = useState(false);
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

  // Open: read the note, and start on the first item that is not done.
  useEffect(() => {
    if (path === null) {
      setContent(null);
      return;
    }
    let live = true;
    setParked(0);
    setLast(false);
    setAdding("");
    void flushPendingWrites()
      .then(() => api.readNote(path))
      .then((n) => {
        if (!live) return;
        const m = parseMeeting(n.content);
        const first = m.agenda.find((a) => !a.done) ?? m.agenda[0];
        const start = first?.text ?? GENERAL;
        setContent(n.content);
        setCurrent(start);
        setDraft(itemNotes(n.content, start));
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

  const items = meeting.agenda;

  /** Goes to another item: what was written is already in the note. */
  const go = (item: string, text = content): void => {
    setCurrent(item);
    setDraft(itemNotes(text, item));
    setLast(false);
  };

  const write = (text: string): void => {
    setDraft(text);
    change(setItemNotes(content, current, text));
  };

  const next = (): void => {
    const ticked = markItem(content, current, true);
    change(ticked);
    const after = parseMeeting(ticked).agenda;
    const at = after.findIndex((a) => a.text === current);
    const following =
      after.slice(at + 1).find((a) => !a.done) ??
      after.slice(0, Math.max(at, 0)).find((a) => !a.done);
    if (following) go(following.text, ticked);
    else setLast(true);
  };

  const toggle = (item: string, done: boolean): void => {
    change(markItem(content, item, done));
  };

  const add = (): void => {
    const text = adding.trim();
    if (text === "") return;
    setAdding("");
    const more = addItem(content, text);
    change(more);
    go(text, more);
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
        <Button size="sm" variant="outline" onClick={leave}>
          Leave meeting <kbd className="text-[10px] opacity-60">Esc</kbd>
        </Button>
      </div>
      <div className="grid min-h-0 flex-1 gap-6 overflow-auto px-6 py-5 lg:grid-cols-[220px_minmax(0,1fr)_320px]">
        <nav aria-label="Agenda" className="flex flex-col gap-1.5">
          <span className="section-label">Agenda</span>
          {items.length === 0 && (
            <p className="text-xs text-muted-foreground">
              No agenda. Write your notes in the middle, or add an item below.
            </p>
          )}
          {items.map((a) => (
            <div
              key={a.text}
              className={cn(
                "-mx-2 flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm",
                a.text === current && "bg-accent",
              )}
            >
              <PlainButton
                type="button"
                role="checkbox"
                aria-checked={a.done}
                aria-label={`${a.done ? "Mark as not done" : "Mark as done"}: ${a.text}`}
                className={cn(
                  "flex size-[18px] shrink-0 items-center justify-center rounded-[5px] border-2 border-muted-foreground bg-card focus-visible:ring-2 focus-visible:ring-ring",
                  a.done && "border-primary bg-primary text-primary-foreground",
                )}
                onClick={() => {
                  toggle(a.text, !a.done);
                }}
              >
                {a.done && <Check className="size-3" aria-hidden />}
              </PlainButton>
              <PlainButton
                type="button"
                aria-current={a.text === current ? "step" : undefined}
                className={cn(
                  "min-w-0 flex-1 truncate text-left",
                  a.done && "text-muted-foreground line-through",
                  a.text === current && "font-semibold",
                )}
                onClick={() => {
                  go(a.text);
                }}
              >
                {a.text}
              </PlainButton>
              {a.text === current && (
                <span className="text-[11px] font-bold uppercase tracking-wider text-primary">
                  Now
                </span>
              )}
            </div>
          ))}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              add();
            }}
          >
            <InlineInput
              aria-label="Add an item to the agenda"
              value={adding}
              placeholder="+ Add an item. Enter adds it."
              onChange={(e) => {
                setAdding(e.target.value);
              }}
              className="w-full rounded-md border border-dashed bg-background px-2.5 py-1.5 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
          </form>
        </nav>

        <div className="flex min-w-0 flex-col gap-3">
          <h3 className="text-xl font-semibold">{current}</h3>
          <MarkdownField
            // A new field for each item: it is empty of the old item's undo and has the focus.
            key={current}
            label={`Notes for ${current}`}
            value={draft}
            autoFocus
            rows={12}
            maxRows={40}
            placeholder="Write while you talk."
            onChange={write}
            className="min-h-64 flex-1 rounded-lg bg-card text-[15px]"
          />
          <div className="flex flex-wrap items-center gap-2">
            <span className="flex-1" />
            {last && <span className="text-sm text-muted-foreground">That was the last item.</span>}
            {items.some((a) => a.text === current) && (
              <Button size="sm" onClick={next}>
                Next item →
              </Button>
            )}
          </div>
        </div>

        <div className="flex min-w-0 flex-col gap-1.5">
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
  );
}
