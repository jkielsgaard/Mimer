import { useEffect, useMemo, useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { fuzzyFilter } from "@/lib/fuzzy";
import { basename, cn, dirname, isMarkdown } from "@/lib/utils";
import { useVaultStore } from "@/stores/vaultStore";

interface Props {
  open: boolean;
  /** Text selected in the note; it pre-fills the search. */
  initialQuery: string;
  /** Called with the link text to put between `[[` and `]]` (a name, or a path when needed). */
  onPick: (target: string) => void;
  onClose: () => void;
}

/**
 * Pick a note anywhere in the vault to link to. Names that exist more than once are linked by
 * path so the link always goes to the note that was chosen.
 */
export function LinkNoteDialog({ open, initialQuery, onPick, onClose }: Props) {
  const files = useVaultStore((s) => s.files);
  const resolver = useVaultStore((s) => s.resolver);
  const [query, setQuery] = useState("");
  const [index, setIndex] = useState(0);

  useEffect(() => {
    if (open) {
      setQuery(initialQuery);
      setIndex(0);
    }
  }, [open, initialQuery]);

  const notes = useMemo(() => files.filter(isMarkdown), [files]);
  const results = useMemo(
    () => fuzzyFilter(notes, query, (f) => f.replace(/\.md$/i, ""), 30),
    [notes, query],
  );
  const trimmed = query.trim();
  const exact = notes.some(
    (n) => basename(n).replace(/\.md$/i, "").toLowerCase() === trimmed.toLowerCase(),
  );
  const canCreate = trimmed !== "" && !exact;
  const rows = [...results.map((path) => ({ path })), ...(canCreate ? [{ path: null }] : [])];

  const choose = (i: number): void => {
    const row = rows[i];
    if (!row) return;
    onPick(row.path === null ? trimmed : resolver.shortestForm(row.path));
    onClose();
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
    >
      <DialogContent className="top-[20%] max-w-lg translate-y-0 gap-2 p-2">
        <DialogTitle className="sr-only">Link to a note</DialogTitle>
        <DialogDescription className="sr-only">
          Search for a note and press Enter to insert a link to it.
        </DialogDescription>
        <Input
          autoFocus
          aria-label="Find a note to link to"
          placeholder="Link to a note…"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setIndex(0);
          }}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown") {
              e.preventDefault();
              setIndex((i) => Math.min(i + 1, rows.length - 1));
            } else if (e.key === "ArrowUp") {
              e.preventDefault();
              setIndex((i) => Math.max(i - 1, 0));
            } else if (e.key === "Enter") {
              e.preventDefault();
              choose(index);
            }
          }}
        />
        <ul className="max-h-80 overflow-auto" role="listbox" aria-label="Notes">
          {rows.map((row, i) => (
            <li key={row.path ?? "__new"} role="option" aria-selected={i === index}>
              <button
                type="button"
                className={cn(
                  "flex w-full items-baseline gap-2 rounded px-2 py-1.5 text-left",
                  i === index && "bg-accent",
                )}
                onClick={() => {
                  choose(i);
                }}
                onMouseMove={() => {
                  setIndex(i);
                }}
              >
                {row.path === null ? (
                  <span className="truncate text-sm">
                    Link to a new note “{trimmed}”{" "}
                    <span className="text-muted-foreground">(created when you open the link)</span>
                  </span>
                ) : (
                  <>
                    <span className="truncate text-sm">
                      {basename(row.path).replace(/\.md$/i, "")}
                    </span>
                    <span className="truncate text-xs text-muted-foreground">
                      {dirname(row.path)}
                    </span>
                  </>
                )}
              </button>
            </li>
          ))}
          {rows.length === 0 && (
            <li className="p-2 text-xs text-muted-foreground">No matching notes.</li>
          )}
        </ul>
      </DialogContent>
    </Dialog>
  );
}
