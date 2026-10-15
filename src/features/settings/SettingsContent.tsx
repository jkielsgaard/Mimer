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
import { cn } from "@/lib/utils";
import { useSettingsStore } from "@/stores/settingsStore";
import { reportError } from "@/stores/uiStore";
import { newProvider, ProviderEditor } from "./ProviderEditor";
import { VaultSettingsTab } from "./VaultSettingsTab";
import { MimerInstructionSettings } from "./MimerInstructionSettings";
import { SemanticSearchSettings } from "./SemanticSearchSettings";
import { appVersion, buildDateLabel, releaseStage } from "@/lib/version";
import { InfoHint } from "@/components/InfoHint";

type Tab = "general" | "providers" | "ai" | "history" | "vault";
const TABS: { id: Tab; label: string }[] = [
  { id: "general", label: "General" },
  { id: "providers", label: "AI providers" },
  { id: "ai", label: "AI" },
  { id: "history", label: "Version history" },
  { id: "vault", label: "Vault" },
];

export function SettingsContent({ stored, onClose }: { stored: Settings; onClose: () => void }) {
  const save = useSettingsStore((s) => s.save);
  const [draft, setDraft] = useState<Settings>(() => structuredClone(stored));
  const [tab, setTab] = useState<Tab>("general");
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
                    <span className="block text-[11px] text-muted-foreground">{p.location}</span>
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
                {provider ? (
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
                      setDraft({
                        ...draft,
                        ai: {
                          ...draft.ai,
                          providers: rest,
                          defaultProviderId:
                            draft.ai.defaultProviderId === provider.id
                              ? (rest[0]?.id ?? "")
                              : draft.ai.defaultProviderId,
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
                  <Label htmlFor="set-default">Default provider</Label>
                  <InfoHint
                    label="Default provider"
                    text="The AI Mimer uses, unless a project chooses another one. LM Studio keeps everything on your own computer."
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
                  {draft.ai.providers.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name} ({p.location})
                    </option>
                  ))}
                </Select>
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
