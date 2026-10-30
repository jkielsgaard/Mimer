import { useState } from "react";
import type { Settings } from "@/bindings/Settings";
import { cn } from "@/lib/utils";
import { useEngineStore } from "@/stores/engineStore";
import { BuiltInAiSettings } from "./BuiltInAiSettings";
import { FoundrySettings } from "./FoundrySettings";
import { PHI_ID, PhiSilicaSettings, usePhiStatus } from "./PhiSilicaSettings";
import { PlainButton } from "@/components/ui/plain-button";

type Engine = "phi" | "llama" | "foundry";

const PHI_CHOICE = {
  id: "phi" as const,
  title: "Windows AI · Phi Silica",
  text: "Microsoft's small model, built into Windows 11 on Copilot+ PCs. Runs on the neural processor (NPU), nothing to download in Mimer. Only in the Microsoft Store version.",
};

const CHOICES: { id: Engine; title: string; text: string }[] = [
  {
    id: "foundry",
    title: "Foundry Local",
    text: "Microsoft's runtime. Picks the best hardware by itself, including a neural processor (NPU). Windows 11 (24H2 or later) and Linux. The only choice in the Microsoft Store version.",
  },
  {
    id: "llama",
    title: "llama.cpp",
    text: "The open-source engine with Google's Gemma models. Works on many graphics cards (Nvidia, AMD, Intel) and processors. Windows and Linux, but not in the Microsoft Store version.",
  },
];

/**
 * Settings → Built-in AI: which engine runs the model on this computer, and then that engine's
 * own settings. There is no default: a new user chooses. Phi Silica is only offered in the
 * Microsoft Store version, where llama.cpp is not available.
 */
export function BuiltInAiTab({
  draft,
  onChange,
}: {
  draft: Settings;
  onChange: (next: Settings) => void;
}) {
  const llamaReady = useEngineStore((s) => s.status?.engine != null);
  const [phi, setPhi] = usePhiStatus();
  const store = phi?.shown === true;
  const [engine, setEngine] = useState<Engine | null>(() => {
    const d = draft.ai.defaultProviderId;
    if (d === PHI_ID) return "phi";
    if (d === "foundry" || draft.ai.foundry.model !== "") return "foundry";
    if (d === "builtin" || llamaReady) return "llama";
    return null;
  });
  return (
    <div className="flex flex-col gap-4">
      <div
        role="radiogroup"
        aria-label="Engine"
        className={cn("grid gap-2", store ? "sm:grid-cols-3" : "grid-cols-2")}
      >
        {store && (
          <PlainButton
            type="button"
            role="radio"
            aria-checked={engine === "phi"}
            disabled={phi.device.state === "warn"}
            title={phi.device.state === "warn" ? phi.device.text : undefined}
            className={cn(
              "rounded-md border p-2 text-left text-sm hover:bg-muted disabled:cursor-not-allowed disabled:opacity-60",
              engine === "phi" && "border-primary bg-accent",
            )}
            onClick={() => {
              setEngine("phi");
            }}
          >
            <span className="flex items-center gap-2 font-medium">
              {PHI_CHOICE.title}
              <span className="rounded-full bg-primary px-1.5 text-[11px] text-primary-foreground">
                Copilot+ PC
              </span>
            </span>
            <span className="block text-xs text-muted-foreground">
              {phi.device.state === "warn" ? phi.device.text : PHI_CHOICE.text}
            </span>
          </PlainButton>
        )}
        {CHOICES.map((c) => {
          // The Store version has no llama.cpp.
          const off = store && c.id === "llama";
          return (
            <PlainButton
              key={c.id}
              type="button"
              role="radio"
              aria-checked={engine === c.id}
              disabled={off}
              className={cn(
                "rounded-md border p-2 text-left text-sm hover:bg-muted disabled:cursor-not-allowed disabled:border-dashed disabled:opacity-60",
                engine === c.id && "border-primary bg-accent",
              )}
              onClick={() => {
                setEngine(c.id);
              }}
            >
              <span className="font-medium">{c.title}</span>
              <span className="block text-xs text-muted-foreground">
                {off
                  ? "Not in the Microsoft Store version. Use the installer from the Mimer website for it."
                  : c.text}
              </span>
            </PlainButton>
          );
        })}
      </div>
      {engine === null && (
        <p className="text-sm text-muted-foreground" data-testid="engine-choose">
          Choose which engine should run the AI on this computer. You can download both and switch
          between them later.
        </p>
      )}
      {engine === "phi" && phi && (
        <PhiSilicaSettings draft={draft} onChange={onChange} status={phi} onStatus={setPhi} />
      )}
      {engine === "llama" && <BuiltInAiSettings draft={draft} onChange={onChange} />}
      {engine === "foundry" && <FoundrySettings draft={draft} onChange={onChange} />}
    </div>
  );
}
