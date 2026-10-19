import { ShieldCheck } from "lucide-react";

/** The small line at the top of the chat: where the AI runs and what it can see. */
export function PrivacyNote() {
  return (
    <div
      role="note"
      data-testid="privacy-note"
      className="flex items-center gap-1.5 border-b bg-success/10 px-3 py-1.5 text-[11px] font-medium text-success"
    >
      <ShieldCheck className="size-3.5 shrink-0" aria-hidden />
      Local AI · your notes stay on this computer
    </div>
  );
}
