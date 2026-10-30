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
import { nameError, projectNameError } from "@/lib/nameConflict";
import { reportError, type ProjectDialogState, useUiStore } from "@/stores/uiStore";
import { useTreeStore } from "@/stores/treeStore";
import { useVaultStore } from "@/stores/vaultStore";
import { InfoHint } from "@/components/InfoHint";
import { Checkbox } from "@/components/ui/checkbox";

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
  // A project chooses among the AIs on this computer; the cloud AI, when turned on, is Mimer's.
  const localProviders = settings.ai.providers.filter((p) => p.location === "local");
  const [name, setName] = useState(p0?.name ?? "");
  const [instructions, setInstructions] = useState(p0?.instructions ?? "");
  const [providerId, setProviderId] = useState(
    localProviders.some((p) => p.id === p0?.providerId) ? (p0?.providerId ?? GLOBAL) : GLOBAL,
  );
  const [localOnly, setLocalOnly] = useState(p0?.localOnly ?? false);
  const [askText, setAskText] = useState("");
  const [proposal, setProposal] = useState<string | null>(null);
  const [asking, setAsking] = useState(false);
  const [askError, setAskError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const raw = useRef("");

  const isNew = state.project === null;
  const allProjects = useVaultStore((s) => s.projects);
  // Two projects with the same name look the same under Projects, so the name must be unique.
  const tree = useVaultStore((s) => s.tree);
  // A new project is a new folder in the vault root, so its name must be free there too.
  const nameProblem =
    name.trim() === ""
      ? null
      : ((isNew ? nameError(tree, allProjects, "", name, true) : null) ??
        projectNameError(allProjects, name, p0?.id));
  const globalDefault = settings.ai.providers.find((p) => p.id === settings.ai.defaultProviderId);

  const save = async (): Promise<void> => {
    if (name.trim() === "") return;
    const pid = providerId === GLOBAL ? null : providerId;
    try {
      if (state.project) {
        await api.updateProject({
          ...state.project,
          name: name.trim(),
          instructions,
          providerId: pid,
          localOnly,
        });
      } else {
        const made = await api.createProject(name.trim(), instructions, pid);
        if (localOnly) await api.updateProject({ ...made, localOnly });
        // The project's folder is new: show it under Projects.
        await useVaultStore.getState().refreshTree();
        useTreeStore.getState().setSectionOpen("projects", true);
        useTreeStore.getState().setProjectOpen(made.folder, true);
      }
      await useVaultStore.getState().refreshProjects();
      useUiStore.getState().toast("Project saved", "success");
      close();
    } catch (e) {
      reportError(e);
    }
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
              {isNew ? "New project" : "Project settings"}
            </DialogTitle>
            <DialogDescription className="text-sm text-muted-foreground">
              {isNew ? (
                "A project is a new folder in the vault root, with the name you choose. It is made now and cannot be made from an existing folder."
              ) : (
                <>
                  Folder: <code>{state.folder}</code>. The AI assistant uses these instructions for
                  notes in this folder.
                </>
              )}
            </DialogDescription>
          </DialogHeader>
          <div className="flex min-h-0 flex-col gap-3 overflow-auto pr-1">
            <div className="flex flex-col gap-1">
              <Label htmlFor="proj-name">Name</Label>
              <Input
                data-no-ai
                id="proj-name"
                value={name}
                aria-invalid={nameProblem !== null}
                onChange={(e) => {
                  setName(e.target.value);
                }}
              />
              {nameProblem && (
                <p
                  role="alert"
                  className="rounded-md border border-destructive/60 bg-destructive/10 px-3 py-2 text-sm font-medium text-destructive"
                >
                  {nameProblem}
                </p>
              )}
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
                  data-no-ai
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
                {localProviders.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </Select>
            </div>
            <label className="flex items-start gap-2 text-sm">
              <Checkbox
                className="mt-1"
                checked={localOnly}
                onChange={(e) => {
                  setLocalOnly(e.target.checked);
                }}
              />
              <span>
                Local AI only
                <span className="block text-xs text-muted-foreground">
                  The notes of this project never go to a cloud AI, even when one is turned on under
                  Settings → AI.
                </span>
              </span>
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
            <Button
              disabled={name.trim() === "" || nameProblem !== null}
              onClick={() => {
                void save();
              }}
            >
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
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
