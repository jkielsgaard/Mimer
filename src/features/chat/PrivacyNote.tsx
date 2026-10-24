import { CloudUpload, ShieldCheck } from "lucide-react";
import { useActiveAi } from "./useActiveAi";

/**
 * The small line at the top of the chat: where the AI runs and what it can see. Green for an AI
 * on this computer; orange when the notes go to the cloud AI the user turned on.
 */
export function PrivacyNote() {
  const { provider, cloud } = useActiveAi();
  if (cloud && provider) {
    return (
      <div
        role="note"
        data-testid="privacy-note"
        data-cloud="true"
        className="flex items-center gap-1.5 border-b bg-warning/15 px-3 py-1 text-[11px] font-medium text-warning"
      >
        <CloudUpload className="size-3.5 shrink-0" aria-hidden />
        Cloud AI · your notes go to {provider.name}
      </div>
    );
  }
  return (
    <div
      role="note"
      data-testid="privacy-note"
      className="flex items-center gap-1.5 border-b bg-success/10 px-3 py-1 text-[11px] font-medium text-success"
    >
      <ShieldCheck className="size-3.5 shrink-0" aria-hidden />
      Local AI · your notes stay on this computer
    </div>
  );
}
