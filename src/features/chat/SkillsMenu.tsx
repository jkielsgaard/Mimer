import { Download, Settings2, Sparkles, Telescope } from "lucide-react";
import { useState } from "react";
import type { Skill } from "@/bindings/Skill";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { api } from "@/lib/api";
import { useChatStore } from "@/stores/chatStore";
import { reportError, useUiStore } from "@/stores/uiStore";

interface Props {
  /** Called after a skill is chosen, so the message box can take focus. */
  onChosen?: () => void;
}

/** Skills: jobs Mimer carries out itself on the attached notes, plus the research prompt tools. */
export function SkillsMenu({ onChosen }: Props) {
  const ui = useUiStore();
  const [skills, setSkills] = useState<Skill[]>([]);
  const load = (): void => {
    api.listSkills().then(setSkills).catch(reportError);
  };
  return (
    <DropdownMenu
      onOpenChange={(open) => {
        if (open) load();
      }}
    >
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="sm" aria-label="Skills for Mimer">
          <Sparkles /> Skills
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent className="max-h-96 w-72 overflow-auto">
        {skills.length === 0 && <DropdownMenuItem disabled>Loading…</DropdownMenuItem>}
        {skills.map((s) => (
          <DropdownMenuItem
            key={s.id}
            onSelect={() => {
              useChatStore.getState().setDraftSkill(s);
              onChosen?.();
            }}
          >
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[13px]">{s.name}</span>
              <span className="block truncate text-[11px] text-muted-foreground">
                {s.description}
              </span>
            </span>
          </DropdownMenuItem>
        ))}
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onSelect={() => {
            ui.openSkillsSettings();
          }}
        >
          <Settings2 /> Manage skills…
        </DropdownMenuItem>
        <DropdownMenuItem
          onSelect={() => {
            ui.setResearchOpen(true);
          }}
        >
          <Telescope /> Write a research prompt…
        </DropdownMenuItem>
        <DropdownMenuItem
          onSelect={() => {
            ui.setImportAnswerOpen(true);
          }}
        >
          <Download /> Import an answer from a cloud AI…
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
