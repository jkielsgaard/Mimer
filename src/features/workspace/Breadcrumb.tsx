import { ChevronRight } from "lucide-react";
import { useEffect, useState } from "react";
import { revealInTree } from "@/lib/actions";
import { api } from "@/lib/api";
import { isInside, noteTitle } from "@/lib/utils";
import { useEditorStore } from "@/stores/editorStore";
import { useVaultStore } from "@/stores/vaultStore";
import type { PaneId } from "@/stores/workspaceStore";

/** The number of words in a note, not counting the front matter. */
export function countWords(text: string): number {
  const body = text.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/, "");
  const words = body.match(/[^\s]+/g);
  return words === null ? 0 : words.length;
}

/**
 * Where the open note lives: `Project › Folder › Note`. A folder can be clicked to find it in the
 * file tree; a project shows under its name instead of its folder name.
 */
export function Breadcrumb({ path, paneId }: { path: string | null; paneId?: PaneId }) {
  const projects = useVaultStore((s) => s.projects);
  const status = useEditorStore((s) => s.statuses[paneId ?? "primary"]);
  const [facts, setFacts] = useState<{ words: number; links: number } | null>(null);
  // Counted from what is on disk, so it follows the note once it is saved.
  useEffect(() => {
    if (path === null || status !== "saved") return;
    let alive = true;
    void Promise.all([api.readNote(path), api.backlinks(path)])
      .then(([note, back]) => {
        if (alive) setFacts({ words: countWords(note.content), links: back.length });
      })
      .catch(() => {
        if (alive) setFacts(null);
      });
    return () => {
      alive = false;
    };
  }, [path, status]);
  if (path === null) return null;
  const parts = path.split("/");
  const folders = parts.slice(0, -1);
  const project = projects.find((p) => isInside(path, p.folder)) ?? null;
  const crumbs = folders.map((name, i) => {
    const folderPath = folders.slice(0, i + 1).join("/");
    return {
      path: folderPath,
      label: project !== null && folderPath === project.folder ? project.name : name,
      isProject: project !== null && folderPath === project.folder,
    };
  });
  return (
    <nav
      aria-label="Location of the open note"
      className="flex min-w-0 items-center gap-0.5 overflow-hidden border-b px-3 py-1 text-[11px] text-muted-foreground"
    >
      {crumbs.map((c) => (
        <span key={c.path} className="flex min-w-0 items-center gap-0.5">
          <button
            type="button"
            title={`Show ${c.path} in the file tree`}
            className={`truncate rounded px-1 hover:bg-muted hover:text-foreground ${c.isProject ? "font-medium text-primary" : ""}`}
            onClick={() => {
              revealInTree(c.path);
            }}
          >
            {c.label}
          </button>
          <ChevronRight className="size-3 shrink-0" aria-hidden />
        </span>
      ))}
      <span aria-current="page" className="truncate px-1 font-medium text-foreground">
        {noteTitle(path)}
      </span>
      {facts !== null && (
        <span className="ml-auto flex shrink-0 gap-2 pl-2" data-testid="note-facts">
          <span>{facts.words} words</span>
          <span aria-hidden>·</span>
          <span>
            {facts.links} backlink{facts.links === 1 ? "" : "s"}
          </span>
        </span>
      )}
    </nav>
  );
}
