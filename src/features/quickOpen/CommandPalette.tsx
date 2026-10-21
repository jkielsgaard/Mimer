import { useEffect, useMemo, useState } from "react";
import type { Skill } from "@/bindings/Skill";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { newNoteInCurrentFolder, openDailyNote, openFile } from "@/lib/actions";
import { api } from "@/lib/api";
import { basename, cn, dirname, isMarkdown } from "@/lib/utils";
import { formatShortcut } from "@/lib/shortcuts";
import { runSkillOn } from "@/lib/skills";
import { reportError, useUiStore } from "@/stores/uiStore";
import { useVaultStore } from "@/stores/vaultStore";
import {
  filterPalette,
  skillItems,
  type PaletteGroup,
  type PaletteItem,
  type PaletteTarget,
} from "./paletteItems";
import { findFolder, isManagedNote } from "@/features/fileTree/treeUtils";

/** Ctrl+Shift+P: notes, AI commands and actions in one search. */
export function CommandPalette() {
  const open = useUiStore((s) => s.commandPalette);
  const setOpen = useUiStore((s) => s.setCommandPalette);
  const files = useVaultStore((s) => s.files);
  const tree = useVaultStore((s) => s.tree);
  const activePath = useVaultStore((s) => s.activePath);
  const selectedPath = useVaultStore((s) => s.selectedPath);
  const [query, setQuery] = useState("");
  const [index, setIndex] = useState(0);
  const [skills, setSkills] = useState<Skill[]>([]);

  useEffect(() => {
    if (!open) return;
    setQuery("");
    setIndex(0);
    api.listSkills().then(setSkills).catch(reportError);
  }, [open]);

  const target: PaletteTarget | null = useMemo(() => {
    if (activePath !== null) {
      return { path: activePath, isDir: false, name: basename(activePath).replace(/\.md$/i, "") };
    }
    if (selectedPath !== null && findFolder(tree, selectedPath) !== null) {
      return { path: selectedPath, isDir: true, name: basename(selectedPath) };
    }
    return null;
  }, [activePath, selectedPath, tree]);

  const close = (): void => {
    setOpen(false);
  };
  const ui = useUiStore.getState;
  const items = useMemo(() => {
    const skillList = skillItems(skills, target, (s, t) => {
      void runSkillOn(s, [t.path]);
    });
    const notes: PaletteItem[] = files
      .filter((f) => isMarkdown(f) && !isManagedNote(f))
      .map((f) => ({
        id: `note:${f}`,
        group: "Notes" as const,
        label: basename(f).replace(/\.md$/i, ""),
        hint: dirname(f),
        run: () => {
          void openFile(f);
        },
      }));
    const act = (id: string, label: string, run: () => void, hint?: string): PaletteItem => ({
      id: `action:${id}`,
      group: "Actions",
      label,
      run,
      ...(hint !== undefined ? { hint } : {}),
    });
    const actions: PaletteItem[] = [
      act("new-note", "New note", newNoteInCurrentFolder, formatShortcut("Mod+N")),
      act("daily", "Open today's note", () => void openDailyNote(), formatShortcut("Mod+Shift+D")),
      act(
        "search",
        "Search in notes",
        () => {
          ui().focusSearch();
        },
        formatShortcut("Mod+Shift+F"),
      ),
      act(
        "history",
        "Show history of this note",
        () => {
          ui().setRightTab("history");
        },
        formatShortcut("Mod+Shift+H"),
      ),
      act(
        "chat",
        "Ask Mimer",
        () => {
          ui().focusChat();
        },
        formatShortcut("Mod+L"),
      ),
      act(
        "tasks",
        "Open the task list",
        () => {
          ui().openArea("tasks");
        },
        formatShortcut("Mod+Shift+T"),
      ),
      act(
        "capture",
        "Write something down (task, idea or note)",
        () => {
          ui().openCapture();
        },
        formatShortcut("Mod+Shift+N"),
      ),
      act("ideas", "Open the ideas list", () => {
        ui().openArea("ideas");
      }),
      act("find-tasks", "Find tasks in this note (AI)", () => {
        ui().setFindTasksOpen(true);
      }),
      act("starter", "New note from a starter…", () => {
        ui().setStarterOpen(true);
      }),
      act(
        "settings",
        "Open Settings",
        () => {
          ui().setSettingsOpen(true);
        },
        formatShortcut("Mod+,"),
      ),
      act(
        "vaults",
        "Switch vault",
        () => {
          ui().setVaultSwitcherOpen(true);
        },
        formatShortcut("Mod+Shift+O"),
      ),
      act(
        "help",
        "Help",
        () => {
          ui().openHelp();
        },
        "F1",
      ),
    ];
    return filterPalette(skillList, notes, actions, query);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `ui` reads the store when it runs
  }, [skills, target, files, query]);

  const choose = (item: PaletteItem | undefined): void => {
    if (!item) return;
    close();
    item.run();
  };
  const heading = (i: number): PaletteGroup | null => {
    const g = items[i]?.group;
    return g !== undefined && items[i - 1]?.group !== g ? g : null;
  };
  const skillHeading = target ? `AI · on “${target.name}”` : "AI";

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="top-[18%] max-w-xl translate-y-0 gap-0 overflow-hidden p-0">
        <DialogTitle className="sr-only">Command palette</DialogTitle>
        <DialogDescription className="sr-only">
          Search notes, AI commands and actions.
        </DialogDescription>
        <div className="border-b p-2">
          <Input
            data-no-ai
            autoFocus
            aria-label="Search notes, AI commands and actions"
            placeholder="Type a note, an AI command or an action…"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setIndex(0);
            }}
            onKeyDown={(e) => {
              if (e.key === "ArrowDown") {
                e.preventDefault();
                setIndex((i) => Math.min(i + 1, items.length - 1));
              } else if (e.key === "ArrowUp") {
                e.preventDefault();
                setIndex((i) => Math.max(i - 1, 0));
              } else if (e.key === "Enter") {
                e.preventDefault();
                choose(items[index]);
              }
            }}
          />
        </div>
        <ul className="max-h-96 overflow-auto p-1" role="listbox" aria-label="Results">
          {items.map((it, i) => {
            const h = heading(i);
            return (
              <li key={it.id} role="presentation">
                {h !== null && (
                  <div className="px-2 pb-0.5 pt-2 section-label">
                    {h === "Skills" ? skillHeading : h}
                  </div>
                )}
                <button
                  type="button"
                  role="option"
                  aria-selected={i === index}
                  className={cn(
                    "flex w-full items-baseline gap-2 rounded px-2 py-1.5 text-left",
                    i === index && "bg-accent text-accent-foreground",
                  )}
                  onClick={() => {
                    choose(it);
                  }}
                  onMouseMove={() => {
                    setIndex(i);
                  }}
                >
                  <span className="truncate text-sm">{it.label}</span>
                  {it.hint !== undefined && it.hint !== "" && (
                    <span className="ml-auto truncate pl-2 text-xs text-muted-foreground">
                      {it.hint}
                    </span>
                  )}
                </button>
              </li>
            );
          })}
          {items.length === 0 && (
            <li className="p-3 text-xs text-muted-foreground">Nothing matches.</li>
          )}
          {target === null && query.trim() === "" && (
            <li className="px-3 py-2 text-xs text-muted-foreground">
              Open a note or select a folder to see the AI commands that fit it.
            </li>
          )}
        </ul>
        <div className="flex items-center gap-2 border-t bg-sidebar px-3 py-2 text-[11px] text-muted-foreground">
          <span className="flex-1">Notes, AI commands and actions in one search.</span>
          <kbd className="rounded border px-1">↑</kbd>
          <kbd className="rounded border px-1">↓</kbd>
          <kbd className="rounded border px-1">Enter</kbd>
          <kbd className="rounded border px-1">Esc</kbd>
        </div>
      </DialogContent>
    </Dialog>
  );
}
