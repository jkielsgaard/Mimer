import { ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { openFile } from "@/lib/actions";
import { useUiStore } from "@/stores/uiStore";

/** A picture shown large, over the app. Opened from the Images tab and by clicking a picture in a note. */
export function ImageLightbox() {
  const preview = useUiStore((s) => s.imagePreview);
  const close = useUiStore((s) => s.openImagePreview);
  return (
    <Dialog
      open={preview !== null}
      onOpenChange={(open) => {
        if (!open) close(null);
      }}
    >
      <DialogContent className="max-h-[92vh] w-auto max-w-[92vw] items-center">
        <DialogTitle className="max-w-[80vw] truncate pr-6 text-sm font-medium">
          {preview?.name ?? ""}
        </DialogTitle>
        <DialogDescription className="sr-only">Enlarged picture</DialogDescription>
        {preview !== null && (
          <img
            src={preview.src}
            alt={preview.name}
            className="max-h-[75vh] max-w-full rounded object-contain"
          />
        )}
        {preview?.path != null && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              void openFile(preview.path ?? "");
            }}
          >
            <ExternalLink /> Open in another app
          </Button>
        )}
      </DialogContent>
    </Dialog>
  );
}
