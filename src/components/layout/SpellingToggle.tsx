import { SpellCheck } from "lucide-react";
import { useAiBlocked } from "@/lib/useAiBlocked";
import { cn } from "@/lib/utils";
import { useSettingsStore } from "@/stores/settingsStore";
import { reportError } from "@/stores/uiStore";

/** The status bar switch for spelling help. Without an AI it says why it does nothing. */
export function SpellingToggle() {
  const settings = useSettingsStore((s) => s.settings);
  const off = useAiBlocked();
  if (!settings) return null;
  const on = settings.editor.aiSpelling;
  const waiting = on ? off : null;
  const idle = waiting !== null;
  return (
    <button
      type="button"
      aria-pressed={on}
      title={
        idle
          ? `Spelling help is on, but waits for the AI: ${waiting} The system spellcheck still works.`
          : on
            ? "Spelling help is on: misspelt words get a wavy line. Click to turn it off."
            : "Spelling help is off. Click to let the local AI mark misspelt words while you write."
      }
      className={cn(
        "flex items-center gap-1 rounded px-1 hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring",
        on && !idle && "text-foreground",
      )}
      onClick={() => {
        void useSettingsStore
          .getState()
          .save({ ...settings, editor: { ...settings.editor, aiSpelling: !on } })
          .catch(reportError);
      }}
    >
      <SpellCheck className="size-3" aria-hidden />
      Spelling help: {on ? (idle ? "waiting for AI" : "on") : "off"}
    </button>
  );
}
