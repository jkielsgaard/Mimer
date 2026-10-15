import { Copy, Download, Telescope } from "lucide-react";
import { Bird } from "lucide-react";
import type { ResearchCard } from "@/bindings/ResearchCard";
import { Button } from "@/components/ui/button";
import { copyText } from "@/lib/clipboard";
import { useRaven } from "@/features/raven/useRaven";
import { useRavenStore } from "@/stores/ravenStore";
import { useUiStore } from "@/stores/uiStore";

/** A prompt Mimer wrote for a cloud AI with internet access, with Copy and Import buttons. */
export function ResearchPromptCard({ card }: { card: ResearchCard }) {
  const raven = useRaven();
  return (
    <div className="w-full max-w-[92%] rounded-md border bg-card p-2 text-xs">
      <div className="mb-1 flex items-center gap-1.5 font-medium">
        <Telescope className="size-3.5" aria-hidden /> {card.title}
      </div>
      <details className="mb-2">
        <summary className="cursor-pointer text-muted-foreground">Show the prompt</summary>
        <pre className="mt-1 max-h-60 overflow-auto whitespace-pre-wrap rounded bg-muted p-2 text-[11px]">
          {card.text}
        </pre>
      </details>
      <div className="flex flex-wrap gap-1">
        <Button
          size="sm"
          onClick={() => {
            void copyText(card.text);
          }}
        >
          <Copy /> Copy prompt
        </Button>
        {raven && (
          <Button
            size="sm"
            variant="outline"
            title="Puts the prompt in Raven's message box. You press send."
            onClick={() => {
              useRavenStore.getState().setDraft(card.text);
              useUiStore.getState().focusRaven();
            }}
          >
            <Bird /> Send to Raven
          </Button>
        )}
        <Button
          size="sm"
          variant="ghost"
          onClick={() => {
            useUiStore.getState().setImportAnswerOpen(true);
          }}
        >
          <Download /> Import the answer
        </Button>
      </div>
    </div>
  );
}
