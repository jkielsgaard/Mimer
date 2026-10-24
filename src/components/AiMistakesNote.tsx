import { cn } from "@/lib/utils";

/** "AI can make mistakes": shown wherever an AI answer can be kept, as other AI apps do. */
export function AiMistakesNote({ className }: { className?: string }) {
  return (
    <p className={cn("text-[11px] text-muted-foreground", className)} data-testid="ai-mistakes">
      AI can make mistakes. Check the answer before you keep it.
    </p>
  );
}
