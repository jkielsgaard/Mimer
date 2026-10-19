import { Sparkles } from "lucide-react";
import { useEffect, useState } from "react";
import type { Skill } from "@/bindings/Skill";
import { AiOffNote } from "@/components/AiOffNote";
import { MenuText } from "@/components/MenuText";
import {
  ContextMenuItem,
  ContextMenuLabel,
  ContextMenuSub,
  ContextMenuSubContent,
  ContextMenuSubTrigger,
} from "@/components/ui/context-menu";
import { api } from "@/lib/api";
import { runSkillOn, skillFits } from "@/lib/skills";
import { useAiBlocked } from "@/lib/useAiBlocked";
import { reportError } from "@/stores/uiStore";

interface Props {
  /** The notes and folders the AI would work on, with whether each is a folder. */
  targets: { path: string; isDir: boolean }[];
}

/**
 * The "AI" entry of the file tree's right-click menu: Mimer's fixed AI commands that fit what was
 * clicked. Without an AI it says why, and the commands are off.
 */
export function SkillsSubmenu({ targets }: Props) {
  const [skills, setSkills] = useState<Skill[] | null>(null);
  const off = useAiBlocked();
  useEffect(() => {
    api.listSkills().then(setSkills).catch(reportError);
  }, []);
  const fitting = (skills ?? []).filter(
    (s) => s.builtin && targets.every((t) => skillFits(s, t.isDir)),
  );
  const onlyFolders = targets.every((t) => t.isDir);
  const onlyNotes = targets.every((t) => !t.isDir);
  const heading = onlyFolders ? "For a folder" : onlyNotes ? "For a note" : "For these items";
  return (
    <ContextMenuSub>
      <ContextMenuSubTrigger>
        <Sparkles aria-hidden /> AI
      </ContextMenuSubTrigger>
      <ContextMenuSubContent className="w-72">
        {off !== null && <AiOffNote reason={off} />}
        {skills === null && <ContextMenuItem disabled>Loading…</ContextMenuItem>}
        {skills !== null && fitting.length === 0 && (
          <ContextMenuItem disabled>Nothing for this</ContextMenuItem>
        )}
        {fitting.length > 0 && <ContextMenuLabel>{heading}</ContextMenuLabel>}
        {fitting.map((s) => (
          <ContextMenuItem
            key={s.id}
            disabled={off !== null}
            onSelect={() => {
              void runSkillOn(
                s,
                targets.map((t) => t.path),
              );
            }}
          >
            <MenuText label={s.name} hint={s.description} />
          </ContextMenuItem>
        ))}
      </ContextMenuSubContent>
    </ContextMenuSub>
  );
}
