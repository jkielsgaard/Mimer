import { BookmarkPlus, BookMarked, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { api, toApiError } from "@/lib/api";
import { reportError, useUiStore } from "@/stores/uiStore";
import { PromptDialog } from "@/components/PromptDialog";
import type { SavedPrompt } from "@/bindings/SavedPrompt";

interface Props {
  /** Current text in the message box (saved when the user chooses "Save current text"). */
  draft: string;
  onInsert: (text: string) => void;
}

/** Saved prompts: insert one into the message box, or save the current text as a new prompt. */
export function PromptsMenu({ draft, onInsert }: Props) {
  const [prompts, setPrompts] = useState<SavedPrompt[]>([]);
  const [saving, setSaving] = useState(false);

  const load = (): void => {
    api.listPrompts().then(setPrompts).catch(reportError);
  };

  useEffect(load, []);

  return (
    <>
      <DropdownMenu
        onOpenChange={(open) => {
          if (open) load();
        }}
      >
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="sm" aria-label="Saved prompts">
            <BookMarked /> Prompts
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent className="max-h-80 w-72 overflow-auto">
          {prompts.length === 0 && <DropdownMenuItem disabled>No saved prompts</DropdownMenuItem>}
          {prompts.map((p) => (
            <DropdownMenuItem
              key={p.id}
              onSelect={() => {
                onInsert(p.text);
              }}
            >
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[13px]">{p.title}</span>
                <span className="block truncate text-[11px] text-muted-foreground">
                  {p.text.slice(0, 60)}
                </span>
              </span>
              <button
                type="button"
                aria-label="Remove prompt"
                className="rounded p-1 text-muted-foreground hover:text-destructive"
                onClick={(e) => {
                  e.stopPropagation();
                  e.preventDefault();
                  api.removePrompt(p.id).then(load).catch(reportError);
                }}
              >
                <Trash2 className="size-3.5" />
              </button>
            </DropdownMenuItem>
          ))}
          <DropdownMenuSeparator />
          <DropdownMenuItem
            disabled={draft.trim() === ""}
            onSelect={() => {
              setSaving(true);
            }}
          >
            <BookmarkPlus /> Save current text as prompt…
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <PromptDialog
        open={saving}
        title="Save prompt"
        label="Title"
        confirmLabel="Save"
        validate={(v) => (v.trim() === "" ? "Enter a title" : null)}
        onCancel={() => {
          setSaving(false);
        }}
        onSubmit={(title) => {
          setSaving(false);
          api
            .addPrompt(title, draft)
            .then(() => {
              useUiStore.getState().toast("Prompt saved", "success");
              load();
            })
            .catch((e: unknown) => {
              useUiStore.getState().toast(toApiError(e).message, "error");
            });
        }}
      />
    </>
  );
}
