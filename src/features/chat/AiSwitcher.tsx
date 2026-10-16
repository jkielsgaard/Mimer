import { Check, ChevronDown } from "lucide-react";
import { useState } from "react";
import type { ProviderConfig } from "@/bindings/ProviderConfig";
import type { Settings } from "@/bindings/Settings";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { api, toApiError } from "@/lib/api";
import { effectiveLocation, usableProviders } from "@/lib/providers";
import { useEngineStore } from "@/stores/engineStore";
import { useFoundryStore } from "@/stores/foundryStore";
import { useRaven } from "@/features/raven/useRaven";
import { useSettingsStore } from "@/stores/settingsStore";
import { reportError, useUiStore } from "@/stores/uiStore";
import { useActiveAi } from "./useActiveAi";

type Role = "mimer" | "raven";

function Heading({ children }: { children: string }) {
  return (
    <div className="px-2 pb-0.5 pt-1.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
      {children}
    </div>
  );
}

/**
 * The AI and model shown under the name of the Mimer or Raven tab, as a menu: change the provider
 * or the model there without opening Settings. Mimer lists the local providers, Raven the cloud
 * ones. The choice is saved in the settings, so it applies from the next question on.
 */
export function AiSwitcher({ role, disabled }: { role: Role; disabled?: boolean }) {
  const settings = useSettingsStore((s) => s.settings);
  const save = useSettingsStore((s) => s.save);
  const active = useActiveAi();
  const raven = useRaven();
  const engine = useEngineStore((s) => s.status);
  const catalog = useEngineStore((s) => s.catalog);
  const foundry = useFoundryStore((s) => s.status);
  const [models, setModels] = useState<string[] | null>(null);
  const [modelError, setModelError] = useState<string | null>(null);

  const provider: ProviderConfig | undefined = role === "mimer" ? active.provider : raven;
  // A project can choose its own local provider; that choice is changed in the project.
  const fixedByProject =
    role === "mimer" &&
    active.project?.providerId != null &&
    provider?.id === active.project.providerId;
  if (!settings) return null;
  const choices = usableProviders(settings).filter(
    (p) => effectiveLocation(p) === (role === "mimer" ? "local" : "cloud"),
  );
  const builtIn = provider?.kind === "builtin";
  const isFoundry = provider?.kind === "foundry_local";
  const builtInModel = builtIn
    ? (engine?.models.find((m) => m.id === settings.ai.builtin.modelId)?.name ??
      catalog?.models.find((m) => m.id === settings.ai.builtin.modelId)?.name ??
      settings.ai.builtin.modelId)
    : null;
  const foundryModel = isFoundry
    ? (foundry?.installed.find((m) => m.alias === settings.ai.foundry.model)?.name ??
      settings.ai.foundry.model)
    : null;
  const modelName = builtInModel ?? foundryModel ?? provider?.model ?? "";
  const label = provider
    ? `${provider.name}${modelName ? ` · ${modelName}` : " · no model selected"}`
    : role === "mimer"
      ? "No provider"
      : "No cloud provider";

  const store = async (next: Settings): Promise<void> => {
    try {
      await save(next);
    } catch (e) {
      reportError(e);
    }
  };

  const onOpen = (open: boolean): void => {
    if (!open || !provider) return;
    setModels(null);
    setModelError(null);
    if (builtIn) {
      void useEngineStore.getState().load();
      return;
    }
    if (isFoundry) {
      void useFoundryStore.getState().load();
      return;
    }
    api
      .listModels(provider.id)
      .then(setModels)
      .catch((e: unknown) => {
        setModelError(toApiError(e).message);
      });
  };

  const chooseProvider = (id: string): void => {
    if (id === provider?.id) return;
    const ai =
      role === "mimer"
        ? { ...settings.ai, defaultProviderId: id }
        : { ...settings.ai, ravenProviderId: id };
    void store({ ...settings, ai });
  };

  const chooseModel = (name: string): void => {
    if (!provider) return;
    if (builtIn) {
      void store({
        ...settings,
        ai: { ...settings.ai, builtin: { ...settings.ai.builtin, modelId: name } },
      });
      return;
    }
    if (isFoundry) {
      void store({ ...settings, ai: { ...settings.ai, foundry: { model: name } } });
      return;
    }
    void store({
      ...settings,
      ai: {
        ...settings.ai,
        providers: settings.ai.providers.map((p) =>
          p.id === provider.id ? { ...p, model: name } : p,
        ),
      },
    });
  };

  const installed = engine?.models ?? [];
  const foundryInstalled = foundry?.installed ?? [];
  return (
    <DropdownMenu onOpenChange={onOpen}>
      <DropdownMenuTrigger
        disabled={disabled}
        aria-label={`Change AI: ${label}`}
        title="Change the AI or the model"
        className="flex max-w-full items-center gap-1 rounded px-1 py-0.5 text-left text-muted-foreground outline-none hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
      >
        <span className="truncate">{label}</span>
        <ChevronDown className="size-3 shrink-0" aria-hidden />
      </DropdownMenuTrigger>
      <DropdownMenuContent className="max-h-80 min-w-64 max-w-sm overflow-auto text-xs">
        <Heading>{role === "mimer" ? "AI for Mimer (local)" : "AI for Raven (cloud)"}</Heading>
        {choices.length === 0 && (
          <div className="px-2 py-1.5 text-muted-foreground">
            {role === "mimer"
              ? "No local AI yet."
              : "No cloud AI yet. Raven works only with a cloud AI."}
          </div>
        )}
        {choices.map((p) => (
          <DropdownMenuItem
            key={p.id}
            disabled={fixedByProject}
            onSelect={() => {
              chooseProvider(p.id);
            }}
          >
            <span className="truncate">{p.name}</span>
            {p.id === provider?.id && <Check className="size-3.5" aria-label="In use" />}
          </DropdownMenuItem>
        ))}
        {fixedByProject && (
          <div className="px-2 py-1 text-muted-foreground">
            The project “{active.project?.name}” chooses the AI. Change it in the project's
            settings.
          </div>
        )}
        {provider && (
          <>
            <DropdownMenuSeparator />
            <Heading>Model</Heading>
            {isFoundry ? (
              foundryInstalled.length === 0 ? (
                <div className="px-2 py-1.5 text-muted-foreground">
                  No model downloaded yet. Open Settings → Built-in AI.
                </div>
              ) : (
                foundryInstalled.map((m) => (
                  <DropdownMenuItem
                    key={m.alias}
                    onSelect={() => {
                      chooseModel(m.alias);
                    }}
                  >
                    <span className="truncate">{m.name}</span>
                    {m.alias === settings.ai.foundry.model && (
                      <Check className="size-3.5" aria-label="In use" />
                    )}
                  </DropdownMenuItem>
                ))
              )
            ) : builtIn ? (
              installed.length === 0 ? (
                <div className="px-2 py-1.5 text-muted-foreground">
                  No model downloaded yet. Open Settings → Built-in AI.
                </div>
              ) : (
                installed.map((m) => (
                  <DropdownMenuItem
                    key={m.id}
                    onSelect={() => {
                      chooseModel(m.id);
                    }}
                  >
                    <span className="truncate">{m.name}</span>
                    {m.id === settings.ai.builtin.modelId && (
                      <Check className="size-3.5" aria-label="In use" />
                    )}
                  </DropdownMenuItem>
                ))
              )
            ) : modelError ? (
              <div role="alert" className="px-2 py-1.5 text-destructive">
                Could not list the models: {modelError}
              </div>
            ) : models === null ? (
              <div className="px-2 py-1.5 text-muted-foreground">Loading models…</div>
            ) : models.length === 0 ? (
              <div className="px-2 py-1.5 text-muted-foreground">
                The provider lists no models. Type a name under Settings → AI providers.
              </div>
            ) : (
              models.map((m) => (
                <DropdownMenuItem
                  key={m}
                  onSelect={() => {
                    chooseModel(m);
                  }}
                >
                  <span className="truncate">{m}</span>
                  {m === provider.model && <Check className="size-3.5" aria-label="In use" />}
                </DropdownMenuItem>
              ))
            )}
            {(builtIn || isFoundry) && (
              <div className="px-2 py-1 text-muted-foreground">
                A new model is used the next time Mimer is woken.
              </div>
            )}
          </>
        )}
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onSelect={() => {
            useUiStore.getState().setSettingsOpen(true);
          }}
        >
          <span>Add or edit providers…</span>
        </DropdownMenuItem>
        <div className="px-2 py-1 text-muted-foreground">
          The choice is saved in the settings and applies to everything you ask from now on.
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
