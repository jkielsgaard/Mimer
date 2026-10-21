import { useEffect, useRef, useState } from "react";
import type { Settings } from "@/bindings/Settings";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { Button } from "@/components/ui/button";
import { formatBytes } from "@/lib/bytes";
import { useFoundryStore } from "@/stores/foundryStore";
import { ProblemPanel } from "./ProblemPanel";

interface Props {
  draft: Settings;
  onChange: (next: Settings) => void;
}

const MB = 1_000_000;

/** Settings → Built-in AI → Foundry Local: choose a model, download it, and clean up. */
export function FoundrySettings({ draft, onChange }: Props) {
  const status = useFoundryStore((s) => s.status);
  const catalog = useFoundryStore((s) => s.catalog);
  const catalogError = useFoundryStore((s) => s.catalogError);
  const catalogLoading = useFoundryStore((s) => s.catalogLoading);
  const install = useFoundryStore((s) => s.install);
  const setupHardware = useFoundryStore((s) => s.setupHardware);
  const cancelInstall = useFoundryStore((s) => s.cancelInstall);
  const remove = useFoundryStore((s) => s.remove);
  const [chosen, setChosen] = useState<string | null>(null);
  const [useForMimer, setUseForMimer] = useState(true);
  const [confirmAll, setConfirmAll] = useState(false);

  useEffect(() => {
    void useFoundryStore.getState().load();
  }, []);
  const available = status?.available ?? true;
  useEffect(() => {
    if (available && !useFoundryStore.getState().catalog) {
      void useFoundryStore.getState().loadCatalog();
    }
  }, [available]);

  const busy = status?.state === "installing";
  // When a download or the hardware set-up ends, the list is read again: it now shows where each
  // model can run with the hardware parts in place.
  const wasBusy = useRef(false);
  useEffect(() => {
    if (wasBusy.current && !busy) void useFoundryStore.getState().loadCatalog(true);
    wasBusy.current = busy;
  }, [busy]);

  if (!status) return <p className="text-sm text-muted-foreground">Loading…</p>;

  const awake = status.state === "awake" || status.state === "waking";
  const alias = chosen ?? (draft.ai.foundry.model || (catalog?.[0]?.alias ?? ""));
  const model = catalog?.find((m) => m.alias === alias);
  const downloaded = status.installed.some((m) => m.alias === alias);

  return (
    <div className="flex flex-col gap-5">
      <p className="text-sm text-muted-foreground">
        Foundry Local is Microsoft's runtime for AI models on this computer. It chooses the best
        hardware by itself: a neural processor (NPU) if there is one, otherwise the graphics card or
        the processor. Download once; Mimer wakes the model by itself when you use the AI, or press{" "}
        <strong>Wake</strong> in the status bar. Your notes never leave this computer.
      </p>

      {!available && (
        <p
          role="note"
          data-testid="foundry-unavailable"
          className="rounded border border-warning/60 bg-warning/15 p-2 text-xs"
        >
          {status.unavailableReason}
        </p>
      )}

      {status.note && (
        <p
          role="note"
          data-testid="foundry-note"
          className="rounded border bg-muted/40 p-2 text-xs"
        >
          {status.note}
        </p>
      )}

      <section className="flex flex-col gap-2" aria-label="Model">
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-semibold">1. Model</h3>
          {available && (
            <Button
              size="sm"
              variant="ghost"
              disabled={catalogLoading || busy}
              onClick={() => {
                void useFoundryStore.getState().loadCatalog(true);
              }}
            >
              Refresh list
            </Button>
          )}
          {available && (
            <Button
              size="sm"
              variant="outline"
              disabled={catalogLoading || busy || awake}
              title="Downloads the hardware parts from Microsoft (no model), then reads the list again"
              onClick={() => {
                void setupHardware();
              }}
            >
              Find my hardware
            </Button>
          )}
        </div>
        <p className="text-xs text-muted-foreground">
          Only models that can call tools are shown, because searching and changing notes needs
          them. “Runs on” says where Foundry Local runs the model on this computer. Until the
          hardware parts are downloaded, only the processor is listed: press{" "}
          <strong>Find my hardware</strong> to download them (no model) and see what your graphics
          card or neural processor can run.
        </p>
        {catalogLoading && (
          <p className="text-xs text-muted-foreground" role="status">
            Reading the model list from Microsoft… this can take a minute.
          </p>
        )}
        {catalogError && (
          <p role="alert" className="text-xs text-destructive">
            {catalogError}
          </p>
        )}
        {catalog && catalog.length === 0 && (
          <p className="text-xs text-muted-foreground">No model with tool support was found.</p>
        )}
        {catalog && catalog.length > 0 && (
          <ul role="radiogroup" aria-label="Foundry Local models" className="flex flex-col gap-1">
            {catalog.map((m) => {
              const has = status.installed.some((x) => x.alias === m.alias);
              return (
                <li key={m.alias}>
                  <button
                    type="button"
                    role="radio"
                    aria-checked={alias === m.alias}
                    disabled={busy}
                    className={`flex w-full items-center gap-2 rounded border px-2 py-1.5 text-left text-sm hover:bg-muted ${alias === m.alias ? "border-primary bg-accent" : ""}`}
                    onClick={() => {
                      setChosen(m.alias);
                    }}
                  >
                    <span className="min-w-0 flex-1 truncate">
                      {m.name}
                      {has && <span className="ml-2 text-xs text-success">downloaded</span>}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {formatBytes(m.sizeMb * MB)} · runs on {m.device || "?"}
                      {m.license ? ` · ${m.license}` : ""}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section className="flex flex-col gap-2" aria-label="Download">
        <h3 className="text-sm font-semibold">2. Download</h3>
        <div
          className="rounded border bg-muted/40 p-2 text-xs text-muted-foreground"
          data-testid="foundry-download-explained"
        >
          <p className="mb-1 font-medium text-foreground">
            Foundry Local is part of Mimer. Download fetches two things:
          </p>
          <ul className="list-disc space-y-0.5 pl-4">
            <li>
              <strong>The hardware parts</strong>: the pieces that let the model use your graphics
              card or neural processor. They come from Microsoft.
            </li>
            <li>
              <strong>The model</strong>
              {model ? ` (${model.name}, ${formatBytes(model.sizeMb * MB)})` : ""}: the language
              model itself, from Microsoft's Foundry Local catalog. Each model has its own licence,
              shown in the list.
            </li>
          </ul>
          <p className="mt-1">
            Nothing is downloaded until you press Download. The files are kept in Mimer's own
            folder, and while Mimer is awake the model uses memory; Sleep Mimer gives it back. When
            you use it, your notes stay on this computer.
          </p>
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={useForMimer}
            onChange={(e) => {
              setUseForMimer(e.target.checked);
            }}
          />
          Use Foundry Local for Mimer when the download is done
        </label>
        {busy ? (
          <div className="flex flex-col gap-1" data-testid="foundry-install-progress">
            <div className="flex items-center gap-2 text-xs">
              <span className="min-w-0 flex-1">{status.message}</span>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  void cancelInstall();
                }}
              >
                Cancel
              </Button>
            </div>
            <progress className="h-2 w-full" max={100} value={status.install?.done ?? 0} />
          </div>
        ) : (
          <div className="flex items-center gap-3">
            <Button
              disabled={!available || alias === "" || awake || downloaded}
              onClick={() => {
                // The backend saves the same when the download is done; this keeps the open
                // Settings window from undoing it when it is saved.
                onChange({
                  ...draft,
                  ai: {
                    ...draft.ai,
                    foundry: { model: alias },
                    defaultProviderId: useForMimer ? "foundry" : draft.ai.defaultProviderId,
                  },
                });
                void install(alias, useForMimer);
              }}
            >
              {downloaded ? "Downloaded" : "Download"}
            </Button>
            {awake && (
              <span className="text-xs text-muted-foreground">
                Put Mimer to sleep before downloading.
              </span>
            )}
          </div>
        )}
        {status.problem && !busy && <ProblemPanel problem={status.problem} />}
      </section>

      <section className="flex flex-col gap-2" aria-label="Downloaded models">
        <h3 className="text-sm font-semibold">3. Downloaded</h3>
        {status.installed.length === 0 ? (
          <p className="text-xs text-muted-foreground">Nothing is downloaded yet.</p>
        ) : (
          <ul className="flex flex-col gap-1">
            {status.installed.map((m) => (
              <li key={m.alias} className="flex items-center gap-2 text-sm">
                <label className="flex min-w-0 flex-1 items-center gap-2">
                  <input
                    type="radio"
                    name="foundry-model"
                    checked={draft.ai.foundry.model === m.alias}
                    disabled={busy}
                    onChange={() => {
                      onChange({ ...draft, ai: { ...draft.ai, foundry: { model: m.alias } } });
                    }}
                  />
                  <span className="min-w-0 flex-1 truncate">
                    {m.name} · {formatBytes(m.sizeMb * MB)}
                  </span>
                </label>
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={busy}
                  onClick={() => {
                    void remove({ kind: "model", alias: m.alias });
                  }}
                >
                  Remove
                </Button>
              </li>
            ))}
          </ul>
        )}
        <p className="break-all text-xs text-muted-foreground" data-testid="foundry-folder">
          Folder: {status.folder} · {formatBytes(status.diskBytes)} used
        </p>
        <div>
          <Button
            size="sm"
            variant="outline"
            disabled={busy}
            onClick={() => {
              setConfirmAll(true);
            }}
          >
            Remove all Foundry Local files
          </Button>
          <p className="mt-1 text-xs text-muted-foreground">
            On Windows, uninstalling Mimer also removes this folder. Removing puts Mimer to sleep
            first.
          </p>
        </div>
      </section>

      <ConfirmDialog
        open={confirmAll}
        title="Remove all Foundry Local files?"
        description="The downloaded models and the hardware parts are deleted. You can download them again."
        confirmLabel="Remove"
        destructive
        onCancel={() => {
          setConfirmAll(false);
        }}
        onConfirm={() => {
          setConfirmAll(false);
          void remove({ kind: "all" });
        }}
      />
    </div>
  );
}
