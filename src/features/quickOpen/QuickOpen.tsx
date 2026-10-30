import { useEffect, useMemo, useState } from "react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { openFile } from "@/lib/actions";
import { fuzzyFilter } from "@/lib/fuzzy";
import { basename, cn, isMarkdown } from "@/lib/utils";
import { useUiStore } from "@/stores/uiStore";
import { useVaultStore } from "@/stores/vaultStore";
import { isManagedNote } from "@/features/fileTree/treeUtils";
import { PlainButton } from "@/components/ui/plain-button";

/** Mod+P: fuzzy file-name match over the tree. */
export function QuickOpen() {
  const open = useUiStore((s) => s.quickOpen);
  const setOpen = useUiStore((s) => s.setQuickOpen);
  const allFiles = useVaultStore((s) => s.files);
  const files = useMemo(() => allFiles.filter((f) => !isManagedNote(f)), [allFiles]);
  const [query, setQuery] = useState("");
  const [index, setIndex] = useState(0);

  useEffect(() => {
    if (open) {
      setQuery("");
      setIndex(0);
    }
  }, [open]);

  const results = useMemo(
    () => fuzzyFilter(files, query, (f) => (isMarkdown(f) ? f.replace(/\.md$/i, "") : f), 30),
    [files, query],
  );

  const choose = (path: string | undefined): void => {
    if (!path) return;
    setOpen(false);
    void openFile(path);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="top-[20%] max-w-lg translate-y-0 gap-2 p-2">
        <DialogTitle className="sr-only">Quick open</DialogTitle>
        <Input
          data-no-ai
          autoFocus
          aria-label="Find a note"
          placeholder="Find a note by name…"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setIndex(0);
          }}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown") {
              e.preventDefault();
              setIndex((i) => Math.min(i + 1, results.length - 1));
            } else if (e.key === "ArrowUp") {
              e.preventDefault();
              setIndex((i) => Math.max(i - 1, 0));
            } else if (e.key === "Enter") {
              e.preventDefault();
              choose(results[index]);
            }
          }}
        />
        <ul className="max-h-80 overflow-auto" role="listbox">
          {results.map((f, i) => (
            <li key={f} role="option" aria-selected={i === index}>
              <PlainButton
                type="button"
                className={cn(
                  "flex w-full items-baseline gap-2 rounded px-2 py-1.5 text-left",
                  i === index && "bg-accent",
                )}
                onClick={() => {
                  choose(f);
                }}
                onMouseMove={() => {
                  setIndex(i);
                }}
              >
                <span className="truncate text-sm">{basename(f).replace(/\.md$/i, "")}</span>
                <span className="truncate text-xs text-muted-foreground">{f}</span>
              </PlainButton>
            </li>
          ))}
          {results.length === 0 && (
            <li className="p-2 text-xs text-muted-foreground">No matching files.</li>
          )}
        </ul>
      </DialogContent>
    </Dialog>
  );
}
