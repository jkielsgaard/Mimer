import { useEffect, useState } from "react";
import type { ImportPlan } from "@/bindings/ImportPlan";
import type { ImportReport } from "@/bindings/ImportReport";
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
import { Label } from "@/components/ui/label";
import { api, toApiError } from "@/lib/api";
import { pickFolder } from "@/lib/dialogs";
import { useUiStore } from "@/stores/uiStore";
import { useVaultStore } from "@/stores/vaultStore";
import { ImportFileList } from "./ImportFileList";
import { InfoHint } from "@/components/InfoHint";

type Step = "choose" | "scanning" | "preview" | "running" | "done";

/** Size in a readable unit. */
function sizeLabel(bytes: number): string {
  return bytes < 1024 * 1024
    ? `${String(Math.max(1, Math.round(bytes / 1024)))} KB`
    : `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * File → Import notes from folder: pick a folder of Markdown files (for example the output of a
 * OneNote exporter), check what will happen, choose where in the vault they go, import.
 */
export function ImportDialog() {
  const open = useUiStore((s) => s.importOpen);
  const setOpen = useUiStore((s) => s.setImportOpen);
  const [step, setStep] = useState<Step>("choose");
  const [source, setSource] = useState<string | null>(null);
  const [plan, setPlan] = useState<ImportPlan | null>(null);
  const [dest, setDest] = useState("");
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [report, setReport] = useState<ImportReport | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setStep("choose");
    setSource(null);
    setPlan(null);
    setReport(null);
    setError(null);
    setProgress({ done: 0, total: 0 });
  }, [open]);

  const choose = async (): Promise<void> => {
    setError(null);
    try {
      const picked = await pickFolder();
      if (picked === null) return;
      setSource(picked);
      setStep("scanning");
      const found = await api.scanImport(picked);
      setPlan(found);
      setDest(`Imported/${found.sourceName}`);
      setStep("preview");
    } catch (e) {
      setError(toApiError(e).message);
      setStep("choose");
    }
  };

  const start = async (): Promise<void> => {
    if (source === null) return;
    setError(null);
    setStep("running");
    setProgress({ done: 0, total: plan?.files.length ?? 0 });
    try {
      const done = await api.runImport(source, dest, (e) => {
        setProgress({ done: e.done, total: e.total });
      });
      setReport(done);
      setStep("done");
      await useVaultStore.getState().refreshTree();
    } catch (e) {
      setError(toApiError(e).message);
      setStep("preview");
    }
  };

  const total = progress.total === 0 ? 1 : progress.total;

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        // Closing during an import would hide it; the user must press Cancel instead.
        if (!next && step === "running") return;
        setOpen(next);
      }}
    >
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="text-base font-semibold">Import notes from a folder</DialogTitle>
          <DialogDescription className="text-sm text-muted-foreground">
            Copies Markdown notes and their images into your vault. The folder you pick is only
            read, and nothing in your vault is overwritten.
          </DialogDescription>
        </DialogHeader>

        {error && (
          <p
            role="alert"
            className="rounded border border-destructive/50 px-3 py-2 text-xs text-destructive"
          >
            {error}
          </p>
        )}

        {(step === "choose" || step === "scanning") && (
          <div className="flex flex-col gap-3 text-sm">
            <details className="rounded border px-3 py-2 text-xs">
              <summary className="cursor-pointer font-medium">
                Coming from OneNote? How do I get a folder of Markdown files?
              </summary>
              <ol className="mt-2 list-decimal space-y-1 pl-4">
                <li>
                  On Windows with desktop OneNote, use the free tool OneNoteMdExporter (search for
                  “onenote-md-exporter” on GitHub) and export your notebook as Markdown.
                </li>
                <li>Pick the folder it creates here.</li>
                <li>
                  The full step-by-step guide is in docs/IMPORT-ONENOTE.md in the Mimer folder.
                </li>
              </ol>
            </details>
            <Button
              disabled={step === "scanning"}
              onClick={() => {
                void choose();
              }}
            >
              {step === "scanning" ? "Looking through the folder…" : "Choose folder…"}
            </Button>
          </div>
        )}

        {step === "preview" && plan && (
          <div className="flex flex-col gap-3 text-sm">
            <p>
              <strong>{plan.sourceName}</strong>: {plan.notes} notes and {plan.attachments}{" "}
              attachments ({sizeLabel(plan.totalBytes)}).
              {plan.notes + plan.attachments === 0 && " There is nothing to import in this folder."}
            </p>
            <div className="flex flex-col gap-1">
              <div className="flex items-center gap-1.5">
                <Label htmlFor="import-dest">Put them in this vault folder</Label>
                <InfoHint
                  label="Destination folder"
                  text="The notes are copied into this folder of your vault. It is created if it does not exist. Nothing is overwritten."
                  topic="import"
                />
              </div>
              <Input
                data-no-ai
                id="import-dest"
                value={dest}
                onChange={(e) => {
                  setDest(e.target.value);
                }}
              />
            </div>
            <ImportFileList
              title="Names that will change"
              rows={plan.renamed.map((r) => ({ name: r.from, note: `→ ${r.to}` }))}
            />
            <ImportFileList
              title="Left out"
              rows={plan.skipped.map((s) => ({ name: s.path, note: s.reason }))}
            />
          </div>
        )}

        {step === "running" && (
          <div className="flex flex-col gap-2 text-sm">
            <p role="status">
              Importing… {progress.done} of {progress.total} files
            </p>
            <progress
              className="h-2 w-full"
              aria-label="Import progress"
              max={total}
              value={progress.done}
            />
          </div>
        )}

        {step === "done" && report && (
          <div className="flex flex-col gap-3 text-sm">
            <p role="status">
              {report.cancelled ? "Import stopped. " : "Import finished. "}
              {report.importedNotes} notes and {report.importedAttachments} attachments are in{" "}
              <code>{report.destFolder}</code>.
            </p>
            {report.brokenLinks > 0 && (
              <p className="text-xs text-muted-foreground">
                {report.brokenLinks} links point at notes that are not in the vault. They show as
                unresolved links, and clicking one creates the note.
              </p>
            )}
            <p className="text-xs text-muted-foreground">
              Everything is saved in one version-history entry, so you can bring back the old state
              from the History tab.
            </p>
            <ImportFileList
              title="Names that changed"
              rows={report.renamed.map((r) => ({ name: r.from, note: `→ ${r.to}` }))}
            />
            <ImportFileList
              title="Left out"
              rows={report.skipped.map((s) => ({ name: s.path, note: s.reason }))}
            />
          </div>
        )}

        <DialogFooter>
          {step === "running" ? (
            <Button
              variant="destructive"
              onClick={() => {
                void api.cancelImport();
              }}
            >
              Cancel import
            </Button>
          ) : (
            <Button
              variant="ghost"
              onClick={() => {
                setOpen(false);
              }}
            >
              {step === "done" ? "Close" : "Cancel"}
            </Button>
          )}
          {step === "preview" && (
            <Button
              disabled={!plan || plan.notes + plan.attachments === 0 || dest.trim() === ""}
              onClick={() => {
                void start();
              }}
            >
              Import
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
