import { useActiveAi } from "@/features/chat/useActiveAi";
import { useEngineStore } from "@/stores/engineStore";
import { useFoundryStore } from "@/stores/foundryStore";
import { aiBlocked } from "./aiStatus";

/** Why the AI buttons are off right now, or null when they can be used. */
export function useAiBlocked(): string | null {
  const { provider } = useActiveAi();
  const engine = useEngineStore((s) => s.status?.state);
  const foundry = useFoundryStore((s) => s.status?.state);
  return aiBlocked(provider, engine, foundry);
}
