import { Cloud, ShieldCheck } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * The small line at the top of the Mimer and Raven tabs. It tells the user where the AI runs and
 * what it can see: Mimer is local and sees the notes, Raven is cloud and never sees them.
 */
export function PrivacyNote({
  kind,
  providerName,
}: {
  kind: "local" | "cloud";
  /** For the cloud kind: who receives what the user types. */
  providerName?: string | undefined;
}) {
  const local = kind === "local";
  return (
    <div
      role="note"
      data-testid="privacy-note"
      className={cn(
        "flex flex-col gap-0.5 border-b px-3 py-1.5 text-[11px]",
        local ? "bg-success/10 text-success" : "bg-warning/15 text-foreground",
      )}
    >
      <div className="flex items-center gap-1.5 font-medium">
        {local ? (
          <ShieldCheck className="size-3.5 shrink-0" aria-hidden />
        ) : (
          <Cloud className="size-3.5 shrink-0" aria-hidden />
        )}
        {local
          ? "Local AI · your notes stay on this computer"
          : "Cloud AI · no access to your notes"}
      </div>
      {!local && providerName !== undefined && (
        <div className="text-muted-foreground">What you type here is sent to {providerName}.</div>
      )}
    </div>
  );
}
