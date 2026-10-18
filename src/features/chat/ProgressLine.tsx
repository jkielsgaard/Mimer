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

/** A rough time left for a run in steps, from the time the finished steps took. */
export function timeLeft(elapsedMs: number, step: number, max: number): string | null {
  const done = step - 1;
  if (done < 2 || max <= step) return null;
  const left = ((elapsedMs / done) * (max - done)) / 1000;
  if (left < 30) return "less than a minute left";
  return `about ${String(Math.round(left / 60) || 1)} min left`;
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
  const inSteps =
    progress.step !== null && progress.step >= 2 && progress.max !== null && progress.max > 0;
  const left = inSteps
    ? timeLeft(now - progress.startedAt, progress.step ?? 0, progress.max ?? 0)
    : null;
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
      {inSteps && (
        <div
          role="progressbar"
          aria-label="Progress"
          aria-valuemin={0}
          aria-valuemax={progress.max ?? 0}
          aria-valuenow={(progress.step ?? 1) - 1}
          className="h-1.5 w-56 overflow-hidden rounded-full bg-muted"
        >
          <div
            className="h-full bg-primary"
            style={{
              width: `${String((((progress.step ?? 1) - 1) / (progress.max ?? 1)) * 100)}%`,
            }}
          />
        </div>
      )}
      {left !== null && <p>{left}</p>}
      {stalled && (
        <p>Still waiting for the model. A local model may be loading. You can press Stop.</p>
      )}
    </div>
  );
}
