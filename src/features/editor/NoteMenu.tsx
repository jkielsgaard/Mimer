import { MoreHorizontal, X } from "lucide-react";
import { useState } from "react";
import { PromptDialog } from "@/components/PromptDialog";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { PINNED_TAG } from "@/lib/startPage";
import { nameError } from "@/lib/nameConflict";
import { NOTE_TAGS } from "@/lib/noteTags";
import { useNoteTags } from "@/lib/useNoteTags";
import { dirname, joinPath } from "@/lib/utils";
import { useUiStore } from "@/stores/uiStore";
import { useVaultStore } from "@/stores/vaultStore";
import { PlainButton } from "@/components/ui/plain-button";
import { Checkbox } from "@/components/ui/checkbox";

/** The file name of a note without the folder and `.md`. */
function stem(path: string): string {
  return (path.split("/").pop() ?? path).replace(/\.md$/i, "");
}

/**
 * The `···` menu above a note: Rename, History, Tags and Export. A tag the note has shows beside
 * it as a chip with a cross that takes it off. A note without a tag shows only the button.
 */
export function NoteMenu({ path }: { path: string | null }) {
  const { tags, setTag } = useNoteTags(path);
  const tree = useVaultStore((s) => s.tree);
  const projects = useVaultStore((s) => s.projects);
  const [renaming, setRenaming] = useState(false);
  const [tagging, setTagging] = useState(false);
  const has = NOTE_TAGS.filter((t) => tags.includes(t.tag));
  return (
    <span className="flex items-center gap-1">
      {has.map((t) => (
        <span
          key={t.tag}
          className="inline-flex items-center gap-1 rounded-full border border-primary/30 bg-accent py-0.5 pl-2.5 pr-1 text-xs font-semibold text-accent-foreground"
        >
          {t.label}
          <PlainButton
            type="button"
            aria-label={`Take the tag ${t.label} off`}
            className="rounded-full p-0.5 hover:bg-background/60 focus-visible:ring-2 focus-visible:ring-ring"
            onClick={() => void setTag(t.tag, false)}
          >
            <X className="size-3" aria-hidden />
          </PlainButton>
        </span>
      ))}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            disabled={path === null}
            aria-label="More for this note"
            title="Rename, history, tags and export"
          >
            <MoreHorizontal />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56">
          <DropdownMenuItem
            onSelect={() => {
              setRenaming(true);
            }}
          >
            Rename…
          </DropdownMenuItem>
          <DropdownMenuItem
            onSelect={() => {
              useUiStore.getState().setRightTab("history");
            }}
          >
            History
          </DropdownMenuItem>
          <DropdownMenuItem
            onSelect={() => {
              void setTag(PINNED_TAG, !tags.includes(PINNED_TAG));
            }}
          >
            {tags.includes(PINNED_TAG) ? "Unpin from the start page" : "Pin to the start page"}
          </DropdownMenuItem>
          <DropdownMenuItem
            onSelect={() => {
              setTagging(true);
            }}
          >
            Tags…
          </DropdownMenuItem>
          <DropdownMenuItem
            onSelect={() => {
              if (path !== null) {
                useUiStore.getState().openExportDialog({ path, isFolder: false });
              }
            }}
          >
            Export…
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <PromptDialog
        open={renaming && path !== null}
        title="Rename"
        label="New name"
        confirmLabel="Rename"
        initialValue={path === null ? "" : stem(path)}
        validate={(v) =>
          path === null ? null : nameError(tree, projects, dirname(path), v, false, path)
        }
        onCancel={() => {
          setRenaming(false);
        }}
        onSubmit={(name) => {
          setRenaming(false);
          if (path === null) return;
          const trimmed = name.trim();
          const file = /\.md$/i.test(trimmed) ? trimmed : `${trimmed}.md`;
          void useVaultStore.getState().renamePath(path, joinPath(dirname(path), file));
        }}
      />

      <Dialog
        open={tagging}
        onOpenChange={(o) => {
          if (!o) setTagging(false);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>What is this note?</DialogTitle>
            <DialogDescription>
              The note stays where it is. Your own #tags in the text work as before.
            </DialogDescription>
          </DialogHeader>
          <ul className="flex flex-col gap-1">
            {NOTE_TAGS.map((t) => (
              <li key={t.tag}>
                <label className="flex cursor-pointer items-start gap-3 rounded-md px-2 py-2 hover:bg-muted">
                  <Checkbox
                    className="mt-1 size-4"
                    checked={tags.includes(t.tag)}
                    onChange={(e) => void setTag(t.tag, e.target.checked)}
                  />
                  <span className="flex flex-col">
                    <span className="text-sm font-semibold">{t.label}</span>
                    <span className="text-xs text-muted-foreground">{t.does}</span>
                  </span>
                </label>
              </li>
            ))}
          </ul>
          <DialogFooter>
            <Button
              onClick={() => {
                setTagging(false);
              }}
            >
              Done
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </span>
  );
}
