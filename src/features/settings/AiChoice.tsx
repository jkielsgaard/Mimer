import { useEffect, useState, type ReactNode } from "react";
import type { AppPlatform } from "@/bindings/AppPlatform";
import type { ProviderConfig } from "@/bindings/ProviderConfig";
import type { Settings } from "@/bindings/Settings";
import { Select } from "@/components/ui/select";
import { BuiltInAiSettings } from "@/features/engine/BuiltInAiSettings";
import { FoundrySettings } from "@/features/engine/FoundrySettings";
import {
  PHI_ID,
  PHI_PROVIDER,
  PhiSilicaSettings,
  usePhiStatus,
} from "@/features/engine/PhiSilicaSettings";
import {
  aiOrder,
  cloudConsented,
  cloudProviders,
  optionOf,
  otherLocalProviders,
  type AiOption,
} from "@/lib/aiChoice";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";
import { useEngineStore } from "@/stores/engineStore";
import { CloudConsentDialog } from "./CloudConsentDialog";
import { TestAi } from "./TestAi";
import { PlainButton } from "@/components/ui/plain-button";

/** Where Mimer runs; `null` while it is asked (or outside the app, in tests). */
function usePlatform(): AppPlatform | null {
  const [p, setP] = useState<AppPlatform | null>(null);
  useEffect(() => {
    let live = true;
    void Promise.resolve()
      .then(() => api.appPlatform())
      .then((x) => {
        if (live) setP(x);
      })
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, []);
  return p;
}

const TITLES: Record<AiOption, string> = {
  phi: "Windows AI · Phi Silica",
  foundry: "Foundry Local",
  llama: "Built-in AI · llama.cpp",
  local: "LM Studio, or another AI on this computer",
  cloud: "Cloud AI",
};

const TEXTS: Record<AiOption, string> = {
  phi: "Built into Windows, on the neural processor. Nothing to download. No tools: text commands and chat about the open note.",
  foundry:
    "Microsoft's runtime. You choose and download a model; models with tools can also search the vault and use skills.",
  llama:
    "The open-source engine with Google's Gemma models, on many graphics cards and processors. You download it once.",
  local: "If the built-in choices do not work for you. LM Studio must be installed and running.",
  cloud:
    "Last resort, when no AI on this computer is good enough. Your notes are sent to the company that runs it. Off until you turn it on.",
};

/** The built-in AIs are new: their rows say so, and none of them is recommended over the others. */
const BETA: readonly AiOption[] = ["phi", "foundry", "llama"];

/**
 * Settings → AI: one list of the AIs Mimer can use, in the order that suits where it runs, each
 * with its state here. Choosing a ready one makes it Mimer's AI. The chosen row shows its own
 * setup right under it (a model to download, an address to enter), so there is one place for
 * both. A cloud AI needs the user's "I understand" first.
 */
export function AiChoice({
  draft,
  onChange,
  providersPanel,
  persist,
}: {
  draft: Settings;
  onChange: (next: Settings) => void;
  /** Saves the choices made so far (for "Test it"), without closing Settings. */
  persist: () => Promise<boolean>;
  /** The providers of "LM Studio, or another AI" and of the cloud AI: the list and its editor. */
  providersPanel: ReactNode;
}) {
  const platform = usePlatform();
  const [phi, setPhi] = usePhiStatus();
  const llamaReady = useEngineStore((s) => s.status?.engine != null && s.status.models.length > 0);
  const current = draft.ai.providers.find((p) => p.id === draft.ai.defaultProviderId);
  const [picked, setPicked] = useState<AiOption | null>(null);
  const [asking, setAsking] = useState<ProviderConfig | null>(null);
  const locals = otherLocalProviders(draft);
  const clouds = cloudProviders(draft);
  const [localId, setLocalId] = useState<string>(
    () => (current && locals.some((p) => p.id === current.id) ? current.id : locals[0]?.id) ?? "",
  );
  const [cloudId, setCloudId] = useState<string>(
    () => (current && clouds.some((p) => p.id === current.id) ? current.id : clouds[0]?.id) ?? "",
  );

  const phiReady =
    phi?.shown === true &&
    phi.access.state === "ok" &&
    phi.device.state === "ok" &&
    phi.model.state === "ok";
  const order = aiOrder({
    os: platform?.os ?? "",
    store: platform?.store ?? phi?.shown ?? false,
    phiShown: phi?.shown ?? false,
    copilot: phi?.shown === true && phi.device.state !== "warn",
  });
  const inUse = optionOf(current);
  const cloudOn = current !== undefined && inUse === "cloud" && cloudConsented(draft, current);
  const selected = picked ?? inUse;

  const ready: Record<AiOption, boolean> = {
    phi: phiReady,
    foundry: draft.ai.foundry.model !== "",
    llama: llamaReady,
    local: locals.length > 0,
    cloud: clouds.length > 0,
  };
  const state = (o: AiOption): string => {
    if (o === inUse && (o !== "cloud" || cloudOn)) return "In use";
    switch (o) {
      case "phi":
        return phiReady ? "Ready" : phi?.device.state === "warn" ? "Not on this PC" : "Not ready";
      case "foundry":
        return ready.foundry ? `Downloaded: ${draft.ai.foundry.model}` : "Not set up";
      case "llama":
        return ready.llama ? "Downloaded" : "Not set up";
      case "local":
        return ready.local ? "Set up" : "Not set up";
      case "cloud":
        return "Off";
    }
  };

  const makeMimers = (o: AiOption) => {
    const ai = { ...draft.ai, cloudConsent: null };
    if (o === "phi") {
      const providers = [...draft.ai.providers.filter((p) => p.id !== PHI_ID), PHI_PROVIDER];
      onChange({ ...draft, ai: { ...ai, providers, defaultProviderId: PHI_ID } });
    } else if (o === "foundry") {
      onChange({ ...draft, ai: { ...ai, defaultProviderId: "foundry" } });
    } else if (o === "llama") {
      onChange({ ...draft, ai: { ...ai, defaultProviderId: "builtin" } });
    } else if (o === "local" && localId !== "") {
      onChange({ ...draft, ai: { ...ai, defaultProviderId: localId } });
    }
  };

  const choose = (o: AiOption) => {
    setPicked(o);
    if (o === "phi" && phi?.device.state === "warn") return;
    if (!ready[o]) return;
    if (o === "cloud") {
      const p = clouds.find((c) => c.id === cloudId);
      if (p && !(cloudOn && current.id === p.id)) setAsking(p);
      return;
    }
    makeMimers(o);
  };

  /** The provider "Test it" asks: the one an AI on this computer stands for, once it is set up. */
  const testable = (o: AiOption): ProviderConfig | undefined => {
    if (!ready[o]) return undefined;
    if (o === "foundry") return draft.ai.providers.find((p) => p.id === "foundry");
    if (o === "llama") return draft.ai.providers.find((p) => p.id === "builtin");
    if (o === "local") return locals.find((p) => p.id === localId) ?? locals[0];
    return undefined;
  };

  /** The setup of an AI, shown under its row while it is chosen. */
  const setupOf = (o: AiOption): ReactNode => {
    switch (o) {
      case "phi":
        return phi?.shown === true ? (
          <PhiSilicaSettings draft={draft} onChange={onChange} status={phi} onStatus={setPhi} />
        ) : null;
      case "foundry":
        return <FoundrySettings draft={draft} onChange={onChange} />;
      case "llama":
        return <BuiltInAiSettings draft={draft} onChange={onChange} />;
      case "local":
        return providersPanel;
      case "cloud":
        return (
          <div className="flex flex-col gap-2">
            {!ready.cloud && (
              <p className="text-xs text-muted-foreground">
                Add an OpenAI-compatible provider with its address and key below.
              </p>
            )}
            {providersPanel}
          </div>
        );
    }
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-1">
        <h3 className="text-sm font-semibold">Which AI Mimer uses</h3>
        <p className="text-xs text-muted-foreground">
          {platform?.store
            ? "Mimer runs here as the Microsoft Store version"
            : platform?.os === "windows"
              ? "Mimer runs here on Windows (the installer version)"
              : platform?.os === "linux"
                ? "Mimer runs here on Linux"
                : "Mimer runs on this computer"}
          {phi?.shown === true && phi.device.state !== "warn" ? " on a Copilot+ PC" : ""}. Click a
          row to use it; the chosen row has its own setup under it. The built-in AIs are in beta and
          what works best depends on your computer, so try them in turn and keep the one that works
          best for you.
        </p>
      </div>
      <div role="radiogroup" aria-label="AI for Mimer" className="flex flex-col gap-2">
        {order.map((o, i) => {
          const cloud = o === "cloud";
          const offText = o === "phi" && phi?.device.state === "warn" ? phi.device.text : null;
          const off = offText !== null;
          return (
            <div
              key={o}
              className={cn(
                "rounded-lg border",
                cloud && "border-dashed border-warning",
                selected === o &&
                  (cloud
                    ? "border-2 border-warning bg-warning/10"
                    : "border-2 border-primary bg-accent"),
              )}
            >
              <PlainButton
                type="button"
                role="radio"
                aria-checked={selected === o}
                disabled={off}
                className="flex w-full items-start gap-3 rounded-lg p-3 text-left text-sm hover:bg-muted disabled:cursor-not-allowed disabled:opacity-60"
                onClick={() => {
                  choose(o);
                }}
              >
                <span
                  className={cn(
                    "flex size-[22px] shrink-0 items-center justify-center rounded-full border text-xs font-bold",
                    selected === o && !cloud && "border-primary bg-primary text-primary-foreground",
                    cloud && "border-warning text-warning",
                  )}
                >
                  {i + 1}
                </span>
                <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <span className="flex flex-wrap items-center gap-2 font-semibold">
                    {TITLES[o]}
                    {BETA.includes(o) && (
                      <span className="rounded-full bg-warning/25 px-2 text-[11px] font-normal">
                        Beta
                      </span>
                    )}
                    {cloud && (
                      <span className="rounded-full border border-warning px-2 text-[11px] text-warning">
                        Notes leave this computer
                      </span>
                    )}
                  </span>
                  <span className="text-xs text-foreground/80">{offText ?? TEXTS[o]}</span>
                </span>
                <span
                  className={cn(
                    "shrink-0 text-xs",
                    state(o) === "In use" ? "font-semibold text-success" : "text-muted-foreground",
                  )}
                >
                  {state(o)}
                </span>
              </PlainButton>
              {selected === o && !off && (
                <div
                  role="group"
                  aria-label={`Set up ${TITLES[o]}`}
                  className="border-t bg-background/60 p-3"
                >
                  {testable(o) !== undefined && (
                    <TestAi provider={testable(o) as ProviderConfig} persist={persist} />
                  )}
                  {setupOf(o)}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {selected === "local" && locals.length > 1 && (
        <label className="flex items-center gap-2 text-sm">
          Which one
          <Select
            value={localId}
            onChange={(e) => {
              setLocalId(e.target.value);
              onChange({
                ...draft,
                ai: { ...draft.ai, cloudConsent: null, defaultProviderId: e.target.value },
              });
            }}
          >
            {locals.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </Select>
        </label>
      )}
      {selected === "cloud" && clouds.length > 1 && (
        <label className="flex items-center gap-2 text-sm">
          Which cloud AI
          <Select
            value={cloudId}
            onChange={(e) => {
              setCloudId(e.target.value);
              const p = clouds.find((c) => c.id === e.target.value);
              if (p) setAsking(p);
            }}
          >
            {clouds.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </Select>
        </label>
      )}

      <CloudConsentDialog
        open={asking !== null}
        providerName={asking?.name ?? ""}
        onCancel={() => {
          setAsking(null);
          setPicked(null);
        }}
        onConfirm={() => {
          if (!asking) return;
          onChange({
            ...draft,
            ai: {
              ...draft.ai,
              defaultProviderId: asking.id,
              cloudConsent: {
                providerId: asking.id,
                baseUrl: asking.baseUrl,
                agreedAt: new Date().toISOString(),
              },
            },
          });
          setAsking(null);
        }}
      />
    </div>
  );
}
