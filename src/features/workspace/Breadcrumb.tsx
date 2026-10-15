import { ChevronRight } from "lucide-react";
import { revealInTree } from "@/lib/actions";
import { isInside, noteTitle } from "@/lib/utils";
import { useVaultStore } from "@/stores/vaultStore";

/**
 * Where the open note lives: `Project › Folder › Note`. A folder can be clicked to find it in the
 * file tree; a project shows under its name instead of its folder name.
 */
export function Breadcrumb({ path }: { path: string | null }) {
  const projects = useVaultStore((s) => s.projects);
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
    </nav>
  );
}
