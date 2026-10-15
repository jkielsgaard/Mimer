import { Sparkles } from "lucide-react";
import type { Settings } from "@/bindings/Settings";
import { useRef, useState } from "react";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { DiffView } from "@/components/DiffView";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { api, toApiError } from "@/lib/api";
import { basename } from "@/lib/utils";
import { reportError, type ProjectDialogState, useUiStore } from "@/stores/uiStore";
import { useVaultStore } from "@/stores/vaultStore";
import { InfoHint } from "@/components/InfoHint";

const GLOBAL = "__global__";

export function ProjectForm({
  state,
  settings,
}: {
  state: ProjectDialogState;
  settings: Settings;
}) {
  const close = (): void => {
    useUiStore.getState().openProjectDialog(null);
  };
  const p0 = state.project;
  const cloudDefault =
    settings.ai.providers.find((x) => x.id === settings.ai.defaultProviderId)?.location === "cloud";
  const [name, setName] = useState(p0?.name ?? basename(state.folder));
  const [instructions, setInstructions] = useState(p0?.instructions ?? "");
  const [providerId, setProviderId] = useState(p0?.providerId ?? GLOBAL);
  const [localOnly, setLocalOnly] = useState(p0?.localOnly ?? !cloudDefault);
  const [askText, setAskText] = useState("");
  const [proposal, setProposal] = useState<string | null>(null);
  const [asking, setAsking] = useState(false);
  const [askError, setAskError] = useState<string | null>(null);
  const [lockPrompt, setLockPrompt] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const raw = useRef("");

  const isNew = state.project === null;
  const globalDefault = settings.ai.providers.find((p) => p.id === settings.ai.defaultProviderId);

  const persist = async (lock: boolean | null): Promise<void> => {
    const finalLocal = lock ?? localOnly;
    const pid = providerId === GLOBAL ? null : providerId;
    try {
      if (state.project) {
        await api.updateProject({
          ...state.project,
          name: name.trim(),
          instructions,
          providerId: pid,
          localOnly: finalLocal,
        });
      } else {
        await api.createProject(state.folder, name.trim(), instructions, pid, finalLocal);
      }
      await useVaultStore.getState().refreshProjects();
      useUiStore.getState().toast("Project saved", "success");
      close();
    } catch (e) {
      reportError(e);
    }
  };

  const save = (): void => {
    if (name.trim() === "") return;
    // New project while the global default is a cloud provider: offer to lock to local AI.
    if (isNew && providerId === GLOBAL && globalDefault?.location === "cloud" && !localOnly) {
      setLockPrompt(true);
      return;
    }
    void persist(null);
  };

  const askAi = async (): Promise<void> => {
    if (askText.trim() === "") return;
    setAsking(true);
    setAskError(null);
    setProposal(null);
    raw.current = "";
    try {
      await api.aiInline(
        {
          command: "refineInstructions",
          instruction: askText.trim(),
          text: instructions,
          notePath: null,
          providerId: providerId === GLOBAL ? null : providerId,
          localOnly,
        },
        (e) => {
          if (e.type === "textDelta") {
            raw.current += e.text;
          } else if (e.type === "error") {
            setAskError(e.error.message);
            setAsking(false);
          } else {
            setProposal(raw.current.trim());
            setAsking(false);
          }
        },
      );
    } catch (e) {
      setAskError(toApiError(e).message);
      setAsking(false);
    }
  };

  return (
    <>
      <Dialog
        open
        onOpenChange={(o) => {
          if (!o) close();
        }}
      >
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle className="text-base font-semibold">
              {isNew ? "Make project" : "Project settings"}
            </DialogTitle>
            <DialogDescription className="text-sm text-muted-foreground">
              Folder: <code>{state.folder}</code>. The AI assistant uses these instructions and
              rules for notes in this folder.
            </DialogDescription>
          </DialogHeader>
          <div className="flex min-h-0 flex-col gap-3 overflow-auto pr-1">
            <div className="flex flex-col gap-1">
              <Label htmlFor="proj-name">Name</Label>
              <Input
                id="proj-name"
                value={name}
                onChange={(e) => {
                  setName(e.target.value);
                }}
              />
            </div>
            <div className="flex flex-col gap-1">
              <div className="flex items-center gap-1.5">
                <Label htmlFor="proj-instr">Instructions (Markdown)</Label>
                <InfoHint
                  label="Project instructions"
                  text="What Mimer should know and how to write in this project. Mimer follows these in every chat inside the project."
                  topic="projects"
                />
              </div>
              <Textarea
                id="proj-instr"
                rows={6}
                value={instructions}
                placeholder="You help write ISO 27001 documentation…"
                onChange={(e) => {
                  setInstructions(e.target.value);
                }}
              />
            </div>
            <div className="flex flex-col gap-1 rounded-md border p-2">
              <Label htmlFor="proj-ask">Ask AI to change the instructions</Label>
              <div className="flex gap-2">
                <Input
                  id="proj-ask"
                  value={askText}
                  placeholder="Make these instructions stricter about formatting"
                  onChange={(e) => {
                    setAskText(e.target.value);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      void askAi();
                    }
                  }}
                />
                <Button
                  variant="outline"
                  disabled={asking || askText.trim() === ""}
                  onClick={() => void askAi()}
                >
                  <Sparkles /> {asking ? "Asking…" : "Ask AI"}
                </Button>
              </div>
              {askError && (
                <p role="alert" className="text-xs text-destructive">
                  {askError}
                </p>
              )}
              {proposal !== null && (
                <div className="mt-1 flex flex-col gap-2">
                  <div className="max-h-48 overflow-auto rounded border">
                    <DiffView original={instructions} modified={proposal} />
                  </div>
                  <div className="flex justify-end gap-2">
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => {
                        setProposal(null);
                      }}
                    >
                      Reject
                    </Button>
                    <Button
                      size="sm"
                      onClick={() => {
                        setInstructions(proposal);
                        setProposal(null);
                      }}
                    >
                      Accept
                    </Button>
                  </div>
                </div>
              )}
            </div>
            <div className="flex flex-col gap-1">
              <Label htmlFor="proj-provider">AI provider</Label>
              <Select
                id="proj-provider"
                value={providerId}
                onChange={(e) => {
                  setProviderId(e.target.value);
                }}
              >
                <option value={GLOBAL}>Use global default ({globalDefault?.name ?? "none"})</option>
                {settings.ai.providers.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} ({p.location})
                  </option>
                ))}
              </Select>
            </div>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={localOnly}
                onChange={(e) => {
                  setLocalOnly(e.target.checked);
                }}
              />
              Local AI only
              <span className="text-xs text-muted-foreground">
                (cloud providers are blocked for this project)
              </span>
              <InfoHint
                label="Local AI only"
                text="Mimer then only uses an AI on your own computer for this project. Nothing from the project is sent to a cloud service, and Mimer enforces it."
                topic="projects"
              />
            </label>
          </div>
          <DialogFooter className="items-center">
            {!isNew && (
              <Button
                variant="ghost"
                className="mr-auto text-destructive"
                onClick={() => {
                  setConfirmDelete(true);
                }}
              >
                Remove project
              </Button>
            )}
            <Button variant="ghost" onClick={close}>
              Cancel
            </Button>
            <Button disabled={name.trim() === ""} onClick={save}>
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <ConfirmDialog
        open={lockPrompt}
        title="Lock this project to local AI?"
        description={`This project will use ${globalDefault?.name ?? "a cloud provider"}. Lock it to local AI instead?`}
        confirmLabel="Lock to local AI"
        cancelLabel="Use global default"
        onCancel={() => {
          setLockPrompt(false);
          void persist(false);
        }}
        onConfirm={() => {
          setLockPrompt(false);
          setLocalOnly(true);
          void persist(true);
        }}
      />
      <ConfirmDialog
        open={confirmDelete}
        title="Remove this project?"
        description="Only the project settings are removed. The folder and its notes are not touched."
        confirmLabel="Remove project"
        destructive
        onCancel={() => {
          setConfirmDelete(false);
        }}
        onConfirm={() => {
          setConfirmDelete(false);
          const p = state.project;
          if (!p) return;
          api
            .deleteProject(p.id)
            .then(() => useVaultStore.getState().refreshProjects())
            .then(close)
            .catch(reportError);
        }}
      />
    </>
  );
}
