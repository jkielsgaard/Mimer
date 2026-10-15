import { useState } from "react";
import type { Settings } from "@/bindings/Settings";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { api, toApiError } from "@/lib/api";
import { useEmbeddingStore } from "@/stores/embeddingStore";
import { reportError } from "@/stores/uiStore";
import { InfoHint } from "@/components/InfoHint";

interface Props {
  draft: Settings;
  onChange: (next: Settings) => void;
  /** Saves the settings draft so the backend knows the provider before indexing. */
  persist: () => Promise<boolean>;
}

/** Settings → AI → Semantic search. */
export function SemanticSearchSettings({ draft, onChange, persist }: Props) {
  const status = useEmbeddingStore((s) => s.status);
  const start = useEmbeddingStore((s) => s.start);
  const cancel = useEmbeddingStore((s) => s.cancel);
  const [models, setModels] = useState<string[]>([]);
  const [confirmRebuild, setConfirmRebuild] = useState(false);
  const emb = draft.ai.embeddings;
  const providers = draft.ai.providers.filter((p) => p.kind !== "anthropic");
  const provider = providers.find((p) => p.id === emb.providerId);
  const set = (patch: Partial<Settings["ai"]["embeddings"]>): void => {
    onChange({ ...draft, ai: { ...draft.ai, embeddings: { ...emb, ...patch } } });
  };

  const loadModels = async (): Promise<void> => {
    try {
      if (!(await persist())) return;
      setModels(await api.listModels(emb.providerId));
    } catch (e) {
      reportError(toApiError(e));
    }
  };

  const indexNow = async (): Promise<void> => {
    if (!(await persist())) return;
    await start(false);
  };

  return (
    <div className="flex flex-col gap-3 border-t pt-3">
      <h3 className="text-sm font-semibold">Semantic search</h3>
      <p className="text-xs text-muted-foreground">
        Find notes by meaning, not only by words. Needs an embedding model in LM Studio (for example
        nomic-embed-text).
      </p>
      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={emb.enabled}
          onChange={(e) => {
            set({ enabled: e.target.checked });
          }}
        />
        Enable semantic search
      </label>
      <div className="flex flex-col gap-1">
        <div className="flex items-center gap-1.5">
          <Label htmlFor="emb-provider">Embedding provider</Label>
          <InfoHint
            label="Embedding provider"
            text="Semantic search finds notes by meaning. It needs an embedding model, which LM Studio can run on your computer."
            topic="search"
          />
        </div>
        <Select
          id="emb-provider"
          value={emb.providerId}
          onChange={(e) => {
            set({ providerId: e.target.value });
          }}
        >
          {providers.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name} ({p.location})
            </option>
          ))}
        </Select>
        {provider?.location === "cloud" && (
          <p role="note" className="rounded border border-warning/60 bg-warning/15 p-2 text-xs">
            Note contents are sent to this provider to create embeddings. Notes in projects marked{" "}
            <em>Local AI only</em> are never sent.
          </p>
        )}
      </div>
      <div className="flex flex-col gap-1">
        <Label htmlFor="emb-model">Embedding model</Label>
        <div className="flex gap-2">
          <Input
            id="emb-model"
            list="emb-models"
            value={emb.model}
            placeholder="e.g. nomic-embed-text"
            onChange={(e) => {
              set({ model: e.target.value });
            }}
          />
          <datalist id="emb-models">
            {models.map((m) => (
              <option key={m} value={m} />
            ))}
          </datalist>
          <Button variant="outline" onClick={() => void loadModels()}>
            Load models
          </Button>
        </div>
      </div>
      {status && (
        <div className="rounded border p-2 text-xs" aria-live="polite">
          <p>
            State: <strong>{status.enabled ? status.state : "off"}</strong> · {status.notes} notes ·{" "}
            {status.chunks} chunks
          </p>
          {status.state === "indexing" && (
            <div className="mt-1 h-1.5 w-full overflow-hidden rounded bg-muted">
              <div
                className="h-full bg-primary transition-[width]"
                style={{
                  width: `${status.notesTotal === 0 ? 0 : Math.round((status.notesDone / status.notesTotal) * 100)}%`,
                }}
              />
            </div>
          )}
          {status.lastError && <p className="mt-1 text-destructive">{status.lastError}</p>}
        </div>
      )}
      <div className="flex flex-wrap gap-2">
        <Button
          variant="outline"
          size="sm"
          disabled={!emb.enabled || emb.model === ""}
          onClick={() => void indexNow()}
        >
          Index now
        </Button>
        <Button
          variant="outline"
          size="sm"
          disabled={!emb.enabled || emb.model === ""}
          onClick={() => {
            setConfirmRebuild(true);
          }}
        >
          Rebuild index
        </Button>
        {status?.state === "indexing" && (
          <Button variant="ghost" size="sm" onClick={() => void cancel()}>
            Cancel
          </Button>
        )}
      </div>
      <ConfirmDialog
        open={confirmRebuild}
        title="Rebuild the semantic index?"
        description="This re-reads all notes and recreates all embeddings. It can take a while on large vaults."
        confirmLabel="Rebuild"
        onCancel={() => {
          setConfirmRebuild(false);
        }}
        onConfirm={() => {
          setConfirmRebuild(false);
          void (async () => {
            if (await persist()) await start(true);
          })();
        }}
      />
    </div>
  );
}
