import { Lock } from "lucide-react";
import { useState } from "react";
import type { ProviderConfig } from "@/bindings/ProviderConfig";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useActiveAi } from "@/features/chat/useActiveAi";
import { api, toApiError } from "@/lib/api";
import { cn } from "@/lib/utils";
import { useChatStore } from "@/stores/chatStore";
import { useEngineStore } from "@/stores/engineStore";
import { useFoundryStore } from "@/stores/foundryStore";
import { useSettingsStore } from "@/stores/settingsStore";
import { useUiStore } from "@/stores/uiStore";

export type ChipTone = "ok" | "idle" | "busy" | "bad";
export type ChipAction = "wake" | "stop" | "fix" | "setup";

export interface ChipState {
  tone: ChipTone;
  label: string;
  action: ChipAction | null;
}

interface Inputs {
  provider: ProviderConfig | undefined;
  working: boolean;
  /** The state of the built-in AI or Foundry Local, whichever the provider is. */
  engineState: string | undefined;
  engineMessage: string;
  model: string;
  device: string | null;
}

/** What the chip in the status bar says and does, from the facts about the chosen AI. */
export function chipState(i: Inputs): ChipState {
  if (i.working) return { tone: "busy", label: "Mimer is working…", action: "stop" };
  const p = i.provider;
  if (!p) return { tone: "idle", label: "No AI set up", action: "setup" };
  const name = i.model ? `${p.name} · ${i.model}` : p.name;
  if (p.kind !== "builtin" && p.kind !== "foundry_local") {
    return { tone: "idle", label: name, action: null };
  }
  switch (i.engineState) {
    case "awake":
      return {
        tone: "ok",
        label: i.device ? `${name} · ${i.device}` : name,
        action: null,
      };
    case "asleep":
      return { tone: "idle", label: `${p.name} · asleep`, action: "wake" };
    case "waking":
    case "installing":
    case "sleeping":
      return { tone: "busy", label: i.engineMessage || `${p.name} is starting…`, action: null };
    case "error":
      return { tone: "bad", label: `${p.name} has a problem`, action: "fix" };
    default:
      return { tone: "idle", label: `${p.name} · not set up`, action: "setup" };
  }
}

const DOT: Record<ChipTone, string> = {
  ok: "bg-success",
  idle: "bg-muted-foreground",
  busy: "bg-primary",
  bad: "bg-destructive",
};

const VERB: Record<ChipAction, string> = {
  wake: "Wake",
  stop: "Stop",
  fix: "Fix",
  setup: "Set up",
};

/** The facts about the chosen AI that the chip shows, for the chip and for menus that want them. */
export function useAiChip() {
  const { provider } = useActiveAi();
  const settings = useSettingsStore((s) => s.settings);
  const working = useChatStore((s) => s.streaming);
  const engine = useEngineStore((s) => s.status);
  const foundry = useFoundryStore((s) => s.status);
  const isBuiltin = provider?.kind === "builtin";
  const isFoundry = provider?.kind === "foundry_local";
  const model = isBuiltin
    ? (engine?.models.find((m) => m.id === settings?.ai.builtin.modelId)?.name ?? "")
    : isFoundry
      ? (foundry?.installed.find((m) => m.alias === settings?.ai.foundry.model)?.name ??
        settings?.ai.foundry.model ??
        "")
      : (provider?.model ?? "");
  const device = isFoundry && foundry?.state === "awake" ? (foundry.activeDevice ?? null) : null;
  const status = isBuiltin ? engine : isFoundry ? foundry : null;
  const state = chipState({
    provider,
    working,
    engineState: status?.state,
    engineMessage: status?.message ?? "",
    model,
    device,
  });
  return { provider, isBuiltin, isFoundry, model, device, status, state };
}

/**
 * The AI chip in the status bar: a coloured dot, the AI and model, and one verb when something
 * needs doing (Wake, Stop, Fix). Clicking it opens the details: model, device, privacy.
 */
export function AiChip() {
  const { provider, isBuiltin, isFoundry, model, device, status, state } = useAiChip();
  const [test, setTest] = useState<{ ok: boolean; message: string } | null>(null);

  const act = (): void => {
    switch (state.action) {
      case "stop":
        void useChatStore.getState().stop();
        break;
      case "wake":
        if (isFoundry) void useFoundryStore.getState().wake();
        else void useEngineStore.getState().wake();
        break;
      case "fix":
      case "setup":
        if (isBuiltin || isFoundry) useUiStore.getState().openBuiltInSettings();
        else useUiStore.getState().setSettingsOpen(true);
        break;
      case null:
        break;
    }
  };

  const onOpen = (open: boolean): void => {
    setTest(null);
    if (!open || !provider || isBuiltin || isFoundry) return;
    api
      .testProvider(provider.id)
      .then((r) => {
        setTest({ ok: r.ok, message: r.message });
      })
      .catch((e: unknown) => {
        setTest({ ok: false, message: toApiError(e).message });
      });
  };

  const awake = status?.state === "awake";
  return (
    <span className="flex items-center gap-1.5" data-testid="ai-chip" data-tone={state.tone}>
      <DropdownMenu onOpenChange={onOpen}>
        <DropdownMenuTrigger
          aria-label={`AI status: ${state.label}`}
          className="flex max-w-[28rem] items-center gap-1.5 rounded px-1 text-foreground outline-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring"
        >
          <span aria-hidden className={cn("size-2 shrink-0 rounded-full", DOT[state.tone])} />
          <span className="truncate" role={state.tone === "busy" ? "status" : undefined}>
            {state.label}
          </span>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" side="top" className="w-80 p-3 text-xs">
          <div className="flex items-center gap-2">
            <span aria-hidden className={cn("size-2 rounded-full", DOT[state.tone])} />
            <span className="flex-1 text-[13px] font-semibold">{headline(state, provider)}</span>
          </div>
          <dl className="mt-2 grid grid-cols-[4.5rem_1fr] gap-x-2 gap-y-1.5">
            <dt className="text-muted-foreground">Model</dt>
            <dd className="font-medium">{model || "None chosen"}</dd>
            {(isBuiltin || isFoundry) && (
              <>
                <dt className="text-muted-foreground">Runs on</dt>
                <dd className="font-medium">
                  {device ?? (awake ? "Not reported" : "Wake Mimer to see")}
                </dd>
              </>
            )}
            {!isBuiltin && !isFoundry && provider && (
              <>
                <dt className="text-muted-foreground">Connection</dt>
                <dd className={cn("font-medium", test && !test.ok && "text-destructive")}>
                  {test === null ? "Checking…" : test.ok ? "Answering" : test.message}
                </dd>
              </>
            )}
            <dt className="text-muted-foreground">Privacy</dt>
            <dd className="flex items-start gap-1.5 font-medium">
              <Lock className="mt-0.5 size-3.5 shrink-0" aria-hidden />
              <span>Local only. Your notes never leave this computer.</span>
            </dd>
          </dl>
          <DropdownMenuSeparator />
          <div className="flex flex-wrap gap-1">
            {(isBuiltin || isFoundry) && awake && (
              <DropdownMenuItem
                onSelect={() => {
                  if (isFoundry) void useFoundryStore.getState().sleep();
                  else void useEngineStore.getState().sleep();
                }}
              >
                Put to sleep
              </DropdownMenuItem>
            )}
            {(isBuiltin || isFoundry) && status?.state === "asleep" && (
              <DropdownMenuItem onSelect={act}>Wake Mimer</DropdownMenuItem>
            )}
            <DropdownMenuItem
              onSelect={() => {
                if (isBuiltin || isFoundry) useUiStore.getState().openBuiltInSettings();
                else useUiStore.getState().setSettingsOpen(true);
              }}
            >
              Open Settings
            </DropdownMenuItem>
          </div>
        </DropdownMenuContent>
      </DropdownMenu>
      {state.action !== null && (
        <button
          type="button"
          className="rounded border px-1.5 text-[11px] text-foreground hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring"
          onClick={act}
        >
          {VERB[state.action]}
        </button>
      )}
    </span>
  );
}

function headline(state: ChipState, provider: ProviderConfig | undefined): string {
  if (!provider) return "No AI is set up";
  switch (state.tone) {
    case "ok":
      return `${provider.name} is awake`;
    case "busy":
      return state.label;
    case "bad":
      return `${provider.name} has a problem`;
    case "idle":
      return state.action === "wake" ? `${provider.name} is asleep` : provider.name;
  }
}
