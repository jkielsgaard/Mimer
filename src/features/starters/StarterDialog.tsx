import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { api } from "@/lib/api";
import { todayIso } from "@/lib/taskLogic";
import { cn } from "@/lib/utils";
import { reportError, useUiStore } from "@/stores/uiStore";
import { useVaultStore } from "@/stores/vaultStore";
import { STARTERS, type Starter } from "./starters";

/** A file name from a title: no characters a file cannot have. */
export function fileNameFrom(title: string): string {
  const clean = title
    .replace(/[\\/:*?"<>|#]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return clean === "" ? "Untitled" : clean.slice(0, 80);
}

/**
 * "New note from a starter": choose a kind of note, answer a few questions, and Mimer writes
 * the note. Blanks are marked `[like this]` so they are easy to find. No AI is needed.
 */
export function StarterDialog() {
  const open = useUiStore((s) => s.starterOpen);
  const config = useVaultStore((s) => s.vault?.config);
  const [starter, setStarter] = useState<Starter>(STARTERS[0] as Starter);
  const [values, setValues] = useState<Record<string, string>>({});
  const [title, setTitle] = useState("");
  const [busy, setBusy] = useState(false);
  const date = todayIso();

  useEffect(() => {
    if (open) {
      setStarter(STARTERS[0] as Starter);
      setValues({});
      setTitle(STARTERS[0]?.title(date) ?? "");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- starts fresh each time it opens
  }, [open]);

  const note = useMemo(
    () => starter.build(title.trim() === "" ? starter.title(date) : title.trim(), date, values),
    [starter, title, date, values],
  );

  const close = (): void => {
    useUiStore.getState().setStarterOpen(false);
  };

  const choose = (s: Starter): void => {
    setStarter(s);
    setValues({});
    setTitle(s.title(date));
  };

  const create = async (): Promise<void> => {
    setBusy(true);
    try {
      const folder =
        (starter.folder === "meetings" ? config?.meetingsFolder : config?.quickNotesFolder) ?? "";
      const path = await api.createNote(folder, fileNameFrom(title || starter.title(date)));
      await api.writeNote(path, note);
      await useVaultStore.getState().refreshTree();
      close();
      await useVaultStore.getState().openNote(path);
    } catch (e) {
      reportError(e);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) close();
      }}
    >
      <DialogContent className="max-h-[90vh] max-w-3xl overflow-auto">
        <DialogHeader>
          <DialogTitle>New note from a starter</DialogTitle>
          <DialogDescription>
            Choose a kind of note and answer a few questions. Mimer writes the note, and you can
            change every word.
          </DialogDescription>
        </DialogHeader>

        <div
          role="radiogroup"
          aria-label="Starter"
          className="grid grid-cols-2 gap-2 sm:grid-cols-4"
        >
          {STARTERS.map((s) => (
            <button
              key={s.id}
              type="button"
              role="radio"
              aria-checked={starter.id === s.id}
              className={cn(
                "flex flex-col gap-0.5 rounded-lg border px-3 py-2 text-left focus-visible:ring-2 focus-visible:ring-ring",
                starter.id === s.id
                  ? "border-primary bg-accent text-accent-foreground"
                  : "hover:bg-muted",
              )}
              onClick={() => {
                choose(s);
              }}
            >
              <span className="text-sm font-semibold">{s.name}</span>
              <span className="text-xs text-muted-foreground">{s.hint}</span>
            </button>
          ))}
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="flex flex-col gap-3">
            <div className="flex flex-col gap-1">
              <label htmlFor="starter-title" className="text-xs font-semibold">
                Name of the note
              </label>
              <Input
                id="starter-title"
                value={title}
                onChange={(e) => {
                  setTitle(e.target.value);
                }}
              />
            </div>
            {starter.fields.map((f) => (
              <div key={f.id} className="flex flex-col gap-1">
                <label htmlFor={`starter-${f.id}`} className="text-xs font-semibold">
                  {f.label}
                </label>
                {f.multiline ? (
                  <Textarea
                    id={`starter-${f.id}`}
                    rows={3}
                    className="min-h-0 resize-none"
                    placeholder={f.placeholder}
                    value={values[f.id] ?? ""}
                    onChange={(e) => {
                      setValues((v) => ({ ...v, [f.id]: e.target.value }));
                    }}
                  />
                ) : (
                  <Input
                    id={`starter-${f.id}`}
                    placeholder={f.placeholder}
                    value={values[f.id] ?? ""}
                    onChange={(e) => {
                      setValues((v) => ({ ...v, [f.id]: e.target.value }));
                    }}
                  />
                )}
              </div>
            ))}
          </div>
          <div className="flex min-h-0 flex-col gap-1">
            <span className="text-xs font-semibold">The note</span>
            <pre
              aria-label="Preview of the note"
              className="max-h-80 flex-1 overflow-auto whitespace-pre-wrap rounded-lg border bg-muted/40 p-3 font-sans text-sm"
            >
              {note}
            </pre>
            <span className="text-xs text-muted-foreground">
              Parts in [brackets] are blanks for you to fill in.
            </span>
          </div>
        </div>

        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={close}>
            Cancel
          </Button>
          <Button
            disabled={busy}
            onClick={() => {
              void create();
            }}
          >
            Create the note
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
