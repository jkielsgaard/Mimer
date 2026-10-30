import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { openFile } from "@/lib/actions";
import { api } from "@/lib/api";
import { noteName, taskText } from "@/lib/taskLogic";
import { fileNameFrom } from "@/lib/noteTitle";
import { useIdeaStore } from "@/stores/ideaStore";
import { useTaskStore } from "@/stores/taskStore";
import { reportError, useUiStore } from "@/stores/uiStore";
import { useVaultStore } from "@/stores/vaultStore";
import { PlainButton } from "@/components/ui/plain-button";
import { Select } from "@/components/ui/select";

export type CaptureKind = "task" | "idea" | "note";

/** The name of each box, what it does and its save button. */
export const CAPTURE_KINDS: Record<CaptureKind, { title: string; help: string; save: string }> = {
  task: {
    title: "New task",
    help: "Goes into the epic you choose, in your task list.",
    save: "Save task",
  },
  idea: {
    title: "New idea",
    help: "Goes to your Ideas, to look at later.",
    save: "Save idea",
  },
  note: {
    title: "Quick note",
    help: "Becomes a note in the Quick notes folder. You can keep writing in it.",
    save: "Save note",
  },
};

const EPIC_KEY = "mimer.captureEpic";
/** The choices that are not an epic yet. */
const NEW_EPIC = "::new";
const THIS_NOTE = "::note";

function lastEpic(): string | null {
  try {
    return localStorage.getItem(EPIC_KEY);
  } catch {
    return null;
  }
}

/**
 * One box to write one kind of thing down: a task, an idea or a quick note. The person has already
 * said which, so there is nothing to choose but, for a task, the epic it goes into. It is used in
 * the window that opens from New and Ctrl/Cmd+Shift+N, in Ideas, in a meeting, in Focus and on the
 * start page. Nothing else on the screen changes.
 */
export function CaptureBox({
  kind,
  onSaved,
  autoFocus = false,
  withNote = false,
  epic: epicPath,
  aroundNote,
}: {
  kind: CaptureKind;
  /** Called after something was saved, with a short description and a way to open it. */
  onSaved?: (what: string, open: () => void) => void;
  autoFocus?: boolean;
  /** Show the box for a small note from the start (task and idea). */
  withNote?: boolean;
  /** The epic a task goes into at first (the one in Focus). Else the one used last. */
  epic?: string;
  /** A note (a meeting) whose epic is the first choice; it is made when a task is saved. */
  aroundNote?: { path: string; title: string };
}) {
  const [text, setText] = useState("");
  const [note, setNote] = useState("");
  const [noteOpen, setNoteOpen] = useState(withNote);
  const [title, setTitle] = useState("");
  const [busy, setBusy] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const known = useTaskStore((s) => s.epics);
  // The epic of the screen may be a note with tasks outside `Tasks/`, which is not in the list.
  const epics =
    epicPath === undefined || known.some((e) => e.path === epicPath)
      ? known
      : [...known, { path: epicPath, title: noteName(epicPath), source: null, description: "" }];
  const [epic, setEpic] = useState<string | null>(null);
  const [epicName, setEpicName] = useState("");
  const quickFolder = useVaultStore((s) => s.vault?.config.quickNotesFolder) ?? "";
  const info = CAPTURE_KINDS[kind];

  useEffect(() => {
    if (autoFocus) input.current?.focus();
  }, [autoFocus, kind]);

  useEffect(() => {
    if (!useTaskStore.getState().loaded) void useTaskStore.getState().load();
  }, []);

  // Where a task goes: what the screen says, else the epic used last, else a new one.
  const chosen =
    epic ??
    (aroundNote
      ? THIS_NOTE
      : epicPath !== undefined && epics.some((e) => e.path === epicPath)
        ? epicPath
        : (epics.find((e) => e.path === lastEpic())?.path ?? epics[0]?.path ?? NEW_EPIC));

  const empty =
    kind === "note"
      ? title.trim() === "" && text.trim() === ""
      : text.trim() === "" || (kind === "task" && chosen === NEW_EPIC && epicName.trim() === "");

  const save = async (): Promise<void> => {
    const value = text.trim();
    if (empty || busy) return;
    setBusy(true);
    try {
      if (kind === "task") {
        const tasks = useTaskStore.getState();
        let target: string | null;
        if (chosen === NEW_EPIC) {
          target = await tasks.createEpic(epicName.trim(), false);
        } else if (chosen === THIS_NOTE && aroundNote) {
          target = await tasks.epicFor(aroundNote.path);
        } else {
          target = chosen;
        }
        if (target === null) return;
        await tasks.add(taskText(value), note, undefined, target);
        setEpic(target);
        setEpicName("");
        try {
          localStorage.setItem(EPIC_KEY, target);
        } catch {
          /* only a convenience */
        }
        const into = useTaskStore.getState().epics.find((e) => e.path === target)?.title;
        const path = target;
        onSaved?.(into ? `the task in ${into}` : "a task", () => {
          useTaskStore.getState().openEpic(path);
        });
      } else if (kind === "idea") {
        if (await useIdeaStore.getState().add(value, note)) {
          onSaved?.("an idea", () => {
            useUiStore.getState().openArea("ideas");
          });
        }
      } else {
        const name =
          title.trim() === "" ? (value.split("\n")[0]?.slice(0, 60) ?? "Note") : title.trim();
        const path = await api.createNote(quickFolder, fileNameFrom(name));
        await api.writeNote(path, `# ${name}\n\n${value}\n`);
        await useVaultStore.getState().refreshTree();
        onSaved?.(`the note “${name}”`, () => {
          void openFile(path);
        });
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

  const saveButton = (
    <Button
      size="sm"
      type="submit"
      disabled={busy || empty}
      onClick={(e) => {
        e.preventDefault();
        void save();
      }}
    >
      {info.save}
    </Button>
  );

  if (kind === "note") {
    return (
      <div className="flex w-full flex-col gap-2">
        <Input
          ref={input}
          aria-label="Title of the note"
          placeholder="Title (optional)"
          value={title}
          onChange={(e) => {
            setTitle(e.target.value);
          }}
        />
        <Textarea
          aria-label="Write the note"
          indent
          rows={4}
          className="min-h-0 resize-none"
          placeholder="Write it here…"
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
        <div className="flex items-center gap-2">
          <span className="flex-1 text-xs text-muted-foreground">
            {info.help} Ctrl+Enter saves.
          </span>
          {saveButton}
        </div>
      </div>
    );
  }

  return (
    <form
      className="flex w-full flex-col gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        void save();
      }}
    >
      <Input
        ref={input}
        aria-label={kind === "task" ? "Write a task" : "Write an idea"}
        placeholder={kind === "task" ? "What needs doing?" : "The idea…"}
        value={text}
        onChange={(e) => {
          setText(e.target.value);
        }}
      />
      {kind === "task" && (
        <div className="flex flex-col gap-1.5">
          <label className="flex items-center gap-2 text-xs text-muted-foreground">
            Into
            <Select
              aria-label="Epic for the task"
              value={chosen}
              className="min-w-0 flex-1 rounded-md border bg-background px-2 py-1 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              onChange={(e) => {
                setEpic(e.target.value);
              }}
            >
              {aroundNote && <option value={THIS_NOTE}>{aroundNote.title} · this meeting</option>}
              {epics.map((e) => (
                <option key={e.path} value={e.path}>
                  {e.title}
                </option>
              ))}
              <option value={NEW_EPIC}>+ New epic…</option>
            </Select>
          </label>
          {chosen === NEW_EPIC && (
            <Input
              aria-label="Name of the new epic"
              placeholder="Name of the new epic"
              value={epicName}
              onChange={(e) => {
                setEpicName(e.target.value);
              }}
              onKeyDown={(e) => {
                // With two fields, Enter in the second would not send the form by itself.
                if (e.key === "Enter") {
                  e.preventDefault();
                  void save();
                }
              }}
            />
          )}
        </div>
      )}
      {noteOpen && (
        <Textarea
          aria-label={kind === "task" ? "Note for the task" : "Note for the idea"}
          indent
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
      )}
      <div className="flex items-center gap-2">
        {!noteOpen && (
          <PlainButton
            type="button"
            className="rounded text-xs text-muted-foreground underline-offset-2 hover:underline focus-visible:ring-2 focus-visible:ring-ring"
            onClick={() => {
              setNoteOpen(true);
            }}
          >
            + Add a note
          </PlainButton>
        )}
        <span className="flex-1 text-xs text-muted-foreground">{info.help}</span>
        {saveButton}
      </div>
    </form>
  );
}

/** Closes the box from the outside. */
export function closeCapture(): void {
  useUiStore.getState().closeCapture();
}
