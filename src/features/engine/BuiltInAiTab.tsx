import { useState } from "react";
import type { Settings } from "@/bindings/Settings";
import { cn } from "@/lib/utils";
import { useEngineStore } from "@/stores/engineStore";
import { BuiltInAiSettings } from "./BuiltInAiSettings";
import { FoundrySettings } from "./FoundrySettings";

type Engine = "llama" | "foundry";

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
 * own settings. There is no default: a new user chooses.
 */
export function BuiltInAiTab({
  draft,
  onChange,
}: {
  draft: Settings;
  onChange: (next: Settings) => void;
}) {
  const llamaReady = useEngineStore((s) => s.status?.engine != null);
  const [engine, setEngine] = useState<Engine | null>(() => {
    const d = draft.ai.defaultProviderId;
    if (d === "foundry" || draft.ai.foundry.model !== "") return "foundry";
    if (d === "builtin" || llamaReady) return "llama";
    return null;
  });
  return (
    <div className="flex flex-col gap-4">
      <div role="radiogroup" aria-label="Engine" className="grid grid-cols-2 gap-2">
        {CHOICES.map((c) => (
          <button
            key={c.id}
            type="button"
            role="radio"
            aria-checked={engine === c.id}
            className={cn(
              "rounded-md border p-2 text-left text-sm hover:bg-muted",
              engine === c.id && "border-primary bg-accent",
            )}
            onClick={() => {
              setEngine(c.id);
            }}
          >
            <span className="font-medium">{c.title}</span>
            <span className="block text-xs text-muted-foreground">{c.text}</span>
          </button>
        ))}
      </div>
      {engine === null && (
        <p className="text-sm text-muted-foreground" data-testid="engine-choose">
          Choose which engine should run the AI on this computer. You can download both and switch
          between them later.
        </p>
      )}
      {engine === "llama" && <BuiltInAiSettings draft={draft} onChange={onChange} />}
      {engine === "foundry" && <FoundrySettings draft={draft} onChange={onChange} />}
    </div>
  );
}
