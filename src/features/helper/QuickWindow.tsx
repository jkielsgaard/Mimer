import { emit } from "@tauri-apps/api/event";
import { useEffect, useState } from "react";
import type { Task } from "@/bindings/Task";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PlainButton } from "@/components/ui/plain-button";
import { Select } from "@/components/ui/select";
import { CaptureBox, type CaptureKind } from "@/features/capture/CaptureBox";
import { api, toApiError } from "@/lib/api";
import { isOpen, leftOffLine, todayIso } from "@/lib/taskLogic";
import { cn } from "@/lib/utils";
import { useSettingsStore } from "@/stores/settingsStore";

export type QuickMode = "note" | "park";

/** Tells the main window to read tasks and ideas again, then closes this small window. */
async function finish(): Promise<void> {
  await emit("helper://changed").catch(() => undefined);
  await api.quickClose().catch(() => undefined);
}

/** The open tasks, the ones being worked on first. */
function parkable(tasks: Task[]): Task[] {
  const open = tasks.filter(isOpen);
  return [...open.filter((t) => t.status === "doing"), ...open.filter((t) => t.status !== "doing")];
}

/**
 * "Where I left off": one line about the next step, written in the log of the task you choose
 * (the one you are working on first). It shows on the task and on the start page.
 */
function Park() {
  const [tasks, setTasks] = useState<Task[] | null>(null);
  const [pick, setPick] = useState("");
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void api
      .listTasks()
      .then((all) => {
        const list = parkable(all);
        setTasks(list);
        setPick(list[0] === undefined ? "" : `${list[0].path}:${String(list[0].line)}`);
      })
      .catch((e: unknown) => {
        setError(toApiError(e).message);
      });
  }, []);

  const task = (tasks ?? []).find((t) => `${t.path}:${String(t.line)}` === pick);

  const save = async (): Promise<void> => {
    if (!task || text.trim() === "" || busy) return;
    setBusy(true);
    try {
      await api.taskAddLog(task.path, task.line, task.key, todayIso(), leftOffLine(text));
      await finish();
    } catch (e) {
      setError(toApiError(e).message);
      setBusy(false);
    }
  };

  if (error !== null) return <Problem text={error} />;
  if (tasks === null) return <p className="text-sm text-muted-foreground">Reading your tasks…</p>;
  if (tasks.length === 0) {
    return <p className="text-sm text-muted-foreground">There is no open task to write it on.</p>;
  }
  return (
    <form
      className="flex flex-col gap-3"
      onSubmit={(e) => {
        e.preventDefault();
        void save();
      }}
    >
      <label className="flex items-center gap-2 text-sm">
        <span className="w-12 shrink-0 text-xs text-muted-foreground">Task</span>
        <Select
          className="min-w-0 flex-1"
          value={pick}
          onChange={(e) => {
            setPick(e.target.value);
          }}
        >
          {tasks.map((t) => (
            <option key={`${t.path}:${String(t.line)}`} value={`${t.path}:${String(t.line)}`}>
              {t.title}
            </option>
          ))}
        </Select>
      </label>
      <label className="flex flex-col gap-1 text-sm">
        <span className="text-xs text-muted-foreground">Next step</span>
        <Input
          autoFocus
          maxLength={200}
          placeholder="Where were you, and what comes next?"
          value={text}
          onChange={(e) => {
            setText(e.target.value);
          }}
        />
      </label>
      <div className="flex justify-end gap-2">
        <Button
          type="button"
          variant="ghost"
          onClick={() => {
            void api.quickClose();
          }}
        >
          Cancel
        </Button>
        <Button type="submit" disabled={busy || text.trim() === ""}>
          Save
        </Button>
      </div>
    </form>
  );
}

function Problem({ text }: { text: string }) {
  return (
    <div className="flex flex-col gap-2 text-sm">
      <p role="alert">
        {/vault/i.test(text)
          ? "Open a vault in Mimer first, then try again."
          : `Something went wrong: ${text}`}
      </p>
      <div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            void api.quickClose();
          }}
        >
          Close
        </Button>
      </div>
    </div>
  );
}

/**
 * Write something down: a task (into an epic you choose) or an idea, without leaving what you
 * are doing. It is the same box as Ctrl/Cmd+Shift+N in Mimer.
 */
function Note() {
  const [kind, setKind] = useState<CaptureKind>("task");
  const [vaultError, setVaultError] = useState<string | null>(null);
  useEffect(() => {
    void api.listEpics().catch((e: unknown) => {
      setVaultError(toApiError(e).message);
    });
  }, []);
  if (vaultError !== null) return <Problem text={vaultError} />;
  return (
    <div className="flex flex-col gap-3">
      <div role="group" aria-label="What to write down" className="flex gap-1">
        {(["task", "idea"] as const).map((k) => (
          <PlainButton
            key={k}
            type="button"
            aria-pressed={kind === k}
            className={cn(
              "rounded-full border px-3 py-0.5 text-xs font-semibold capitalize focus-visible:ring-2 focus-visible:ring-ring",
              kind === k ? "border-primary bg-accent" : "hover:bg-muted",
            )}
            onClick={() => {
              setKind(k);
            }}
          >
            {k}
          </PlainButton>
        ))}
      </div>
      <CaptureBox
        key={kind}
        kind={kind}
        autoFocus
        onSaved={() => {
          void finish();
        }}
      />
    </div>
  );
}

/**
 * The helper's small window: opens over any program from the keys chosen in Settings. Escape
 * closes it. It works on the vault that is open in Mimer.
 */
export function QuickWindow({ mode }: { mode: QuickMode }) {
  useEffect(() => {
    void useSettingsStore.getState().load();
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === "Escape") void api.quickClose();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
    };
  }, []);
  return (
    <main className="flex h-screen flex-col gap-3 border bg-background p-4 text-foreground">
      <h1 className="text-sm font-semibold">
        {mode === "park" ? "Where I left off" : "Write something down"}
      </h1>
      {mode === "park" ? <Park /> : <Note />}
    </main>
  );
}
