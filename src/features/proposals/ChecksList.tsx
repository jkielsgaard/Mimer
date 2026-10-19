import { Check, TriangleAlert } from "lucide-react";
import type { CheckResult } from "@/bindings/CheckResult";
import { cn } from "@/lib/utils";

/** Mimer's checks of a skill's change, as small labels; a failed one says what went wrong. */
export function ChecksList({
  checks,
  note = "Not selected, because the AI may have made a mistake. Look at the change before you accept it.",
}: {
  checks: CheckResult[];
  /** What a failed check means here. */
  note?: string;
}) {
  const failed = checks.filter((c) => !c.ok);
  return (
    <section aria-label="Mimer's checks" className="flex flex-col gap-1.5">
      <h4 className="section-label">Mimer checked the change</h4>
      <ul className="flex flex-wrap gap-1.5">
        {checks.map((c) => (
          <li
            key={c.label}
            className={cn(
              "flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs",
              c.ok ? "text-success" : "border-warning bg-warning/15 text-foreground",
            )}
          >
            {c.ok ? (
              <Check className="size-3" aria-hidden />
            ) : (
              <TriangleAlert className="size-3" aria-hidden />
            )}
            <span>{c.label}</span>
            <span className="sr-only">{c.ok ? "passed" : "failed"}</span>
          </li>
        ))}
      </ul>
      {failed.length > 0 && (
        <div className="rounded-md bg-warning/15 px-3 py-2 text-xs">
          <p className="font-medium">{note}</p>
          <ul className="mt-1 list-disc pl-4">
            {failed.map((c) => (
              <li key={c.label}>
                {c.label}: {c.detail}
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
