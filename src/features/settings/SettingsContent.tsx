import { Plus } from "lucide-react";
import { useState } from "react";
import type { Settings } from "@/bindings/Settings";
import { Button } from "@/components/ui/button";
import {
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { effectiveLocation } from "@/lib/providers";
import { cn } from "@/lib/utils";
import { useSettingsStore } from "@/stores/settingsStore";
import { reportError, useUiStore } from "@/stores/uiStore";
import { newProvider, ProviderEditor } from "./ProviderEditor";
import { BuiltInAiSettings } from "@/features/engine/BuiltInAiSettings";
import { VaultSettingsTab } from "./VaultSettingsTab";
import { MimerInstructionSettings } from "./MimerInstructionSettings";
import { SemanticSearchSettings } from "./SemanticSearchSettings";
import { appVersion, buildDateLabel, releaseStage } from "@/lib/version";
import { InfoHint } from "@/components/InfoHint";

type Tab = "general" | "providers" | "ai" | "builtin" | "history" | "vault";
const TABS: { id: Tab; label: string }[] = [
  { id: "general", label: "General" },
  { id: "providers", label: "AI providers" },
  { id: "ai", label: "AI" },
  { id: "builtin", label: "Built-in AI" },
  { id: "history", label: "Version history" },
  { id: "vault", label: "Vault" },
];

export function SettingsContent({ stored, onClose }: { stored: Settings; onClose: () => void }) {
  const save = useSettingsStore((s) => s.save);
  const [draft, setDraft] = useState<Settings>(() => structuredClone(stored));
  const [tab, setTab] = useState<Tab>(() =>
    useUiStore.getState().settingsTab === "builtin" ? "builtin" : "general",
  );
  const [providerId, setProviderId] = useState<string | null>(stored.ai.providers[0]?.id ?? null);
  const update = (patch: Partial<Settings>): void => {
    setDraft({ ...draft, ...patch });
  };
  const persist = async (): Promise<boolean> => {
    try {
      await save(draft);
      return true;
    } catch (e) {
      reportError(e);
      return false;
    }
  };
  const provider = draft.ai.providers.find((p) => p.id === providerId) ?? null;
  // Notes only go to local providers; cloud providers can only be used by Raven.
  const localProviders = draft.ai.providers.filter((p) => effectiveLocation(p) === "local");
  const cloudProviders = draft.ai.providers.filter((p) => effectiveLocation(p) === "cloud");

  return (
    <DialogContent className="h-[600px] max-w-3xl">
      <DialogHeader>
        <DialogTitle className="text-base font-semibold">Settings</DialogTitle>
        <DialogDescription className="sr-only">Application settings</DialogDescription>
      </DialogHeader>
      <div className="flex min-h-0 flex-1 gap-4">
        <nav className="flex w-40 shrink-0 flex-col gap-0.5" aria-label="Settings sections">
          {TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              aria-current={tab === t.id}
              className={cn(
                "rounded px-2 py-1.5 text-left text-sm hover:bg-muted",
                tab === t.id && "bg-accent font-medium",
              )}
              onClick={() => {
                setTab(t.id);
              }}
            >
              {t.label}
            </button>
          ))}
        </nav>
        <div className="min-h-0 flex-1 overflow-auto pr-1">
          {tab === "general" && (
            <div className="flex flex-col gap-3">
              <div className="flex flex-col gap-1">
                <Label htmlFor="set-theme">Theme</Label>
                <Select
                  id="set-theme"
                  value={draft.theme}
                  onChange={(e) => {
                    update({ theme: e.target.value as Settings["theme"] });
                  }}
                >
                  <option value="system">System</option>
                  <option value="light">Light</option>
                  <option value="dark">Dark</option>
                </Select>
              </div>
              <div className="flex flex-col gap-1">
                <Label htmlFor="set-font">Editor font size (px)</Label>
                <Input
                  id="set-font"
                  type="number"
                  min={10}
                  max={32}
                  value={draft.editor.fontSize}
                  onChange={(e) => {
                    update({
                      editor: { ...draft.editor, fontSize: Number(e.target.value) || 15 },
                    });
                  }}
                />
              </div>
              <div className="flex flex-col gap-1">
                <Label htmlFor="set-width">Editor line width (px)</Label>
                <Input
                  id="set-width"
                  type="number"
                  min={400}
                  max={2000}
                  step={20}
                  value={draft.editor.lineWidth}
                  onChange={(e) => {
                    update({
                      editor: { ...draft.editor, lineWidth: Number(e.target.value) || 760 },
                    });
                  }}
                />
              </div>
              <div className="flex flex-col gap-1">
                <div className="flex items-center gap-1.5">
                  <Label htmlFor="set-recent">Recent notes shown</Label>
                  <InfoHint
                    label="Recent notes"
                    text="How many of the notes you opened last are listed under Recent in the file panel. Choose 0 to hide the list."
                    topic="start"
                  />
                </div>
                <Input
                  id="set-recent"
                  type="number"
                  min={0}
                  max={20}
                  value={draft.editor.recentNotes}
                  onChange={(e) => {
                    const n = Math.round(Number(e.target.value));
                    update({
                      editor: {
                        ...draft.editor,
                        recentNotes: Number.isFinite(n) ? Math.min(20, Math.max(0, n)) : 4,
                      },
                    });
                  }}
                />
              </div>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={draft.editor.spellcheck}
                  onChange={(e) => {
                    update({ editor: { ...draft.editor, spellcheck: e.target.checked } });
                  }}
                />
                Spellcheck
              </label>
              <p className="mt-2 border-t pt-3 text-xs text-muted-foreground">
                Mimer version {appVersion} ({releaseStage}) · built {buildDateLabel()}
              </p>
            </div>
          )}
          {tab === "providers" && (
            <div className="flex gap-4">
              <div className="flex w-44 shrink-0 flex-col gap-1">
                {draft.ai.providers.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    className={cn(
                      "truncate rounded px-2 py-1.5 text-left text-sm hover:bg-muted",
                      providerId === p.id && "bg-accent",
                    )}
                    onClick={() => {
                      setProviderId(p.id);
                    }}
                  >
                    {p.name}
                    <span className="block text-[11px] text-muted-foreground">
                      {effectiveLocation(p) === "local" ? "local · Mimer" : "cloud · Raven only"}
                    </span>
                  </button>
                ))}
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    const p = newProvider("openai_compatible");
                    setDraft({
                      ...draft,
                      ai: { ...draft.ai, providers: [...draft.ai.providers, p] },
                    });
                    setProviderId(p.id);
                  }}
                >
                  <Plus /> Add provider
                </Button>
              </div>
              <div className="min-w-0 flex-1">
                {provider?.kind === "builtin" ? (
                  <div className="flex flex-col gap-2 text-sm">
                    <p className="font-medium">{provider.name}</p>
                    <p className="text-muted-foreground">
                      This is Mimer's own AI. It runs on this computer. Choose the hardware and the
                      model, and download it, under Built-in AI.
                    </p>
                    <div>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          setTab("builtin");
                        }}
                      >
                        Open Built-in AI
                      </Button>
                    </div>
                  </div>
                ) : provider ? (
                  <ProviderEditor
                    provider={provider}
                    persist={persist}
                    onChange={(p) => {
                      setDraft({
                        ...draft,
                        ai: {
                          ...draft.ai,
                          providers: draft.ai.providers.map((x) => (x.id === p.id ? p : x)),
                        },
                      });
                    }}
                    onRemove={() => {
                      const rest = draft.ai.providers.filter((x) => x.id !== provider.id);
                      const firstLocal = rest.find((x) => effectiveLocation(x) === "local");
                      setDraft({
                        ...draft,
                        ai: {
                          ...draft.ai,
                          providers: rest,
                          defaultProviderId:
                            draft.ai.defaultProviderId === provider.id
                              ? (firstLocal?.id ?? "")
                              : draft.ai.defaultProviderId,
                          ravenProviderId:
                            draft.ai.ravenProviderId === provider.id
                              ? null
                              : draft.ai.ravenProviderId,
                        },
                      });
                      setProviderId(rest[0]?.id ?? null);
                    }}
                  />
                ) : (
                  <p className="text-sm text-muted-foreground">No providers configured.</p>
                )}
              </div>
            </div>
          )}
          {tab === "ai" && (
            <div className="flex flex-col gap-3">
              <div className="flex flex-col gap-1">
                <div className="flex items-center gap-1.5">
                  <Label htmlFor="set-default">Mimer's provider (local AI)</Label>
                  <InfoHint
                    label="Mimer's provider"
                    text="The AI Mimer uses for your notes, unless a project chooses another local one. Notes are only ever sent to a local AI, for example LM Studio on this computer."
                    topic="mimer"
                  />
                </div>
                <Select
                  id="set-default"
                  value={draft.ai.defaultProviderId}
                  onChange={(e) => {
                    update({ ai: { ...draft.ai, defaultProviderId: e.target.value } });
                  }}
                >
                  {localProviders.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </Select>
              </div>
              <div className="flex flex-col gap-1">
                <div className="flex items-center gap-1.5">
                  <Label htmlFor="set-raven">Raven's provider (cloud AI)</Label>
                  <InfoHint
                    label="Raven"
                    text="Raven is a separate chat for knowledge from the internet. It uses a cloud AI and never sees your notes. Choose Off to hide the Raven tab."
                    topic="raven"
                  />
                </div>
                <Select
                  id="set-raven"
                  value={draft.ai.ravenProviderId ?? ""}
                  onChange={(e) => {
                    update({ ai: { ...draft.ai, ravenProviderId: e.target.value || null } });
                  }}
                >
                  <option value="">Off</option>
                  {cloudProviders.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </Select>
                <p className="text-xs text-muted-foreground">
                  Raven is for knowledge from the internet, so it needs a <strong>cloud</strong> AI.
                  LM Studio and the built-in AI run on this computer and cannot search the internet,
                  so they cannot be used here. What you type in Raven is sent to the cloud provider.
                  Add one under AI providers first.
                </p>
              </div>
              <MimerInstructionSettings draft={draft} onChange={setDraft} />
              <label className="flex items-start gap-2 text-sm">
                <input
                  type="checkbox"
                  className="mt-1"
                  checked={draft.ai.allowOwnKnowledge}
                  onChange={(e) => {
                    update({ ai: { ...draft.ai, allowOwnKnowledge: e.target.checked } });
                  }}
                />
                <span>
                  Let Mimer write new content from its own knowledge
                  <InfoHint
                    label="Own knowledge"
                    text="Mimer has no internet access and can be wrong or out of date. By default it works with your notes (structure, merging, correcting) and writes a research prompt for a cloud AI when you need new facts. Turn this on to let it write from memory too; it will say so."
                    topic="mimer"
                  />
                </span>
              </label>
              <div className="flex flex-col gap-1">
                <div className="flex items-center gap-1.5">
                  <Label htmlFor="set-instr">Global instructions</Label>
                  <InfoHint
                    label="Global instructions"
                    text="Your own wishes for every vault and project, for example: Answer in Danish. Who Mimer is, is set in the box above."
                    topic="mimer"
                  />
                </div>
                <Textarea
                  id="set-instr"
                  rows={10}
                  placeholder="Extra instructions Mimer follows in every vault and project…"
                  value={draft.ai.globalInstructions}
                  onChange={(e) => {
                    update({ ai: { ...draft.ai, globalInstructions: e.target.value } });
                  }}
                />
              </div>
              <SemanticSearchSettings draft={draft} onChange={setDraft} persist={persist} />
            </div>
          )}
          {tab === "builtin" && <BuiltInAiSettings draft={draft} onChange={setDraft} />}
          {tab === "vault" && <VaultSettingsTab />}
          {tab === "history" && (
            <div className="flex flex-col gap-3">
              <div className="flex flex-col gap-1">
                <Label htmlFor="set-author">Author name</Label>
                <Input
                  id="set-author"
                  value={draft.git.authorName}
                  onChange={(e) => {
                    update({ git: { ...draft.git, authorName: e.target.value } });
                  }}
                />
              </div>
              <div className="flex flex-col gap-1">
                <Label htmlFor="set-email">Author email</Label>
                <Input
                  id="set-email"
                  value={draft.git.authorEmail}
                  onChange={(e) => {
                    update({ git: { ...draft.git, authorEmail: e.target.value } });
                  }}
                />
              </div>
              <div className="flex flex-col gap-1">
                <div className="flex items-center gap-1.5">
                  <Label htmlFor="set-idle">Commit after idle (minutes, 1–60)</Label>
                  <InfoHint
                    label="Idle commit"
                    text="If you have unsaved changes and stop working, Mimer saves a version of your notes in the history after this many minutes."
                    topic="history"
                  />
                </div>
                <Input
                  id="set-idle"
                  type="number"
                  min={1}
                  max={60}
                  value={draft.git.idleCommitMinutes}
                  onChange={(e) => {
                    const n = Math.min(60, Math.max(1, Number(e.target.value) || 5));
                    update({ git: { ...draft.git, idleCommitMinutes: n } });
                  }}
                />
              </div>
            </div>
          )}
        </div>
      </div>
      <DialogFooter>
        <Button
          variant="ghost"
          onClick={() => {
            onClose();
          }}
        >
          Cancel
        </Button>
        <Button
          onClick={() => {
            void persist().then((ok) => {
              if (ok) onClose();
            });
          }}
        >
          Save
        </Button>
      </DialogFooter>
    </DialogContent>
  );
}
