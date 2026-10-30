import { useEffect, useMemo, useState } from "react";
import type { Backend } from "@/bindings/Backend";
import type { CpuVendor } from "@/bindings/CpuVendor";
import type { FlashAttention } from "@/bindings/FlashAttention";
import type { GpuUse } from "@/bindings/GpuUse";
import type { GpuVendor } from "@/bindings/GpuVendor";
import type { Settings } from "@/bindings/Settings";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { InfoHint } from "@/components/InfoHint";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { formatBytes, percent } from "@/lib/bytes";
import { pickModelFile } from "@/lib/dialogs";
import { useEngineStore } from "@/stores/engineStore";
import { reportError } from "@/stores/uiStore";
import { ProblemPanel } from "./ProblemPanel";
import { Checkbox } from "@/components/ui/checkbox";
import { Radio } from "@/components/ui/radio";

interface Props {
  draft: Settings;
  onChange: (next: Settings) => void;
}

const CPUS: { id: CpuVendor; label: string }[] = [
  { id: "amd", label: "AMD" },
  { id: "intel", label: "Intel" },
  { id: "other", label: "Other / not sure" },
];
const GPUS: { id: GpuVendor; label: string }[] = [
  { id: "nvidia", label: "Nvidia" },
  { id: "amd", label: "AMD" },
  { id: "intel", label: "Intel" },
  { id: "none", label: "None: use the processor only" },
];

/** Settings → Built-in AI: choose hardware and model, download, tune, and clean up. */
export function BuiltInAiSettings({ draft, onChange }: Props) {
  const status = useEngineStore((s) => s.status);
  const catalog = useEngineStore((s) => s.catalog);
  const hardware = useEngineStore((s) => s.hardware);
  const install = useEngineStore((s) => s.install);
  const cancelInstall = useEngineStore((s) => s.cancelInstall);
  const addModel = useEngineStore((s) => s.addModel);
  const remove = useEngineStore((s) => s.remove);
  const [useForMimer, setUseForMimer] = useState(true);
  const [confirmAll, setConfirmAll] = useState(false);
  const b = draft.ai.builtin;
  const setB = (patch: Partial<Settings["ai"]["builtin"]>): void => {
    onChange({ ...draft, ai: { ...draft.ai, builtin: { ...b, ...patch } } });
  };

  useEffect(() => {
    void useEngineStore.getState().load();
    void useEngineStore.getState().loadHardware();
  }, []);

  // The first time, pre-select what was found on this computer.
  const [preselected, setPreselected] = useState(false);
  useEffect(() => {
    if (preselected || !hardware || !catalog || !status) return;
    setPreselected(true);
    if (status.engine !== null || b.gpu !== "none" || b.cpu !== "other") return;
    const gpu = hardware.recommendedGpu;
    const backend = catalog.backends.find((x) => x.defaultFor.includes(gpu))?.id ?? b.backend;
    setB({ cpu: hardware.cpuVendor, gpu, backend });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hardware, catalog, status, preselected]);

  const backend = catalog?.backends.find((x) => x.id === b.backend);
  const model = catalog?.models.find((m) => m.id === b.modelId);
  const custom = status?.models.find((m) => m.id === b.modelId && m.custom);
  const installed = status?.models.some((m) => m.id === b.modelId) ?? false;
  const engineReady = status?.engine?.backend === b.backend;
  const busy = status?.state === "installing";
  const awake = status?.state === "awake" || status?.state === "waking";

  const toDownload = useMemo(() => {
    let total = 0;
    if (!engineReady) total += backend?.downloadBytes ?? 0;
    if (!installed && model) total += model.sizeBytes;
    return total;
  }, [engineReady, installed, backend, model]);

  const ramWarning =
    hardware?.ramGb != null && model && hardware.ramGb < model.ramGb
      ? `This computer has about ${String(hardware.ramGb)} GB of memory. This model needs about ${String(model.ramGb)} GB, so it may be slow or fail to load. A lighter model is a better choice.`
      : null;

  if (!catalog || !status) {
    return <p className="text-sm text-muted-foreground">Loading…</p>;
  }
  if (catalog.unavailableReason) {
    return (
      <p
        role="note"
        className="rounded border bg-muted/50 p-3 text-sm"
        data-testid="engine-unavailable"
      >
        {catalog.unavailableReason}
      </p>
    );
  }
  if (catalog.backends.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        The built-in AI works on Windows and Linux only.
      </p>
    );
  }

  const numberField = (
    id: string,
    label: string,
    value: number,
    min: number,
    max: number,
    set: (n: number) => void,
    hint?: string,
    step = 1,
  ) => (
    <div className="flex flex-col gap-1">
      <Label htmlFor={id}>{label}</Label>
      <Input
        data-no-ai
        id={id}
        type="number"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => {
          const n = Math.round(Number(e.target.value));
          set(Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : min);
        }}
      />
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );

  return (
    <div className="flex flex-col gap-5">
      <p className="text-sm text-muted-foreground">
        Run Mimer's AI on this computer without LM Studio. Download once; Mimer wakes the model by
        itself when you use the AI, or press <strong>Wake</strong> in the status bar. Your notes
        never leave this computer.
      </p>

      <section className="flex flex-col gap-3" aria-label="Your computer">
        <h3 className="text-sm font-semibold">1. Your computer</h3>
        {hardware && (
          <p className="text-xs text-muted-foreground" data-testid="hardware-found">
            Found: {hardware.cpuName !== "" ? hardware.cpuName : "a processor"} (
            {String(hardware.cpuThreads)} threads)
            {hardware.ramGb !== null && `, ${String(hardware.ramGb)} GB memory`}
            {hardware.gpus.length > 0
              ? `, ${hardware.gpus.map((g) => g.name).join(" and ")}`
              : ", no graphics card"}
            .
          </p>
        )}
        <div className="grid grid-cols-2 gap-3">
          <div className="flex flex-col gap-1">
            <Label htmlFor="bi-cpu">Processor (CPU)</Label>
            <Select
              id="bi-cpu"
              value={b.cpu}
              disabled={busy || awake}
              onChange={(e) => {
                setB({ cpu: e.target.value as CpuVendor });
              }}
            >
              {CPUS.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.label}
                </option>
              ))}
            </Select>
          </div>
          <div className="flex flex-col gap-1">
            <Label htmlFor="bi-gpu">Graphics card (GPU)</Label>
            <Select
              id="bi-gpu"
              value={b.gpu}
              disabled={busy || awake}
              onChange={(e) => {
                const gpu = e.target.value as GpuVendor;
                const next = catalog.backends.find((x) => x.defaultFor.includes(gpu))?.id;
                setB({ gpu, ...(next ? { backend: next } : {}) });
              }}
            >
              {GPUS.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.label}
                </option>
              ))}
            </Select>
          </div>
        </div>
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-1.5">
            <Label htmlFor="bi-backend">Engine to download</Label>
            <InfoHint
              label="Engine"
              text="The program that runs the model. Choosing your graphics card picks the best one. The same processor engine works for AMD and Intel. If a graphics engine fails, try CPU only."
              topic="mimer"
            />
          </div>
          <Select
            id="bi-backend"
            value={b.backend}
            disabled={busy || awake}
            onChange={(e) => {
              setB({ backend: e.target.value as Backend });
            }}
          >
            {catalog.backends
              .filter((x) => !x.advanced)
              .map((x) => (
                <option key={x.id} value={x.id}>
                  {x.label} · {formatBytes(x.downloadBytes)}
                </option>
              ))}
            <optgroup label="Advanced">
              {catalog.backends
                .filter((x) => x.advanced)
                .map((x) => (
                  <option key={x.id} value={x.id}>
                    {x.label} · {formatBytes(x.downloadBytes)}
                  </option>
                ))}
            </optgroup>
          </Select>
          {backend && <p className="text-xs text-muted-foreground">{backend.description}</p>}
        </div>
      </section>

      <section className="flex flex-col gap-2" aria-label="Model">
        <h3 className="text-sm font-semibold">2. Model</h3>
        <div role="radiogroup" aria-label="Model" className="flex flex-col gap-1.5">
          {catalog.models.map((m) => (
            <label
              key={m.id}
              className="flex cursor-pointer items-start gap-2 rounded-md border p-2 text-sm has-[:checked]:border-primary has-[:checked]:bg-accent/40"
            >
              <Radio
                name="bi-model"
                className="mt-1"
                checked={b.modelId === m.id}
                disabled={busy || awake}
                onChange={() => {
                  setB({ modelId: m.id });
                }}
              />
              <span className="min-w-0 flex-1">
                <span className="font-medium">{m.name}</span>
                <span className="ml-2 text-xs text-muted-foreground">
                  {formatBytes(m.sizeBytes)}
                  {status.models.some((x) => x.id === m.id) && " · downloaded"}
                </span>
                <span className="block text-xs text-muted-foreground">{m.description}</span>
              </span>
            </label>
          ))}
          {status.models
            .filter((m) => m.custom)
            .map((m) => (
              <label
                key={m.id}
                className="flex cursor-pointer items-start gap-2 rounded-md border p-2 text-sm has-[:checked]:border-primary has-[:checked]:bg-accent/40"
              >
                <Radio
                  name="bi-model"
                  className="mt-1"
                  checked={b.modelId === m.id}
                  disabled={busy || awake}
                  onChange={() => {
                    setB({ modelId: m.id });
                  }}
                />
                <span className="min-w-0 flex-1">
                  <span className="font-medium">{m.name}</span>
                  <span className="ml-2 text-xs text-muted-foreground">
                    {formatBytes(m.sizeBytes)} · your own file
                  </span>
                </span>
              </label>
            ))}
        </div>
        <div>
          <Button
            variant="outline"
            size="sm"
            disabled={busy || awake}
            onClick={() => {
              pickModelFile()
                .then((p) => (p ? addModel(p) : undefined))
                .catch(reportError);
            }}
          >
            Add my own model file…
          </Button>
          <p className="mt-1 text-xs text-muted-foreground">
            A <code>.gguf</code> file. It is copied into Mimer's folder.
          </p>
        </div>
        {ramWarning && (
          <p role="note" className="rounded border border-warning/60 bg-warning/15 p-2 text-xs">
            {ramWarning}
          </p>
        )}
      </section>

      <section className="flex flex-col gap-2" aria-label="Download">
        <h3 className="text-sm font-semibold">3. Download</h3>
        <div
          className="rounded border bg-muted/40 p-2 text-xs text-muted-foreground"
          data-testid="download-explained"
        >
          <p className="mb-1 font-medium text-foreground">
            The built-in AI is not part of Mimer. Download fetches two things:
          </p>
          <ul className="list-disc space-y-0.5 pl-4">
            <li>
              <strong>The engine</strong>
              {backend ? ` (${backend.label}, ${formatBytes(backend.downloadBytes)})` : ""}: the
              open-source program <em>llama.cpp</em> (MIT licence), from github.com. It runs the
              model.
            </li>
            <li>
              <strong>The model</strong>
              {model ? ` (${model.name}, ${formatBytes(model.sizeBytes)})` : ""}: the language model
              itself, Google Gemma 4 (Apache-2.0 licence), from huggingface.co.
            </li>
          </ul>
          <p className="mt-1">
            Nothing is downloaded until you press Download. Every file is checked against a fixed
            checksum and kept in Mimer's own folder (shown below), and it takes about as much disk
            space as the download. While Mimer is awake the model uses about{" "}
            {model ? `${String(model.ramGb)} GB` : "several GB"} of memory; Sleep Mimer gives it
            back. When you use it, your notes stay on this computer.
          </p>
        </div>
        <label className="flex items-center gap-2 text-sm">
          <Checkbox
            checked={useForMimer}
            onChange={(e) => {
              setUseForMimer(e.target.checked);
            }}
          />
          Use the built-in AI for Mimer when the download is done
        </label>
        {status.state === "installing" ? (
          <div className="flex flex-col gap-1" data-testid="install-progress">
            <div className="flex items-center gap-2 text-xs">
              <span className="min-w-0 flex-1">
                {status.message}
                {status.install &&
                  status.install.total > 0 &&
                  ` ${String(percent(status.install.done, status.install.total))}% (${formatBytes(status.install.done)} of ${formatBytes(status.install.total)})`}
              </span>
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
            <progress
              className="h-2 w-full"
              max={100}
              value={status.install ? percent(status.install.done, status.install.total) : 0}
            />
          </div>
        ) : (
          <div className="flex items-center gap-3">
            <Button
              disabled={awake || (engineReady && (installed || custom !== undefined))}
              onClick={() => {
                if (useForMimer) {
                  onChange({
                    ...draft,
                    ai: { ...draft.ai, defaultProviderId: "builtin", builtin: { ...b } },
                  });
                }
                void install({
                  cpu: b.cpu,
                  gpu: b.gpu,
                  backend: b.backend,
                  modelId: b.modelId,
                  useForMimer,
                });
              }}
            >
              {engineReady && installed ? "Downloaded" : "Download"}
            </Button>
            <span className="text-xs text-muted-foreground">
              {toDownload > 0
                ? `${formatBytes(toDownload)} will be downloaded. Make sure you have the disk space and a good connection; you can cancel and continue later.`
                : "Everything you chose is downloaded."}
            </span>
          </div>
        )}
        {status.problem && status.state !== "installing" && (
          <ProblemPanel problem={status.problem} />
        )}
      </section>

      <section className="flex flex-col gap-3" aria-label="Settings">
        <div className="flex items-center gap-1.5">
          <h3 className="text-sm font-semibold">4. Settings</h3>
          <InfoHint
            label="Built-in AI settings"
            text="These apply the next time Mimer is woken. If Mimer is awake, press Sleep Mimer and then Wake Mimer."
            topic="mimer"
          />
        </div>
        <div className="grid grid-cols-2 gap-3">
          {numberField(
            "bi-context",
            "Context size (tokens)",
            b.contextTokens,
            2048,
            131072,
            (n) => {
              setB({ contextTokens: n });
            },
            "How much text Mimer can keep in mind. More uses much more memory.",
            1024,
          )}
          <div className="flex flex-col gap-1">
            <Label htmlFor="bi-gpuuse">Use the graphics card</Label>
            <Select
              id="bi-gpuuse"
              value={b.gpuUse}
              onChange={(e) => {
                setB({ gpuUse: e.target.value as GpuUse });
              }}
            >
              <option value="auto">Automatically</option>
              <option value="all">As much as possible</option>
              <option value="none">Not at all (processor only)</option>
              <option value="custom">A number of layers…</option>
            </Select>
            <p className="text-xs text-muted-foreground">
              Lower it if the model does not fit in the graphics card's memory.
            </p>
          </div>
          {b.gpuUse === "custom" &&
            numberField(
              "bi-layers",
              "Layers on the graphics card",
              b.gpuLayerCount,
              0,
              999,
              (n) => {
                setB({ gpuLayerCount: n });
              },
            )}
          {numberField(
            "bi-threads",
            "Processor threads",
            b.threads,
            0,
            256,
            (n) => {
              setB({ threads: n });
            },
            "0 lets the engine decide.",
          )}
          <div className="flex flex-col gap-1">
            <Label htmlFor="bi-fa">Flash attention</Label>
            <Select
              id="bi-fa"
              value={b.flashAttention}
              onChange={(e) => {
                setB({ flashAttention: e.target.value as FlashAttention });
              }}
            >
              <option value="auto">Automatic</option>
              <option value="on">On</option>
              <option value="off">Off</option>
            </Select>
          </div>
          {numberField(
            "bi-idle",
            "Sleep after (minutes without use)",
            b.idleSleepMinutes,
            0,
            1440,
            (n) => {
              setB({ idleSleepMinutes: n });
            },
            "Frees the memory by itself. 0 means never.",
          )}
        </div>
        <label className="flex items-start gap-2 text-sm">
          <Checkbox
            className="mt-1"
            checked={b.thinking}
            onChange={(e) => {
              setB({ thinking: e.target.checked });
            }}
          />
          <span>
            Let the model think before it answers
            <span className="block text-xs text-muted-foreground">
              Slower. Off is usually best for notes.
            </span>
          </span>
        </label>
      </section>

      <section className="flex flex-col gap-2" aria-label="Files">
        <h3 className="text-sm font-semibold">5. Files</h3>
        <p className="break-all text-xs text-muted-foreground" data-testid="engine-folder">
          Folder: {status.folder}
          {status.diskBytes > 0 && ` · ${formatBytes(status.diskBytes)} used`}
        </p>
        {status.folderNote && <p className="text-xs">{status.folderNote}</p>}
        <div className="flex flex-wrap gap-2">
          {status.models.map((m) => (
            <Button
              key={m.id}
              size="sm"
              variant="outline"
              disabled={busy}
              onClick={() => {
                void remove({ kind: "model", id: m.id });
              }}
            >
              Remove {m.name}
            </Button>
          ))}
          {status.engine && (
            <Button
              size="sm"
              variant="outline"
              disabled={busy}
              onClick={() => {
                void remove({ kind: "engine" });
              }}
            >
              Remove the engine
            </Button>
          )}
          <Button
            size="sm"
            variant="outline"
            disabled={busy}
            onClick={() => {
              setConfirmAll(true);
            }}
          >
            Remove all files
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">
          On Windows, uninstalling Mimer also removes this folder. Removing puts Mimer to sleep
          first.
        </p>
      </section>

      <ConfirmDialog
        open={confirmAll}
        title="Remove all built-in AI files?"
        description="The engine, the models and the logs are deleted from this computer. Your notes are not touched. You can download them again later."
        confirmLabel="Remove all files"
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
