import { Sparkles } from "lucide-react";
import { useEffect, useState } from "react";
import type { Skill } from "@/bindings/Skill";
import { useAiChip } from "@/components/layout/AiChip";
import {
  ContextMenuItem,
  ContextMenuLabel,
  ContextMenuSeparator,
  ContextMenuSub,
  ContextMenuSubContent,
  ContextMenuSubTrigger,
} from "@/components/ui/context-menu";
import { api } from "@/lib/api";
import { recentSkillIds } from "@/lib/recentSkills";
import { runSkillOn, skillFits } from "@/lib/skills";
import { cn } from "@/lib/utils";
import { reportError, useUiStore } from "@/stores/uiStore";

interface Props {
  /** The notes and folders the skill would run on, with whether each is a folder. */
  targets: { path: string; isDir: boolean }[];
}

/** The "AI" entry of the file tree's right-click menu: the skills that fit what was clicked. */
export function SkillsSubmenu({ targets }: Props) {
  const [skills, setSkills] = useState<Skill[] | null>(null);
  const chip = useAiChip();
  useEffect(() => {
    api.listSkills().then(setSkills).catch(reportError);
  }, []);
  const fitting = (skills ?? []).filter((s) => targets.every((t) => skillFits(s, t.isDir)));
  const recent = recentSkillIds()
    .map((id) => fitting.find((s) => s.id === id))
    .filter((s): s is Skill => s !== undefined)
    .slice(0, 3);
  const onlyFolders = targets.every((t) => t.isDir);
  const onlyNotes = targets.every((t) => !t.isDir);
  const heading = onlyFolders ? "Fits a folder" : onlyNotes ? "Fits a note" : "Fits these items";
  const run = (s: Skill): void => {
    void runSkillOn(
      s,
      targets.map((t) => t.path),
    );
  };
  return (
    <ContextMenuSub>
      <ContextMenuSubTrigger>
        <Sparkles className="size-4" aria-hidden /> <span className="font-semibold">AI</span>
      </ContextMenuSubTrigger>
      <ContextMenuSubContent className="w-72">
        {skills === null && <ContextMenuItem disabled>Loading…</ContextMenuItem>}
        {skills !== null && fitting.length === 0 && (
          <ContextMenuItem disabled>No skills for this</ContextMenuItem>
        )}
        {recent.length > 0 && (
          <>
            <ContextMenuLabel>Recent</ContextMenuLabel>
            {recent.map((s) => (
              <ContextMenuItem
                key={`recent-${s.id}`}
                onSelect={() => {
                  run(s);
                }}
              >
                {s.name}
              </ContextMenuItem>
            ))}
            <ContextMenuSeparator />
          </>
        )}
        {fitting.length > 0 && <ContextMenuLabel>{heading}</ContextMenuLabel>}
        {fitting.map((s) => (
          <ContextMenuItem
            key={s.id}
            title={s.description}
            onSelect={() => {
              run(s);
            }}
          >
            <span className="flex min-w-0 flex-col">
              <span className="truncate">{s.name}</span>
              {s.description !== "" && (
                <span className="truncate text-[11px] text-muted-foreground">{s.description}</span>
              )}
            </span>
          </ContextMenuItem>
        ))}
        <ContextMenuSeparator />
        <ContextMenuItem
          onSelect={() => {
            useUiStore.getState().openSkillsSettings();
          }}
        >
          Manage skills…
        </ContextMenuItem>
        <div
          className="flex items-center gap-1.5 px-2 py-1.5 text-[11px] text-muted-foreground"
          data-testid="submenu-ai-status"
        >
          <span
            aria-hidden
            className={cn(
              "size-2 shrink-0 rounded-full",
              chip.state.tone === "ok"
                ? "bg-success"
                : chip.state.tone === "bad"
                  ? "bg-destructive"
                  : "bg-muted-foreground",
            )}
          />
          <span className="truncate">{chip.state.label}</span>
        </div>
      </ContextMenuSubContent>
    </ContextMenuSub>
  );
}
