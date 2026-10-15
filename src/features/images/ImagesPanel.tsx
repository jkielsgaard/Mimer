import { ImageOff, Plus, Trash2 } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import type { ImageUsage } from "@/bindings/ImageUsage";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api";
import { assetUrlFor, openFile } from "@/lib/actions";
import { basename } from "@/lib/utils";
import { insertPictureIntoNote } from "@/lib/insertPicture";
import { reportError, useUiStore } from "@/stores/uiStore";
import { useVaultStore } from "@/stores/vaultStore";
import { InfoHint } from "@/components/InfoHint";

/** Every picture in the vault with the notes that show it, and a way to remove unused ones. */
export function ImagesPanel() {
  const indexNonce = useVaultStore((s) => s.indexNonce);
  const [items, setItems] = useState<ImageUsage[] | null>(null);
  const [unusedOnly, setUnusedOnly] = useState(false);
  const [removing, setRemoving] = useState<ImageUsage | null>(null);

  const load = useCallback(() => {
    api.imageUsage().then(setItems).catch(reportError);
  }, []);

  useEffect(load, [load, indexNonce]);

  const show = (img: ImageUsage): void => {
    useUiStore
      .getState()
      .openImagePreview({ src: assetUrlFor(img.path), name: basename(img.path), path: img.path });
  };

  if (items === null) return <p className="p-3 text-xs text-muted-foreground">Loading images…</p>;
  const unused = items.filter((i) => i.usedIn.length === 0);
  const shown = unusedOnly ? unused : items;

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex items-center gap-2 border-b px-3 py-2 text-xs">
        <span className="flex-1 text-muted-foreground">
          {items.length} images · {unused.length} not used in any note
        </span>
        <InfoHint
          label="Images"
          text="Pictures are kept in the attachments folder. A picture that no note shows can be moved to the trash. It stays in the version history, so you can bring it back."
          topic="images"
        />
        <label className="flex items-center gap-1.5">
          <input
            type="checkbox"
            checked={unusedOnly}
            onChange={(e) => {
              setUnusedOnly(e.target.checked);
            }}
          />
          Unused only
        </label>
      </div>
      <div className="min-h-0 flex-1 overflow-auto p-2">
        {items.length === 0 && (
          <p className="p-2 text-xs text-muted-foreground">
            No images yet. Paste a screenshot into a note, drag a picture in, or use the image
            button above the note.
          </p>
        )}
        {items.length > 0 && shown.length === 0 && (
          <p className="p-2 text-xs text-muted-foreground">Every image is used in a note.</p>
        )}
        <ul className="grid grid-cols-2 gap-2">
          {shown.map((img) => (
            <li key={img.path} className="flex flex-col gap-1 rounded-md border p-1.5">
              <button
                type="button"
                title="Click to enlarge, or drag it into a note"
                aria-label={`Enlarge ${basename(img.path)}`}
                draggable
                className="block rounded outline-none focus-visible:ring-2 focus-visible:ring-ring"
                onDragStart={(e) => {
                  e.dataTransfer.setData("application/x-mimer-path", img.path);
                  e.dataTransfer.effectAllowed = "copy";
                }}
                onClick={() => {
                  show(img);
                }}
              >
                <img
                  src={assetUrlFor(img.path)}
                  alt={basename(img.path)}
                  loading="lazy"
                  className="h-24 w-full rounded object-cover hover:opacity-80"
                />
              </button>
              <button
                type="button"
                className="truncate text-left text-xs font-medium hover:underline"
                title={img.path}
                onClick={() => {
                  show(img);
                }}
              >
                {basename(img.path)}
              </button>
              <div className="text-[11px] text-muted-foreground">
                {img.sizeKb} KB ·{" "}
                {img.usedIn.length === 0
                  ? "not used"
                  : `used in ${String(img.usedIn.length)} ${img.usedIn.length === 1 ? "note" : "notes"}`}
              </div>
              {img.usedIn.length > 0 && (
                <ul className="flex flex-col text-[11px]">
                  {img.usedIn.slice(0, 3).map((n) => (
                    <li key={n}>
                      <button
                        type="button"
                        className="truncate text-left text-primary hover:underline"
                        onClick={() => {
                          void openFile(n);
                        }}
                      >
                        {basename(n).replace(/\.md$/i, "")}
                      </button>
                    </li>
                  ))}
                  {img.usedIn.length > 3 && (
                    <li className="text-muted-foreground">…and {img.usedIn.length - 3} more</li>
                  )}
                </ul>
              )}
              <Button
                variant="ghost"
                size="sm"
                className="mt-auto justify-start"
                title="Insert this picture at the cursor in the open note"
                onClick={() => {
                  insertPictureIntoNote(img.path);
                }}
              >
                <Plus /> Insert in note
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="justify-start text-destructive"
                onClick={() => {
                  setRemoving(img);
                }}
              >
                <Trash2 /> Move to trash
              </Button>
            </li>
          ))}
        </ul>
        {unused.length === 0 && items.length > 0 && (
          <p className="mt-2 flex items-center gap-1 p-2 text-[11px] text-muted-foreground">
            <ImageOff className="size-3" aria-hidden /> Nothing to clean up.
          </p>
        )}
      </div>
      <ConfirmDialog
        open={removing !== null}
        title={removing ? `Move “${basename(removing.path)}” to the trash?` : "Move to trash"}
        description={
          removing && removing.usedIn.length > 0
            ? `It is shown in ${removing.usedIn.map((n) => basename(n).replace(/\.md$/i, "")).join(", ")}. Those notes will show a missing picture. You can bring it back from the version history.`
            : "It is not used in any note. You can bring it back from the version history."
        }
        confirmLabel="Move to trash"
        destructive
        onCancel={() => {
          setRemoving(null);
        }}
        onConfirm={() => {
          const path = removing?.path;
          setRemoving(null);
          if (path !== undefined) void useVaultStore.getState().deletePath(path).then(load);
        }}
      />
    </div>
  );
}
