import { Button } from "@/components/ui/button";
import { useEngineStore } from "@/stores/engineStore";
import { useFoundryStore } from "@/stores/foundryStore";

/**
 * "Load AI" / "Unload AI" in the settings of a built-in AI: the same two buttons as in the status
 * bar. Load puts the model in memory (Mimer also does it by itself when the AI is used); Unload
 * gives the memory back. Shown once the AI is set up (not while it is downloaded or broken).
 */
export function LoadAi({ which }: { which: "foundry" | "builtin" }) {
  const foundry = useFoundryStore((s) => s.status?.state);
  const engine = useEngineStore((s) => s.status?.state);
  const state = which === "foundry" ? foundry : engine;
  const store = which === "foundry" ? useFoundryStore : useEngineStore;
  if (state !== "asleep" && state !== "awake" && state !== "waking" && state !== "sleeping") {
    return null;
  }
  const loaded = state === "awake";
  const working = state === "waking" || state === "sleeping";
  const label = working
    ? state === "waking"
      ? "Loading the AI…"
      : "Unloading the AI…"
    : loaded
      ? "Unload AI"
      : "Load AI";
  return (
    <div className="flex flex-wrap items-center gap-3 rounded-md border bg-muted/40 px-3 py-2">
      <span className="text-sm">
        {loaded ? "The AI is loaded." : working ? "Just a moment…" : "The AI is not loaded."}
      </span>
      <Button
        size="sm"
        variant="outline"
        disabled={working}
        onClick={() => {
          const s = store.getState();
          void (loaded ? s.sleep() : s.wake());
        }}
      >
        {label}
      </Button>
      <span className="text-xs text-muted-foreground">
        Unloading gives the memory back. Mimer loads the AI by itself when you use it.
      </span>
    </div>
  );
}
