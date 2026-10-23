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
import { effectiveLocation, usableProviders } from "@/lib/providers";
import { cn } from "@/lib/utils";
import { useSettingsStore } from "@/stores/settingsStore";
import { reportError, useUiStore } from "@/stores/uiStore";
import { ProviderEditor } from "./ProviderEditor";
import { AddProviderDialog } from "./AddProviderDialog";
import { BuiltInAiTab } from "@/features/engine/BuiltInAiTab";
import { VaultSettingsTab } from "./VaultSettingsTab";
import { MimerInstructionSettings } from "./MimerInstructionSettings";
import { SemanticSearchSettings } from "./SemanticSearchSettings";
import { appVersion, buildDateLabel, releaseStage } from "@/lib/version";
import { InfoHint } from "@/components/InfoHint";

/** The one entry in the provider list that stands for both built-in engines. */
const BUILTIN_ROW = "__builtin__";

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
  const [tab, setTab] = useState<Tab>(() => {
    const wanted = useUiStore.getState().settingsTab;
    return wanted === "builtin" ? wanted : "general";
  });
  const [providerId, setProviderId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
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
  // Notes only go to local providers; a cloud provider is never used.
  const localProviders = usableProviders(draft).filter((p) => effectiveLocation(p) === "local");

  return (
    <DialogContent className="h-[640px] max-w-4xl">
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
                  data-no-ai
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
                  data-no-ai
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
                  data-no-ai
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
                Spellcheck (the system's own, works without AI)
              </label>
              <label className="flex items-start gap-2 text-sm">
                <input
                  type="checkbox"
                  className="mt-1"
                  checked={draft.editor.aiSpelling}
                  onChange={(e) => {
                    update({ editor: { ...draft.editor, aiSpelling: e.target.checked } });
                  }}
                />
                <span>
                  Spelling help with the local AI
                  <span className="block text-xs text-muted-foreground">
                    A moment after you stop typing, the paragraph is checked and misspelt words get
                    a wavy line. Nothing changes until you click a word and choose. Made for
                    dyslexia. Needs a local AI; without one, the system spellcheck still works.
                  </span>
                </span>
              </label>
              <label className="flex items-start gap-2 text-sm">
                <input
                  type="checkbox"
                  className="mt-1"
                  checked={draft.editor.traceWork}
                  onChange={(e) => {
                    update({ editor: { ...draft.editor, traceWork: e.target.checked } });
                  }}
                />
                <span>
                  Trace my work in today's daily note
                  <span className="block text-xs text-muted-foreground">
                    Mimer writes one short line under “Worked on” for each note you write in and
                    each task you make, work on or finish, once a day. You can edit or remove the
                    lines, and write there yourself. No AI is used.
                  </span>
                </span>
              </label>
              <div className="flex flex-col gap-1">
                <label htmlFor="own-words" className="text-sm">
                  My words (never marked), one per line
                </label>
                <textarea
                  id="own-words"
                  rows={3}
                  className="rounded-md border bg-transparent px-2 py-1 text-sm"
                  value={draft.editor.ownWords.join("\n")}
                  onChange={(e) => {
                    update({
                      editor: {
                        ...draft.editor,
                        ownWords: e.target.value.split("\n"),
                      },
                    });
                  }}
                />
              </div>
              <p className="mt-2 border-t pt-3 text-xs text-muted-foreground">
                Mimer version {appVersion} ({releaseStage}) · built {buildDateLabel()}
              </p>
            </div>
          )}
          {tab === "providers" && (
            <div className="flex gap-4">
              <div className="flex w-44 shrink-0 flex-col gap-1">
                <button
                  type="button"
                  className={cn(
                    "truncate rounded px-2 py-1.5 text-left text-sm hover:bg-muted",
                    providerId === BUILTIN_ROW && "bg-accent",
                  )}
                  onClick={() => {
                    setProviderId(BUILTIN_ROW);
                  }}
                >
                  Built-in AI
                  <span className="block text-[11px] text-muted-foreground">local · Mimer</span>
                </button>
                {draft.ai.providers
                  .filter(
                    (p) =>
                      p.kind !== "builtin" && p.kind !== "foundry_local" && p.kind !== "phi_silica",
                  )
                  .map((p) => (
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
                        {effectiveLocation(p) === "local" ? "local · Mimer" : "cloud · not used"}
                      </span>
                    </button>
                  ))}
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setAdding(true);
                  }}
                >
                  <Plus /> Add provider
                </Button>
              </div>
              <div className="min-w-0 flex-1">
                {providerId === BUILTIN_ROW ? (
                  <div className="flex flex-col gap-2 text-sm">
                    <p className="font-medium">Built-in AI</p>
                    <p className="text-muted-foreground">
                      This is Mimer's own AI. It runs on this computer, so your notes never leave
                      it. Choose the engine (Foundry Local, llama.cpp or, in the Store version, Phi
                      Silica) and the model, and download it, under Built-in AI. Mimer only uses an
                      AI on this computer.
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
                        },
                      });
                      setProviderId(null);
                    }}
                  />
                ) : (
                  <div className="flex flex-col gap-2 text-sm text-muted-foreground">
                    <p>Choose a provider on the left to change it, or press Add provider.</p>
                    <p>
                      Mimer only uses an AI that runs on this computer, so your notes never leave
                      it.
                    </p>
                  </div>
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
              <label className="flex items-start gap-2 text-sm">
                <input
                  type="checkbox"
                  className="mt-1"
                  checked={draft.ai.checkAnswers}
                  onChange={(e) => {
                    update({ ai: { ...draft.ai, checkAnswers: e.target.checked } });
                  }}
                />
                <span>
                  Let the AI check its own answer before showing it
                  <span className="block text-xs text-muted-foreground">
                    For fix spelling, rewrite, translate and the other text commands. The AI is
                    asked once more whether the answer is only the finished text with the same
                    meaning, and tries again if it is not. Mimer always throws away empty answers
                    and thinking out loud. Turning this on makes each answer take longer, so it is
                    best with a fast model.
                  </span>
                </span>
              </label>
              <MimerInstructionSettings draft={draft} onChange={setDraft} />
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
          {tab === "builtin" && <BuiltInAiTab draft={draft} onChange={setDraft} />}
          {tab === "vault" && <VaultSettingsTab />}
          {tab === "history" && (
            <div className="flex flex-col gap-3">
              <div className="flex flex-col gap-1">
                <Label htmlFor="set-author">Author name</Label>
                <Input
                  data-no-ai
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
                  data-no-ai
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
                  data-no-ai
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
      <AddProviderDialog
        open={adding}
        onCancel={() => {
          setAdding(false);
        }}
        onAdd={(p) => {
          setDraft({ ...draft, ai: { ...draft.ai, providers: [...draft.ai.providers, p] } });
          setProviderId(p.id);
          setAdding(false);
        }}
      />
    </DialogContent>
  );
}
