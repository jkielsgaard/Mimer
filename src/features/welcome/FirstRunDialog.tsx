import { Check } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { useEngineStore } from "@/stores/engineStore";
import { useFoundryStore } from "@/stores/foundryStore";
import { useSettingsStore } from "@/stores/settingsStore";
import { reportError, useUiStore } from "@/stores/uiStore";
import { useVaultStore } from "@/stores/vaultStore";
import { firstRunDone, markFirstRunDone, needsAiSetup } from "./firstRun";

type Choice = "builtin" | "lmstudio" | "skip";

/**
 * Shown once after a vault opens when there is no AI to talk to yet: the notes folder, which AI to
 * use, and how to get a model. Everything can be changed later in Settings.
 */
export function FirstRunDialog() {
  const vault = useVaultStore((s) => s.vault);
  const noteCount = useVaultStore((s) => s.files.length);
  const settings = useSettingsStore((s) => s.settings);
  const save = useSettingsStore((s) => s.save);
  const builtinModels = useEngineStore((s) => s.status?.models.length ?? null);
  const foundry = useFoundryStore((s) => s.status);
  const foundryModels = foundry ? foundry.installed.length : null;
  const [dismissed, setDismissed] = useState(firstRunDone);
  const [choice, setChoice] = useState<Choice>("builtin");

  // The first-start notice (AI is beta) comes first; the set-up help follows when it is closed.
  const noticeOpen = useUiStore((s) => s.betaNoticeOpen);
  const candidate = vault !== null && !dismissed && settings !== null && !noticeOpen;
  useEffect(() => {
    if (!candidate) return;
    void useEngineStore.getState().load();
    void useFoundryStore.getState().load();
  }, [candidate]);

  const open =
    candidate &&
    builtinModels !== null &&
    needsAiSetup(settings, builtinModels, foundryModels ?? 0);
  if (!open) return null;

  const finish = (): void => {
    markFirstRunDone();
    setDismissed(true);
  };

  const next = async (): Promise<void> => {
    try {
      if (choice === "builtin") {
        const id = foundry?.available ? "foundry" : "builtin";
        await save({ ...settings, ai: { ...settings.ai, defaultProviderId: id } });
        useUiStore.getState().openBuiltInSettings();
      } else if (choice === "lmstudio") {
        await save({ ...settings, ai: { ...settings.ai, defaultProviderId: "lmstudio-default" } });
        useUiStore.getState().setSettingsOpen(true);
      }
      finish();
    } catch (e) {
      reportError(e);
    }
  };

  const options: { id: Choice; title: string; text: string }[] = [
    {
      id: "builtin",
      title: "Built-in AI",
      text: "Recommended. Nothing else to install. Mimer runs the model on this computer.",
    },
    {
      id: "lmstudio",
      title: "LM Studio",
      text: "I already have LM Studio, or prefer it. Mimer connects to it on this computer.",
    },
    { id: "skip", title: "Skip for now", text: "Mimer works as a notes app without an AI." },
  ];

  return (
    <Dialog
      open
      onOpenChange={(o) => {
        if (!o) finish();
      }}
    >
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle className="text-xl">Welcome to Mimer</DialogTitle>
          <DialogDescription>
            Your notes stay on this computer. The AI runs here too. Two choices and you are ready.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-3 sm:grid-cols-2">
          <section aria-label="Notes folder" className="rounded-lg border border-success p-4">
            <div className="flex items-center gap-2 section-label">
              <Check className="size-3.5 text-success" aria-hidden /> 1 · Notes folder
            </div>
            <p className="mt-2 font-semibold">{vault.name}</p>
            <p className="text-xs text-muted-foreground">
              {vault.path} · {noteCount} note{noteCount === 1 ? "" : "s"}
            </p>
            <p className="mt-2 text-xs text-muted-foreground">
              Change folder any time from File → Open vault.
            </p>
          </section>
          <section aria-label="Choose an AI" className="rounded-lg border border-primary p-4">
            <div className="section-label">2 · Choose an AI</div>
            <div role="radiogroup" aria-label="AI" className="mt-2 flex flex-col gap-1.5">
              {options.map((o) => (
                <button
                  key={o.id}
                  type="button"
                  role="radio"
                  aria-checked={choice === o.id}
                  className={cn(
                    "flex flex-col rounded-md border px-3 py-2 text-left text-sm focus-visible:ring-2 focus-visible:ring-ring",
                    choice === o.id
                      ? "border-primary bg-accent text-accent-foreground"
                      : "hover:bg-muted",
                  )}
                  onClick={() => {
                    setChoice(o.id);
                  }}
                >
                  <span className="font-semibold">{o.title}</span>
                  <span className="text-xs text-muted-foreground">{o.text}</span>
                </button>
              ))}
            </div>
          </section>
        </div>
        <p className="text-xs text-muted-foreground">
          {choice === "builtin"
            ? "Next you pick a model to download. A small model is quick; a larger one does a better job with the AI commands."
            : choice === "lmstudio"
              ? "Next you open Settings → AI providers to test the connection to LM Studio."
              : "You can set up an AI later in Settings."}
        </p>
        <DialogFooter>
          <Button variant="ghost" onClick={finish}>
            Skip setup
          </Button>
          <Button
            onClick={() => {
              void next();
            }}
          >
            {choice === "skip" ? "Done" : "Continue"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
