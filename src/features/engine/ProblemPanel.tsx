import { AlertTriangle, Copy } from "lucide-react";
import type { ReactNode } from "react";
import type { Problem } from "@/bindings/Problem";
import { Button } from "@/components/ui/button";
import { copyText } from "@/lib/clipboard";

/**
 * What went wrong with the built-in AI, what to do (numbered steps), and the engine's own last
 * lines for anyone who needs them. `actions` are the buttons that fit the place it is shown.
 */
export function ProblemPanel({ problem, actions }: { problem: Problem; actions?: ReactNode }) {
  return (
    <div
      role="alert"
      data-testid="engine-problem"
      className="space-y-2 rounded-md border border-destructive/60 bg-destructive/10 p-3 text-xs"
    >
      <div className="flex items-start gap-2 text-sm font-semibold text-destructive">
        <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />
        {problem.title}
      </div>
      {problem.steps.length > 0 && (
        <div>
          <p className="mb-1 font-medium">What to do</p>
          <ol className="list-decimal space-y-1 pl-5">
            {problem.steps.map((s, i) => (
              <li key={i}>{s}</li>
            ))}
          </ol>
        </div>
      )}
      {problem.details !== "" && (
        <details>
          <summary className="cursor-pointer text-muted-foreground">Show details</summary>
          <pre className="mt-1 max-h-48 overflow-auto whitespace-pre-wrap rounded bg-background p-2 text-[11px]">
            {problem.details}
          </pre>
        </details>
      )}
      <div className="flex flex-wrap gap-1">
        {actions}
        {problem.details !== "" && (
          <Button
            size="sm"
            variant="ghost"
            onClick={() => {
              void copyText(problem.details);
            }}
          >
            <Copy /> Copy details
          </Button>
        )}
      </div>
    </div>
  );
}
