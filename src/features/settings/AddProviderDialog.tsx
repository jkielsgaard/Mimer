import { useState } from "react";
import type { ProviderConfig } from "@/bindings/ProviderConfig";
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
import { newProvider } from "./ProviderEditor";

interface Choice {
  id: string;
  title: string;
  where: "local" | "cloud";
  text: string;
  make: () => ProviderConfig;
}

/** The kinds of AI that can be added, with where each one runs and who may use it. */
export const PROVIDER_CHOICES: Choice[] = [
  {
    id: "lmstudio",
    title: "LM Studio",
    where: "local",
    text: "A free program that runs AI models on this computer.",
    make: () => newProvider("lmstudio"),
  },
  {
    id: "foundry_local",
    title: "Foundry Local",
    where: "local",
    text: "Microsoft's program for running models on this computer, also on a neural processor (NPU). Windows and macOS.",
    make: () => newProvider("foundry_local"),
  },
  {
    id: "local_server",
    title: "Another server on this computer",
    where: "local",
    text: "Anything that speaks the OpenAI interface, for example Ollama or llama.cpp.",
    make: () => ({
      ...newProvider("openai_compatible"),
      name: "Local server",
      baseUrl: "http://localhost:11434/v1",
      location: "local",
      contextTokens: 16000,
    }),
  },
  {
    id: "anthropic",
    title: "Anthropic (Claude)",
    where: "cloud",
    text: "A cloud AI. Needs an account and an API key from Anthropic, and costs money.",
    make: () => newProvider("anthropic"),
  },
  {
    id: "cloud_openai",
    title: "Cloud AI with the OpenAI interface",
    where: "cloud",
    text: "OpenAI, Azure OpenAI and other cloud services. Needs an account and an API key.",
    make: () => newProvider("openai_compatible"),
  },
];

interface Props {
  open: boolean;
  onCancel: () => void;
  onAdd: (provider: ProviderConfig) => void;
}

/** Asks which kind of AI to add, and explains who can use it, before the provider is made. */
export function AddProviderDialog({ open, onCancel, onAdd }: Props) {
  const [choice, setChoice] = useState<string | null>(null);
  const picked = PROVIDER_CHOICES.find((c) => c.id === choice);
  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) {
          setChoice(null);
          onCancel();
        }
      }}
    >
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="text-base font-semibold">Add an AI provider</DialogTitle>
          <DialogDescription className="sr-only">Choose which kind of AI to add</DialogDescription>
        </DialogHeader>
        <div
          role="note"
          data-testid="add-provider-note"
          className="rounded-md border bg-muted/40 p-2 text-xs text-muted-foreground"
        >
          <p>
            <strong className="text-foreground">Local AI</strong> runs on this computer and is used
            by <strong>Mimer</strong>, which reads your notes. A local AI cannot be used by Raven.
          </p>
          <p className="mt-1">
            <strong className="text-foreground">Raven works only with a cloud AI</strong>, because
            only a cloud AI can look things up on the internet. Raven never sees your notes, and
            Mimer never uses a cloud AI.
          </p>
        </div>
        <div role="radiogroup" aria-label="Kind of AI" className="flex flex-col gap-2">
          {PROVIDER_CHOICES.map((c) => (
            <button
              key={c.id}
              type="button"
              role="radio"
              aria-checked={choice === c.id}
              className={cn(
                "rounded-md border p-2 text-left text-sm hover:bg-muted",
                choice === c.id && "border-primary bg-accent",
              )}
              onClick={() => {
                setChoice(c.id);
              }}
            >
              <span className="flex items-center gap-2">
                <span className="font-medium">{c.title}</span>
                <span
                  className={cn(
                    "rounded px-1.5 py-0.5 text-[11px]",
                    c.where === "local"
                      ? "bg-success/15 text-success"
                      : "bg-warning/20 text-foreground",
                  )}
                >
                  {c.where === "local" ? "Local · for Mimer" : "Cloud · for Raven only"}
                </span>
              </span>
              <span className="block text-xs text-muted-foreground">{c.text}</span>
            </button>
          ))}
        </div>
        <p className="text-xs text-muted-foreground">
          The built-in AI is not added here: it has its own tab, Built-in AI.
        </p>
        <DialogFooter>
          <Button
            variant="ghost"
            onClick={() => {
              setChoice(null);
              onCancel();
            }}
          >
            Cancel
          </Button>
          <Button
            disabled={!picked}
            onClick={() => {
              if (!picked) return;
              onAdd(picked.make());
              setChoice(null);
            }}
          >
            Add
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
