import { useEffect, useState } from "react";
import type { ExportFormat } from "@/bindings/ExportFormat";
import type { ExportRequest } from "@/bindings/ExportRequest";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { api } from "@/lib/api";
import { pickSavePath } from "@/lib/dialogs";
import { flushPendingWrites } from "@/lib/flush";
import { basename, cn, isInside, isMarkdown } from "@/lib/utils";
import { usePrintStore } from "@/stores/printStore";
import { reportError, useUiStore } from "@/stores/uiStore";
import { useVaultStore } from "@/stores/vaultStore";

const FORMATS: { id: ExportFormat; label: string; ext: string; filter: string }[] = [
  { id: "html", label: "HTML (one file, works offline)", ext: "html", filter: "HTML" },
  { id: "pdf", label: "PDF (through the print dialog)", ext: "pdf", filter: "PDF" },
  { id: "docx", label: "Word (.docx)", ext: "docx", filter: "Word" },
];

/** Export a note or a folder as HTML, PDF or Word. */
export function ExportDialog() {
  const target = useUiStore((s) => s.exportDialog);
  const close = (): void => {
    useUiStore.getState().openExportDialog(null);
  };
  const files = useVaultStore((s) => s.files);
  const [format, setFormat] = useState<ExportFormat>("html");
  const [toc, setToc] = useState(true);
  const [properties, setProperties] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (target) {
      setFormat("html");
      setToc(true);
      setProperties(false);
    }
  }, [target]);

  if (!target) return null;
  const count = target.isFolder
    ? files.filter((f) => isMarkdown(f) && isInside(f, target.path)).length
    : 1;
  const name = basename(target.path) || "vault";
  const what = target.isFolder
    ? `Folder “${name}” (${count} note${count === 1 ? "" : "s"})`
    : `Note “${name}”`;

  const run = async (): Promise<void> => {
    const request: ExportRequest = {
      scope: target.isFolder ? "folder" : "note",
      path: target.path,
      format,
      includeToc: target.isFolder && toc,
      includeProperties: properties,
    };
    if (format === "pdf") {
      close();
      await usePrintStore.getState().start(request, name);
      return;
    }
    const spec = FORMATS.find((f) => f.id === format);
    const chosen = await pickSavePath(
      `${name.replace(/\.md$/i, "")}.${spec?.ext ?? "html"}`,
      spec?.ext ?? "html",
      spec?.filter ?? "File",
    );
    if (chosen === null) return;
    setBusy(true);
    try {
      await flushPendingWrites();
      const result = await api.exportDocument(request, chosen);
      useUiStore
        .getState()
        .toast(`Exported ${result.notesIncluded} note(s) to ${basename(chosen)}`, "success");
      close();
    } catch (e) {
      reportError(e);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog
      open
      onOpenChange={(o) => {
        if (!o) close();
      }}
    >
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="text-base font-semibold">Export</DialogTitle>
          <DialogDescription className="text-sm text-muted-foreground">{what}</DialogDescription>
        </DialogHeader>
        <fieldset className="flex flex-col gap-1.5">
          <legend className="mb-1 text-xs font-medium text-muted-foreground">Format</legend>
          {FORMATS.map((f) => (
            <label
              key={f.id}
              className={cn("flex items-center gap-2 rounded px-2 py-1 text-sm hover:bg-muted")}
            >
              <input
                type="radio"
                name="export-format"
                value={f.id}
                checked={format === f.id}
                onChange={() => {
                  setFormat(f.id);
                }}
              />
              {f.label}
            </label>
          ))}
        </fieldset>
        {target.isFolder && (
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={toc}
              onChange={(e) => {
                setToc(e.target.checked);
              }}
            />
            Include table of contents
          </label>
        )}
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={properties}
            onChange={(e) => {
              setProperties(e.target.checked);
            }}
          />
          Include properties (frontmatter)
        </label>
        <DialogFooter>
          <Button variant="ghost" onClick={close}>
            Cancel
          </Button>
          <Button disabled={busy} onClick={() => void run()}>
            {busy ? "Exporting…" : "Export…"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
