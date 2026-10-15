import { useEffect, useState } from "react";
import type { ResearchSpec } from "@/bindings/ResearchSpec";
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
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { api, toApiError } from "@/lib/api";
import { copyText } from "@/lib/clipboard";
import { useUiStore } from "@/stores/uiStore";

const EMPTY: ResearchSpec = {
  topic: "",
  goal: "",
  audience: "",
  depth: "detailed",
  language: "English",
  kind: "documentation",
  context: "",
};

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1 text-xs text-muted-foreground">
      {label}
      {children}
    </label>
  );
}

/**
 * File → Write a research prompt: describe what you need, get a prompt for a cloud AI with
 * internet access. The prompt also tells that AI how to format its answer, so Mimer can import it.
 */
export function ResearchDialog() {
  const open = useUiStore((s) => s.researchOpen);
  const setOpen = useUiStore((s) => s.setResearchOpen);
  const [spec, setSpec] = useState<ResearchSpec>(EMPTY);
  const [prompt, setPrompt] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setSpec(EMPTY);
    setPrompt(null);
    setError(null);
  }, [open]);

  const set = (patch: Partial<ResearchSpec>): void => {
    setSpec((s) => ({ ...s, ...patch }));
  };

  const build = async (): Promise<void> => {
    setError(null);
    try {
      setPrompt(await api.buildResearchPrompt(spec));
    } catch (e) {
      setError(toApiError(e).message);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="max-h-[90vh] max-w-xl overflow-auto">
        <DialogHeader>
          <DialogTitle className="text-base font-semibold">Write a research prompt</DialogTitle>
          <DialogDescription className="text-xs">
            Mimer has no internet access. Take this prompt to a cloud AI that can search, then bring
            the answer back with “Import an answer”.
          </DialogDescription>
        </DialogHeader>
        {prompt === null ? (
          <div className="flex flex-col gap-3">
            <Field label="Topic">
              <Input
                autoFocus
                value={spec.topic}
                placeholder="For example: Zero trust networking"
                onChange={(e) => {
                  set({ topic: e.target.value });
                }}
              />
            </Field>
            <Field label="What is it for? (optional)">
              <Input
                value={spec.goal}
                onChange={(e) => {
                  set({ goal: e.target.value });
                }}
              />
            </Field>
            <Field label="Who will read it? (optional)">
              <Input
                value={spec.audience}
                onChange={(e) => {
                  set({ audience: e.target.value });
                }}
              />
            </Field>
            <div className="grid grid-cols-3 gap-2">
              <Field label="Type">
                <Select
                  value={spec.kind}
                  onChange={(e) => {
                    set({ kind: e.target.value });
                  }}
                >
                  <option value="documentation">Documentation</option>
                  <option value="howto">How-to guide</option>
                  <option value="comparison">Comparison</option>
                  <option value="summary">Summary</option>
                  <option value="checklist">Checklist</option>
                </Select>
              </Field>
              <Field label="Depth">
                <Select
                  value={spec.depth}
                  onChange={(e) => {
                    set({ depth: e.target.value });
                  }}
                >
                  <option value="overview">Overview</option>
                  <option value="detailed">Detailed</option>
                  <option value="expert">Expert</option>
                </Select>
              </Field>
              <Field label="Language">
                <Input
                  value={spec.language}
                  onChange={(e) => {
                    set({ language: e.target.value });
                  }}
                />
              </Field>
            </div>
            <Field label="What do you already have? (optional)">
              <Textarea
                rows={3}
                value={spec.context}
                onChange={(e) => {
                  set({ context: e.target.value });
                }}
              />
            </Field>
            {error !== null && (
              <p role="alert" className="text-xs text-destructive">
                {error}
              </p>
            )}
            <DialogFooter>
              <Button
                variant="ghost"
                onClick={() => {
                  setOpen(false);
                }}
              >
                Cancel
              </Button>
              <Button disabled={spec.topic.trim() === ""} onClick={() => void build()}>
                Write the prompt
              </Button>
            </DialogFooter>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            <Textarea
              readOnly
              aria-label="The research prompt"
              rows={14}
              className="font-mono text-xs"
              value={prompt}
            />
            <DialogFooter>
              <Button
                variant="ghost"
                onClick={() => {
                  setPrompt(null);
                }}
              >
                Back
              </Button>
              <Button
                variant="ghost"
                onClick={() => {
                  setOpen(false);
                  useUiStore.getState().setImportAnswerOpen(true);
                }}
              >
                Import the answer…
              </Button>
              <Button
                onClick={() => {
                  void copyText(prompt);
                }}
              >
                Copy prompt
              </Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
