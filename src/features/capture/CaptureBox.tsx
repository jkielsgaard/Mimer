import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { api } from "@/lib/api";
import { taskText } from "@/lib/taskLogic";
import { cn } from "@/lib/utils";
import { fileNameFrom } from "@/lib/noteTitle";
import { useIdeaStore } from "@/stores/ideaStore";
import { useTaskStore } from "@/stores/taskStore";
import { reportError, useUiStore } from "@/stores/uiStore";
import { useVaultStore } from "@/stores/vaultStore";

export type CaptureKind = "task" | "idea" | "note";

const KINDS: { id: CaptureKind; label: string; help: string }[] = [
  {
    id: "task",
    label: "Task",
    help: "Goes to the epic task Inbox in your task list.",
  },
  {
    id: "idea",
    label: "Idea",
    help: "Goes to your Ideas. You look at it later, when you have time.",
  },
  {
    id: "note",
    label: "Note",
    help: "Becomes a real note in Quick notes. You can keep writing in it.",
  },
];

const KEY = "mimer.captureKind";

function lastKind(): CaptureKind {
  try {
    const v = localStorage.getItem(KEY);
    return v === "task" || v === "idea" || v === "note" ? v : "idea";
  } catch {
    return "idea";
  }
}

/**
 * The write-it-down box: choose Task, Idea or Note and write. It is used in Focus and in the box
 * that opens from anywhere (Ctrl/Cmd+Shift+N). Nothing else on the screen changes.
 */
export function CaptureBox({
  initialKind,
  kinds,
  onSaved,
  autoFocus = false,
}: {
  initialKind?: CaptureKind;
  /** Offer only these kinds (default: all three). With one kind there is nothing to choose. */
  kinds?: CaptureKind[];
  /** Called after something was saved, with a short description. */
  onSaved?: (what: string) => void;
  autoFocus?: boolean;
}) {
  const offered = KINDS.filter((k) => kinds === undefined || kinds.includes(k.id));
  const [kind, setKind] = useState<CaptureKind>(
    kinds?.length === 1 ? (kinds[0] ?? "idea") : (initialKind ?? lastKind()),
  );
  const [text, setText] = useState("");
  const [note, setNote] = useState("");
  const [noteOpen, setNoteOpen] = useState(kinds?.length === 1);
  const [title, setTitle] = useState("");
  const [busy, setBusy] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const quickFolder = useVaultStore((s) => s.vault?.config.quickNotesFolder) ?? "";

  useEffect(() => {
    if (autoFocus) input.current?.focus();
  }, [autoFocus, kind]);

  const choose = (k: CaptureKind): void => {
    setKind(k);
    try {
      localStorage.setItem(KEY, k);
    } catch {
      /* only a convenience */
    }
  };

  const save = async (): Promise<void> => {
    const value = text.trim();
    if (kind !== "note" && value === "") return;
    if (kind === "note" && title.trim() === "" && value === "") return;
    setBusy(true);
    try {
      if (kind === "task") {
        await useTaskStore.getState().add(taskText(value), note);
        onSaved?.("a task");
      } else if (kind === "idea") {
        if (await useIdeaStore.getState().add(value, note)) onSaved?.("an idea");
      } else {
        const name =
          title.trim() === "" ? (value.split("\n")[0]?.slice(0, 60) ?? "Note") : title.trim();
        const path = await api.createNote(quickFolder, fileNameFrom(name));
        await api.writeNote(path, `# ${name}\n\n${value}\n`);
        await useVaultStore.getState().refreshTree();
        onSaved?.(`the note “${name}”`);
      }
      setText("");
      setTitle("");
      setNote("");
      input.current?.focus();
    } catch (e) {
      reportError(e);
    } finally {
      setBusy(false);
    }
  };

  const current = KINDS.find((k) => k.id === kind);
  const noteLabel = kind === "task" ? "Note for the task" : "Note for the idea";
  return (
    <div className="flex w-full flex-col gap-2">
      <div
        role="group"
        aria-label="What is it?"
        className={cn(
          "flex overflow-hidden rounded-lg border text-sm",
          offered.length === 1 && "hidden",
        )}
      >
        {offered.map((k, i) => (
          <button
            key={k.id}
            type="button"
            aria-pressed={kind === k.id}
            className={cn(
              "flex-1 px-3 py-2 text-center focus-visible:ring-2 focus-visible:ring-ring",
              i > 0 && "border-l",
              kind === k.id ? "bg-accent font-semibold text-accent-foreground" : "hover:bg-muted",
            )}
            onClick={() => {
              choose(k.id);
            }}
          >
            {k.label}
          </button>
        ))}
      </div>
      {kind === "note" ? (
        <div className="flex flex-col gap-2">
          <Input
            ref={input}
            aria-label="Title of the note"
            placeholder="Title"
            value={title}
            onChange={(e) => {
              setTitle(e.target.value);
            }}
          />
          <Textarea
            aria-label="Write the note"
            rows={3}
            className="min-h-0 resize-none"
            placeholder="Write it here. Press Ctrl+Enter to save."
            value={text}
            onChange={(e) => {
              setText(e.target.value);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
                e.preventDefault();
                void save();
              }
            }}
          />
          <Button
            size="sm"
            className="self-end"
            disabled={busy || (title.trim() === "" && text.trim() === "")}
            onClick={() => {
              void save();
            }}
          >
            Save the note
          </Button>
        </div>
      ) : (
        <form
          className="flex flex-col gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            void save();
          }}
        >
          <Input
            ref={input}
            aria-label={kind === "task" ? "Write a task" : "Write an idea"}
            placeholder={noteOpen ? "Title" : "Write it here. Press Enter to save it."}
            value={text}
            onChange={(e) => {
              setText(e.target.value);
            }}
          />
          {noteOpen ? (
            <>
              <Textarea
                aria-label={noteLabel}
                rows={3}
                className="min-h-0 resize-none"
                placeholder="A small note. Press Ctrl+Enter to save."
                value={note}
                onChange={(e) => {
                  setNote(e.target.value);
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
                    e.preventDefault();
                    void save();
                  }
                }}
              />
              <Button
                size="sm"
                type="submit"
                className="self-end"
                disabled={busy || text.trim() === ""}
              >
                Save
              </Button>
            </>
          ) : (
            <button
              type="button"
              className="self-start rounded text-xs text-muted-foreground underline-offset-2 hover:underline focus-visible:ring-2 focus-visible:ring-ring"
              onClick={() => {
                setNoteOpen(true);
              }}
            >
              Add a note
            </button>
          )}
        </form>
      )}
      <p className="text-xs text-muted-foreground">{current?.help}</p>
    </div>
  );
}

/** Closes the box from the outside. */
export function closeCapture(): void {
  useUiStore.getState().closeCapture();
}
