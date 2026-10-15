import { useEffect, useState } from "react";
import type { ProviderConfig } from "@/bindings/ProviderConfig";
import type { ProviderKind } from "@/bindings/ProviderKind";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { api, toApiError } from "@/lib/api";
import { effectiveLocation as locationOf, isLoopbackUrl } from "@/lib/providers";

const KIND_DEFAULTS: Record<
  ProviderKind,
  { baseUrl: string; name: string; contextTokens: number }
> = {
  lmstudio: { baseUrl: "http://localhost:1234/v1", name: "LM Studio", contextTokens: 16000 },
  openai_compatible: {
    baseUrl: "https://api.openai.com/v1",
    name: "OpenAI-compatible",
    contextTokens: 32000,
  },
  anthropic: { baseUrl: "https://api.anthropic.com", name: "Anthropic", contextTokens: 100000 },
  // The built-in AI is set up under Settings → Built-in AI; it is never made here.
  builtin: { baseUrl: "http://127.0.0.1:8080/v1", name: "Mimer (built-in)", contextTokens: 16384 },
};

/** Default values for a new provider of the given kind. */
export function newProvider(kind: ProviderKind): ProviderConfig {
  const d = KIND_DEFAULTS[kind];
  return {
    id: `${kind}-${crypto.randomUUID().slice(0, 8)}`,
    kind,
    name: d.name,
    baseUrl: d.baseUrl,
    model: "",
    location: kind === "anthropic" ? "cloud" : kind === "lmstudio" ? "local" : "cloud",
    supportsTools: true,
    contextTokens: d.contextTokens,
  };
}

interface Props {
  provider: ProviderConfig;
  onChange: (p: ProviderConfig) => void;
  onRemove: () => void;
  /** Persists the draft settings so the backend knows this provider before testing. */
  persist: () => Promise<boolean>;
}

/** Form for one AI provider, including keychain-backed API key and connection test. */
export function ProviderEditor({ provider, onChange, onRemove, persist }: Props) {
  const [hasKey, setHasKey] = useState(false);
  const [key, setKey] = useState("");
  const [models, setModels] = useState<string[]>([]);
  const [status, setStatus] = useState<{ ok: boolean; message: string } | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setKey("");
    setStatus(null);
    setModels([]);
    api
      .hasApiKey(provider.id)
      .then(setHasKey)
      .catch(() => {
        setHasKey(false);
      });
  }, [provider.id]);

  const loopback = isLoopbackUrl(provider.baseUrl);
  const locationFixed = provider.kind !== "openai_compatible";
  const effectiveLocation = locationOf(provider);
  const set = (patch: Partial<ProviderConfig>): void => {
    onChange({ ...provider, ...patch });
  };

  const saveKey = async (): Promise<void> => {
    try {
      await api.setApiKey(provider.id, key);
      setKey("");
      setHasKey(true);
      setStatus({ ok: true, message: "Key stored in the system keychain." });
    } catch (e) {
      setStatus({ ok: false, message: toApiError(e).message });
    }
  };

  const removeKey = async (): Promise<void> => {
    try {
      await api.deleteApiKey(provider.id);
      setHasKey(false);
    } catch (e) {
      setStatus({ ok: false, message: toApiError(e).message });
    }
  };

  const test = async (): Promise<void> => {
    setBusy(true);
    setStatus(null);
    try {
      if (!(await persist())) return;
      const r = await api.testProvider(provider.id);
      setStatus({ ok: r.ok, message: r.message });
      setModels(r.models);
    } catch (e) {
      setStatus({ ok: false, message: toApiError(e).message });
    } finally {
      setBusy(false);
    }
  };

  const loadModels = async (): Promise<void> => {
    try {
      if (!(await persist())) return;
      setModels(await api.listModels(provider.id));
    } catch (e) {
      setStatus({ ok: false, message: toApiError(e).message });
    }
  };

  const field = (id: string, label: string, children: React.ReactNode): React.ReactNode => (
    <div className="flex flex-col gap-1">
      <Label htmlFor={id}>{label}</Label>
      {children}
    </div>
  );

  return (
    <div className="flex flex-col gap-3">
      {field(
        "prov-name",
        "Name",
        <Input
          id="prov-name"
          value={provider.name}
          onChange={(e) => {
            set({ name: e.target.value });
          }}
        />,
      )}
      {field(
        "prov-kind",
        "Kind",
        <Select
          id="prov-kind"
          value={provider.kind}
          onChange={(e) => {
            const kind = e.target.value as ProviderKind;
            const d = KIND_DEFAULTS[kind];
            set({
              kind,
              baseUrl: d.baseUrl,
              contextTokens: d.contextTokens,
              location: kind === "lmstudio" ? "local" : "cloud",
            });
          }}
        >
          <option value="lmstudio">LM Studio</option>
          <option value="openai_compatible">OpenAI-compatible</option>
          <option value="anthropic">Anthropic</option>
        </Select>,
      )}
      {field(
        "prov-url",
        "Base URL",
        <Input
          id="prov-url"
          value={provider.baseUrl}
          onChange={(e) => {
            set({ baseUrl: e.target.value });
          }}
        />,
      )}
      {field(
        "prov-model",
        "Model",
        <div className="flex gap-2">
          <Input
            id="prov-model"
            list="prov-models"
            value={provider.model}
            placeholder="Type a model name or load the list"
            onChange={(e) => {
              set({ model: e.target.value });
            }}
          />
          <datalist id="prov-models">
            {models.map((m) => (
              <option key={m} value={m} />
            ))}
          </datalist>
          <Button variant="outline" onClick={() => void loadModels()}>
            Load models
          </Button>
        </div>,
      )}
      {field(
        "prov-location",
        "Location",
        <Select
          id="prov-location"
          value={effectiveLocation}
          disabled={locationFixed}
          onChange={(e) => {
            set({ location: e.target.value as "local" | "cloud" });
          }}
        >
          <option value="local" disabled={provider.kind === "openai_compatible" && !loopback}>
            Local
          </option>
          <option value="cloud">Cloud</option>
        </Select>,
      )}
      {provider.kind !== "anthropic" && !loopback && (
        <p className="text-xs text-muted-foreground">
          Only localhost, 127.0.0.1 and ::1 can be local.
        </p>
      )}
      <p className="text-xs text-muted-foreground">
        {effectiveLocation === "local"
          ? "Local: used by Mimer, which reads your notes. It runs on this computer."
          : "Cloud: used by Raven only. Your notes are never sent to a cloud provider."}
      </p>
      <div className="flex items-center gap-4">
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={provider.supportsTools}
            onChange={(e) => {
              set({ supportsTools: e.target.checked });
            }}
          />
          Supports tools
        </label>
        <div className="flex flex-1 items-center gap-2">
          <Label htmlFor="prov-ctx">Context tokens</Label>
          <Input
            id="prov-ctx"
            type="number"
            min={1000}
            className="w-28"
            value={provider.contextTokens}
            onChange={(e) => {
              set({ contextTokens: Number(e.target.value) || 1000 });
            }}
          />
        </div>
      </div>
      {field(
        "prov-key",
        "API key",
        <div className="flex items-center gap-2">
          {hasKey ? (
            <>
              <span className="flex-1 text-sm text-success">Key stored</span>
              <Button variant="outline" size="sm" onClick={() => void removeKey()}>
                Remove key
              </Button>
            </>
          ) : (
            <>
              <Input
                id="prov-key"
                type="password"
                autoComplete="off"
                placeholder={
                  provider.kind === "lmstudio" ? "Not needed for LM Studio" : "Paste your API key"
                }
                value={key}
                onChange={(e) => {
                  setKey(e.target.value);
                }}
              />
              <Button variant="outline" disabled={key === ""} onClick={() => void saveKey()}>
                Save key
              </Button>
            </>
          )}
        </div>,
      )}
      <div className="flex items-center gap-2">
        <Button variant="outline" disabled={busy} onClick={() => void test()}>
          {busy ? "Testing…" : "Test connection"}
        </Button>
        <Button variant="ghost" className="ml-auto text-destructive" onClick={onRemove}>
          Remove provider
        </Button>
      </div>
      {status && (
        <p
          role="status"
          className={status.ok ? "text-xs text-success" : "text-xs text-destructive"}
        >
          {status.message}
        </p>
      )}
    </div>
  );
}
