import { ListChecks, Telescope, Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useUiStore } from "@/stores/uiStore";
import { TASKS } from "./tasks";

interface Props {
  onInsert: (text: string) => void;
}

/** Ready-made jobs for Mimer, plus the research prompt for a cloud AI. */
export function TasksMenu({ onInsert }: Props) {
  const ui = useUiStore();
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="sm" aria-label="Tasks for Mimer">
          <ListChecks /> Tasks
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent className="max-h-96 w-72 overflow-auto">
        {TASKS.map((t) => (
          <DropdownMenuItem
            key={t.id}
            onSelect={() => {
              onInsert(t.prompt);
            }}
          >
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[13px]">{t.title}</span>
              <span className="block truncate text-[11px] text-muted-foreground">{t.hint}</span>
            </span>
          </DropdownMenuItem>
        ))}
        <DropdownMenuSeparator />
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
