import { MoreHorizontal } from "lucide-react";
import { useState } from "react";
import { PromptDialog } from "@/components/PromptDialog";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { PINNED_TAG } from "@/lib/startPage";
import { nameError } from "@/lib/nameConflict";
import { isSystemTag, NOTE_TAGS } from "@/lib/noteTags";
import { useNoteTags } from "@/lib/useNoteTags";
import { dirname, joinPath } from "@/lib/utils";
import { useUiStore } from "@/stores/uiStore";
import { useVaultStore } from "@/stores/vaultStore";
import { TagChip, TagsDialog } from "./TagsDialog";

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
  // Mimer's tags first (in the order of the Tags window), then the person's own.
  const shown = [
    ...NOTE_TAGS.map((t) => t.tag).filter((t) => tags.includes(t)),
    ...tags.filter((t) => !isSystemTag(t)),
  ];
  return (
    <span className="flex items-center gap-1">
      {shown.map((t) => (
        <TagChip
          key={t}
          tag={t}
          onTakeOff={() => {
            void setTag(t, false);
          }}
        />
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

      <TagsDialog
        open={tagging}
        onClose={() => {
          setTagging(false);
        }}
        path={path}
        tags={tags}
        setTag={setTag}
      />
    </span>
  );
}
