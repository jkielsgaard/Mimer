import { useState } from "react";
import type { AiTestResult } from "@/bindings/AiTestResult";
import type { ProviderConfig } from "@/bindings/ProviderConfig";
import { Button } from "@/components/ui/button";
import { api, toApiError } from "@/lib/api";
import { copyText } from "@/lib/clipboard";
import { wakeIfNeeded } from "@/lib/wake";
import { useSettingsStore } from "@/stores/settingsStore";

type Outcome = { kind: "done"; result: AiTestResult } | { kind: "failed"; message: string };

/** What goes into a bug report: the AI, what happened and how long it took. */
export function testReport(name: string, o: Outcome): string {
  if (o.kind === "failed") return `Test of ${name}\nFailed: ${o.message}`;
  const r = o.result;
  return r.ok
    ? `Test of ${r.provider}\nAnswered in ${String(r.millis)} ms: ${r.answer}`
    : `Test of ${r.provider}\nFailed after ${String(r.millis)} ms: ${r.error}`;
}

/**
 * "Test it" under an AI in Settings → AI: saves the choices made so far, wakes the AI if it is
 * a built-in one, and asks it one short question with none of the user's notes in it. The answer
 * or the error is shown in plain words, and the error can be copied into a bug report.
 */
export function TestAi({
  provider,
  persist,
}: {
  provider: ProviderConfig;
  persist: () => Promise<boolean>;
}) {
  const [running, setRunning] = useState(false);
  const [outcome, setOutcome] = useState<Outcome | null>(null);

  const run = async (): Promise<void> => {
    setRunning(true);
    setOutcome(null);
    try {
      if (!(await persist())) return;
      // The saved copy: a built-in AI gets its address and model written there when it wakes.
      const saved =
        useSettingsStore.getState().settings?.ai.providers.find((p) => p.id === provider.id) ??
        provider;
      const asleep = await wakeIfNeeded(saved);
      if (asleep !== null) {
        setOutcome({ kind: "failed", message: asleep });
        return;
      }
      setOutcome({ kind: "done", result: await api.aiTest(provider.id) });
    } catch (e) {
      setOutcome({ kind: "failed", message: toApiError(e).message });
    } finally {
      setRunning(false);
    }
  };

  return (
    <div className="flex flex-col gap-2 pb-3">
      <div className="flex flex-wrap items-center gap-2">
        <Button
          size="sm"
          variant="outline"
          disabled={running}
          onClick={() => {
            void run();
          }}
        >
          {running ? "Testing…" : "Test it"}
        </Button>
        <span className="text-xs text-muted-foreground">
          Saves your choices, then sends one short question with none of your notes and shows the
          answer, or the error in plain words.
        </span>
      </div>
      {outcome !== null && (
        <div
          role="status"
          className="flex flex-col gap-1.5 rounded-md border bg-background p-2 text-xs"
        >
          {outcome.kind === "done" && outcome.result.ok ? (
            <p>
              <b className="text-success">It answered</b> in{" "}
              {(outcome.result.millis / 1000).toFixed(1)} s: “{outcome.result.answer}”
            </p>
          ) : (
            <p>
              <b className="text-destructive">It did not answer.</b>{" "}
              {outcome.kind === "done" ? outcome.result.error : outcome.message}
            </p>
          )}
          {!(outcome.kind === "done" && outcome.result.ok) && (
            <div>
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  void copyText(testReport(provider.name, outcome));
                }}
              >
                Copy for a bug report
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
