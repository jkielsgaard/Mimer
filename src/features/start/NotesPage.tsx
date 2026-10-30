import { Plus } from "lucide-react";
import { useMemo, useState } from "react";
import { PlainButton } from "@/components/ui/plain-button";
import { ViewHeader } from "@/components/ViewHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { isManagedNote } from "@/features/fileTree/treeUtils";
import { newNoteInCurrentFolder, openFile } from "@/lib/actions";
import { KIND_LABEL, modifiedByPath, whenChanged } from "@/lib/startPage";
import { dirname, noteTitle } from "@/lib/utils";
import { useUiStore } from "@/stores/uiStore";
import { useVaultStore } from "@/stores/vaultStore";
import { useRecentNotes } from "./useStartData";

/** How many notes are listed before "Show more". */
const SHOWN = 100;
const RECENT = 8;

const ROW =
  "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring";

/**
 * What the notes show when no note is open: the notes you opened lately and every note, newest
 * first, with a box that narrows the list by name. A click opens the note. The house is the start
 * page; this is the notes.
 */
export function NotesPage() {
  const tree = useVaultStore((s) => s.tree);
  const timeFormat = useUiStore((s) => s.timeFormat);
  const { notes: recent, kindOf } = useRecentNotes();
  const [filter, setFilter] = useState("");
  const [all, setAll] = useState(false);

  const modified = useMemo(() => modifiedByPath(tree), [tree]);
  const everyNote = useMemo(
    () =>
      [...modified.entries()]
        .filter(([p]) => /\.md$/i.test(p) && !isManagedNote(p))
        .sort((a, b) => b[1] - a[1]),
    [modified],
  );
  const q = filter.trim().toLowerCase();
  const matching =
    q === "" ? everyNote : everyNote.filter(([p]) => noteTitle(p).toLowerCase().includes(q));
  const shown = all ? matching : matching.slice(0, SHOWN);
  const recentShown = recent
    .filter((p) => q === "" || noteTitle(p).toLowerCase().includes(q))
    .slice(0, RECENT);

  const row = (p: string, ms: number, kind: boolean) => (
    <li key={p}>
      <PlainButton
        title={p}
        className={ROW}
        onClick={() => {
          void openFile(p);
        }}
      >
        {kind && (
          <span className="w-16 shrink-0 rounded-full bg-muted px-2 text-center text-[11px] font-semibold text-muted-foreground">
            {KIND_LABEL[kindOf(p)]}
          </span>
        )}
        <span className="min-w-0 flex-1 truncate">{noteTitle(p)}</span>
        {dirname(p) !== "" && (
          <span className="max-w-40 truncate text-xs text-muted-foreground">
            {dirname(p).split("/").slice(-2).join(" / ")}
          </span>
        )}
        <span className="w-20 shrink-0 text-right text-xs text-muted-foreground">
          {whenChanged(ms, new Date(), timeFormat)}
        </span>
      </PlainButton>
    </li>
  );

  return (
    <section aria-label="Notes" className="flex h-full min-h-0 flex-col bg-background">
      <ViewHeader title="Notes">
        <Button size="sm" onClick={newNoteInCurrentFolder}>
          <Plus /> New
        </Button>
      </ViewHeader>
      <div className="min-h-0 flex-1 overflow-auto px-5 py-5">
        <div className="mx-auto flex max-w-3xl flex-col gap-5">
          <Input
            aria-label="Find a note"
            placeholder="Find a note…"
            value={filter}
            onChange={(e) => {
              setFilter(e.target.value);
            }}
          />
          {recentShown.length > 0 && (
            <div className="flex flex-col gap-0.5">
              <h3 className="section-label pb-1">Recent</h3>
              <ul>{recentShown.map((p) => row(p, modified.get(p) ?? 0, true))}</ul>
            </div>
          )}
          <div className="flex flex-col gap-0.5">
            <h3 className="section-label pb-1">All notes · {matching.length}</h3>
            {matching.length === 0 && (
              <p className="py-1 text-sm text-muted-foreground">
                {everyNote.length === 0 ? "No notes yet. Press New." : "No note has that name."}
              </p>
            )}
            <ul>{shown.map(([p, ms]) => row(p, ms, false))}</ul>
            {matching.length > shown.length && (
              <PlainButton
                className="rounded-md px-2 py-1 text-left text-xs font-semibold text-primary hover:bg-muted"
                onClick={() => {
                  setAll(true);
                }}
              >
                Show more
              </PlainButton>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
