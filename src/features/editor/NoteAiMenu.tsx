import { ChevronDown, Sparkles } from "lucide-react";
import { useState } from "react";
import type { Skill } from "@/bindings/Skill";
import { AiOffNote } from "@/components/AiOffNote";
import { MenuText } from "@/components/MenuText";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { api } from "@/lib/api";
import { runSkillOn } from "@/lib/skills";
import { useAiBlocked } from "@/lib/useAiBlocked";
import { reportError, useUiStore } from "@/stores/uiStore";

/** One entry of the menu: a built-in skill, or something Mimer does itself. */
interface Entry {
  label: string;
  hint: string;
  /** The built-in skill it runs, or an action of its own. */
  skill?: string;
  run?: () => void;
  /** Works without the AI. */
  noAi?: boolean;
}

const GROUPS: { label: string; entries: Entry[] }[] = [
  {
    label: "Check",
    entries: [
      {
        label: "Fix spelling and grammar",
        hint: "The whole note; only wrong words change",
        skill: "fix-spelling",
      },
      {
        label: "Improve the structure",
        hint: "Headings, lists, short paragraphs",
        skill: "improve-structure",
      },
    ],
  },
  {
    label: "Add to the note",
    entries: [
      { label: "Short summary at the top", hint: "What, why, next", skill: "summary-at-top" },
      {
        label: "Suggest a title and tags",
        hint: "From the words in the note",
        skill: "title-and-tags",
      },
      {
        label: "Link related notes",
        hint: "Notes about the same thing (no AI)",
        noAi: true,
        run: () => {
          useUiStore.getState().setRightTab("links");
        },
      },
      {
        label: "Find tasks",
        hint: "You choose which to add",
        run: () => {
          useUiStore.getState().setFindTasksOpen(true);
        },
      },
    ],
  },
  {
    label: "Make something from it",
    entries: [
      { label: "Split into notes", hint: "One note per heading", skill: "split" },
      { label: "An e-mail from this note", hint: "Opens as a new note", skill: "email-from-note" },
    ],
  },
];

/**
 * The "AI" button above a note: fixed things the AI can do with the whole note. Each one is shown
 * as a change to review before anything is written. Without an AI the menu says why, and the
 * entries that need no AI still work.
 */
export function NoteAiMenu({ path }: { path: string | null }) {
  const off = useAiBlocked();
  const [skills, setSkills] = useState<Skill[] | null>(null);

  const runSkill = (id: string): void => {
    if (path === null) return;
    const skill = (skills ?? []).find((s) => s.id === `builtin:${id}`);
    if (!skill) {
      useUiStore.getState().toast("That skill could not be found.", "error");
      return;
    }
    void runSkillOn(skill, [path]);
  };

  return (
    <DropdownMenu
      onOpenChange={(o) => {
        if (o && skills === null) api.listSkills().then(setSkills).catch(reportError);
      }}
    >
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          disabled={path === null}
          className="gap-1 text-primary"
          title={off ?? "AI for this note"}
        >
          <Sparkles /> AI <ChevronDown className="size-3" aria-hidden />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-80">
        {off !== null && <AiOffNote reason={off} />}
        {GROUPS.map((g, i) => (
          <div key={g.label}>
            {i > 0 && <DropdownMenuSeparator />}
            <DropdownMenuLabel>{g.label}</DropdownMenuLabel>
            {g.entries.map((e) => (
              <DropdownMenuItem
                key={e.label}
                disabled={
                  (off !== null && e.noAi !== true) || (e.skill !== undefined && skills === null)
                }
                onSelect={() => {
                  if (e.run) e.run();
                  else if (e.skill) runSkill(e.skill);
                }}
              >
                <MenuText label={e.label} hint={e.hint} />
              </DropdownMenuItem>
            ))}
          </div>
        ))}
        <DropdownMenuSeparator />
        <p className="px-2 py-1.5 text-[11px] text-muted-foreground">
          You see every change before it is written. Free questions: Ctrl/Cmd+L.
        </p>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
