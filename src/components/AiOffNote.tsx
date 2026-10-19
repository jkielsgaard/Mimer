import { useUiStore } from "@/stores/uiStore";

/** A short line where AI buttons are: why they are off, and a way to set the AI up. */
export function AiOffNote({ reason, className }: { reason: string; className?: string }) {
  return (
    <p className={className ?? "px-2 py-1.5 text-[11px] text-muted-foreground"} role="note">
      <span className="font-semibold">AI is off.</span> {reason}{" "}
      <button
        type="button"
        className="text-primary underline underline-offset-2"
        onClick={() => {
          useUiStore.getState().openBuiltInSettings();
        }}
      >
        Set up AI
      </button>
    </p>
  );
}
