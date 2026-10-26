import { CalendarPlus, Presentation } from "lucide-react";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api";
import { flushPendingWrites } from "@/lib/flush";
import { nextMeetingSeed } from "@/lib/meeting";
import { reportError, useUiStore } from "@/stores/uiStore";
import { useVaultStore } from "@/stores/vaultStore";

/**
 * Above a note in the meetings folder: "Start meeting" and "Prepare next meeting…" (the same
 * window as a new meeting note, filled in from this one). Nothing is shown for other notes.
 */
export function StartMeetingButton({ path }: { path: string | null }) {
  const folder = useVaultStore((s) => s.vault?.config.meetingsFolder) ?? "";
  if (path === null || folder === "" || !path.startsWith(`${folder.replace(/\/+$/, "")}/`)) {
    return null;
  }

  /** Opens the window for the next meeting, from the note as it is on disk. */
  const prepareNext = (): void => {
    flushPendingWrites()
      .then(() => api.readNote(path))
      .then((note) => {
        useUiStore.getState().openMeetingFormWith(nextMeetingSeed(note.content));
      })
      .catch(reportError);
  };

  return (
    <>
      <Button
        type="button"
        size="sm"
        variant="outline"
        onClick={() => {
          useUiStore.getState().setMeetingFocus(path);
        }}
      >
        <Presentation /> Start meeting
      </Button>
      <Button type="button" size="sm" variant="ghost" onClick={prepareNext}>
        <CalendarPlus /> Prepare next meeting…
      </Button>
    </>
  );
}
