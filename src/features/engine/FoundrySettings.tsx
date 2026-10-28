import { useEffect, useRef, useState } from "react";
import type { Settings } from "@/bindings/Settings";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { Button } from "@/components/ui/button";
import { formatBytes } from "@/lib/bytes";
import { openLink } from "@/lib/openLink";
import { cn } from "@/lib/utils";
import { useFoundryStore } from "@/stores/foundryStore";
import {
  filterModels,
  FOUNDRY_MODELS_URL,
  goodFor,
  NO_FILTER,
  readsLabel,
  type ModelFilter,
} from "./foundryModels";
import { ModelFilters } from "./ModelFilters";
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
  const [filter, setFilter] = useState<ModelFilter>(NO_FILTER);

  useEffect(() => {
    void useFoundryStore.getState().load();
  }, []);
  const available = status?.available ?? true;
  // Nothing is asked of Microsoft before the person has chosen about the hardware parts.
  const hardware = status?.hardware ?? "unknown";
  /** The first time: the choice is asked and no model list is shown. */
  const asking = available && hardware === "unknown";
  useEffect(() => {
    if (available && hardware !== "unknown" && !useFoundryStore.getState().catalog) {
      void useFoundryStore.getState().loadCatalog();
    }
  }, [available, hardware]);

  const busy = status?.state === "installing";
  // When a download or the hardware set-up ends, the list is read again: it now shows where each
  // model can run with the hardware parts in place.
  const wasBusy = useRef(false);
  useEffect(() => {
    // Not before the person has chosen: then nothing is asked of Microsoft.
    if (wasBusy.current && !busy && hardware !== "unknown") {
      void useFoundryStore.getState().loadCatalog(true);
    }
    wasBusy.current = busy;
  }, [busy, hardware]);

  if (!status) return <p className="text-sm text-muted-foreground">Loading…</p>;

  const awake = status.state === "awake" || status.state === "waking";
  const installedAliases = new Set(status.installed.map((m) => m.alias));
  const shown = catalog ? filterModels(catalog, filter, installedAliases) : [];
  const alias = chosen ?? (draft.ai.foundry.model || (shown[0]?.alias ?? ""));
  const model = catalog?.find((m) => m.alias === alias);
  const toolsOf = (a: string) => catalog?.find((m) => m.alias === a)?.tools ?? true;
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

      {asking && (
        <section
          aria-label="The hardware parts"
          className="flex flex-col gap-2 rounded-lg border border-primary/30 bg-accent/30 p-3"
        >
          <h3 className="text-sm font-semibold">
            Can this computer use its graphics card or neural processor?
          </h3>
          <p className="text-xs text-muted-foreground">
            To find out, Mimer has to download the hardware parts from Microsoft. Without them only
            models for the processor (CPU) are shown, which are slower. Nothing is downloaded until
            you choose, and you can change it later.
          </p>
          {status.problem && !busy && <ProblemPanel problem={status.problem} />}
          {busy ? (
            <div className="flex flex-col gap-1" data-testid="foundry-hardware-progress">
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
            <div className="flex flex-wrap gap-2">
              <Button
                size="sm"
                onClick={() => {
                  void setupHardware();
                }}
              >
                Download and find my hardware
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  void useFoundryStore.getState().useCpuOnly();
                }}
              >
                Use only the processor
              </Button>
            </div>
          )}
        </section>
      )}

      {!asking && (
        <section className="flex flex-col gap-2" aria-label="Model">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-sm font-semibold">1. Choose a model</h3>
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
            {available && hardware === "cpuOnly" && (
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
            <span className="grow" />
            <button
              type="button"
              className="text-xs text-primary underline-offset-2 hover:underline"
              onClick={() => {
                void openLink(FOUNDRY_MODELS_URL);
              }}
            >
              All Foundry Local models at Microsoft ↗
            </button>
          </div>
          <p className="text-xs text-muted-foreground">
            Every chat model Foundry Local can run on this computer. Models for speech or images are
            left out, because Mimer only writes text. A model without tools can fix, rewrite and
            answer about the open note, but cannot search the vault or run skills. “Runs on” says
            where Foundry Local runs it.
            {hardware === "cpuOnly" && (
              <>
                {" "}
                You chose to use only the processor, so only models for it are listed. Press{" "}
                <strong>Find my hardware</strong> to download the hardware parts and see what your
                graphics card or neural processor can run.
              </>
            )}
          </p>
          {catalog && catalog.length > 0 && <ModelFilters filter={filter} onChange={setFilter} />}
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
            <p className="text-xs text-muted-foreground">No chat model was found.</p>
          )}
          {catalog && catalog.length > 0 && shown.length === 0 && (
            <p className="text-xs text-muted-foreground" data-testid="foundry-no-match">
              No model matches. Change the filters, or check the name on Microsoft's list.
            </p>
          )}
          {shown.length > 0 && (
            <ul
              role="radiogroup"
              aria-label="Foundry Local models"
              className="flex flex-col gap-1.5"
            >
              {shown.map((m) => {
                const has = installedAliases.has(m.alias);
                const facts = [
                  m.sizeMb > 0 ? formatBytes(m.sizeMb * MB) : "size unknown",
                  `runs on ${m.device || "?"}`,
                  readsLabel(m.contextTokens),
                  m.license,
                  has ? "downloaded" : null,
                ].filter((x) => x !== null && x !== "");
                return (
                  <li key={m.alias}>
                    <button
                      type="button"
                      role="radio"
                      aria-checked={alias === m.alias}
                      disabled={busy}
                      className={cn(
                        "flex w-full flex-col gap-0.5 rounded-md border px-3 py-2 text-left text-sm hover:bg-muted",
                        alias === m.alias && "border-primary bg-accent",
                      )}
                      onClick={() => {
                        setChosen(m.alias);
                      }}
                    >
                      <span className="flex items-center gap-2">
                        <span className="font-semibold">{m.name}</span>
                        {m.publisher && (
                          <span className="text-xs text-muted-foreground">{m.publisher}</span>
                        )}
                        <span className="grow" />
                        <span
                          className={cn(
                            "rounded-full px-2 text-[11px] font-semibold",
                            m.tools
                              ? "bg-success/15 text-success"
                              : "border border-warning text-warning",
                          )}
                        >
                          {m.tools ? "Can use tools" : "No tools"}
                        </span>
                      </span>
                      <span className="text-xs text-foreground/80">{goodFor(m).text}</span>
                      <span className="text-xs text-muted-foreground tabular-nums">
                        {facts.join(" · ")}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      )}

      {!asking && (
        <section className="flex flex-col gap-2" aria-label="Download">
          <h3 className="text-sm font-semibold">2. Download</h3>
          <div
            className="rounded border bg-muted/40 p-2 text-xs text-muted-foreground"
            data-testid="foundry-download-explained"
          >
            <p className="mb-1 font-medium text-foreground">
              Foundry Local is part of Mimer. Download fetches only the model
              {model ? ` (${model.name}, ${formatBytes(model.sizeMb * MB)})` : ""}: the language
              model itself, from Microsoft's Foundry Local catalog. Each model has its own licence,
              shown in the list.
            </p>
            <p>
              {hardware === "ready"
                ? "The hardware parts for your graphics card or neural processor are already downloaded."
                : "Only the processor is used; the hardware parts are not downloaded."}
            </p>
            <p className="mt-1">
              Nothing is downloaded until you press Download. The files are kept in Mimer's own
              folder, and while Mimer is awake the model uses memory; Sleep Mimer gives it back.
              When you use it, your notes stay on this computer.
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
                      foundry: { model: alias, tools: toolsOf(alias) },
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
      )}

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
                      onChange({
                        ...draft,
                        ai: {
                          ...draft.ai,
                          foundry: { model: m.alias, tools: toolsOf(m.alias) },
                        },
                      });
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
