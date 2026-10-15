import { useEffect, useState } from "react";
import type { TemplateInfo } from "@/bindings/TemplateInfo";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { api, toApiError } from "@/lib/api";
import { cn } from "@/lib/utils";
import { currentFolder, useVaultStore } from "@/stores/vaultStore";
import { useUiStore } from "@/stores/uiStore";

/** New note from template: pick a template (or a blank note), type a name, create. */
export function TemplatePicker() {
  const open = useUiStore((s) => s.templatePickerOpen);
  const setOpen = useUiStore((s) => s.setTemplatePickerOpen);
  const [templates, setTemplates] = useState<TemplateInfo[]>([]);
  const [choice, setChoice] = useState<string | null>(null);
  const [name, setName] = useState("Untitled");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setName("Untitled");
    setError(null);
    setChoice(null);
    api
      .listTemplates()
      .then(setTemplates)
      .catch((e: unknown) => {
        setError(toApiError(e).message);
      });
  }, [open]);

  const create = async (): Promise<void> => {
    const vault = useVaultStore.getState();
    const folder = currentFolder(vault) || (vault.vault?.config.newNoteFolder ?? "");
    const trimmed = name.trim();
    if (trimmed === "") {
      setError("Enter a name");
      return;
    }
    const path = await vault.createNoteFromTemplate(folder, trimmed, choice);
    if (path !== null) setOpen(false);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="text-base font-semibold">New note from template</DialogTitle>
          <DialogDescription className="text-sm text-muted-foreground">
            Templates come from <code>.vault/templates/</code>. Variables such as {"{{date}}"} are
            filled in.
          </DialogDescription>
        </DialogHeader>
        <div
          role="radiogroup"
          aria-label="Template"
          className="flex max-h-56 flex-col gap-1 overflow-auto"
        >
          {[null, ...templates.map((t) => t.name)].map((t) => (
            <button
              key={t ?? "__blank"}
              type="button"
              role="radio"
              aria-checked={choice === t}
              className={cn(
                "rounded px-2 py-1.5 text-left text-sm hover:bg-muted",
                choice === t && "bg-accent font-medium",
              )}
              onClick={() => {
                setChoice(t);
              }}
            >
              {t ?? "Blank note"}
            </button>
          ))}
          {templates.length === 0 && (
            <p className="px-2 text-xs text-muted-foreground">
              No templates yet. Use File → Save current note as template… to create one.
            </p>
          )}
        </div>
        <form
          className="flex flex-col gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            void create();
          }}
        >
          <label htmlFor="tpl-name" className="text-xs text-muted-foreground">
            Note name
          </label>
          <Input
            id="tpl-name"
            value={name}
            onChange={(e) => {
              setName(e.target.value);
              setError(null);
            }}
          />
          {error && (
            <p role="alert" className="text-xs text-destructive">
              {error}
            </p>
          )}
          <DialogFooter>
            <Button
              type="button"
              variant="ghost"
              onClick={() => {
                setOpen(false);
              }}
            >
              Cancel
            </Button>
            <Button type="submit">Create</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
