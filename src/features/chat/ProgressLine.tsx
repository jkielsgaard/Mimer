import { Loader2 } from "lucide-react";
import type { ChatProgress } from "@/stores/chatStore";
import { useNow } from "./useNow";

/** Seconds without news after which the line suggests the model may be slow to load. */
export const STALL_SECONDS = 15;

/** What Mimer is doing, in words. The moving parts (timer, word count) are kept out of this text. */
export function phaseText(p: ChatProgress): string {
  switch (p.phase) {
    case "connecting":
      return "Mimer is contacting the model…";
    case "waiting":
      return "Mimer is waiting for the model…";
    case "writing":
      return "Mimer is writing…";
    case "tool":
      return `${p.detail === "" ? "Mimer is working" : p.detail}…`;
  }
}

/** Live status line in an answer that is still being written: phase, step, words and time. */
export function ProgressLine({ progress }: { progress: ChatProgress }) {
  const now = useNow(true);
  const seconds = Math.max(0, Math.floor((now - progress.startedAt) / 1000));
  const quiet = Math.floor((now - progress.lastEventAt) / 1000);
  const stalled = quiet >= STALL_SECONDS && progress.phase !== "writing";
  const extra = [
    progress.step !== null && progress.step >= 2 && progress.max !== null
      ? `Step ${String(progress.step)} of ${String(progress.max)}`
      : null,
    progress.phase === "writing" ? `${String(progress.words)} words` : null,
    `${String(seconds)} s`,
  ]
    .filter((x): x is string => x !== null)
    .join(" · ");
  return (
    <div className="flex max-w-[92%] flex-col gap-1 text-xs text-muted-foreground">
      <div className="flex items-center gap-2">
        <Loader2 className="size-3.5 animate-spin motion-reduce:animate-none" aria-hidden />
        {/* Only the phase is announced to screen readers; the timer would repeat every second. */}
        <span role="status">{phaseText(progress)}</span>
        <span aria-hidden className="tabular-nums">
          {extra}
        </span>
      </div>
      {stalled && (
        <p>Still waiting for the model. A local model may be loading. You can press Stop.</p>
      )}
    </div>
  );
}
