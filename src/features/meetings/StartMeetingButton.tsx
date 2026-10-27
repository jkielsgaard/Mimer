import { CalendarPlus, Presentation } from "lucide-react";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api";
import { flushPendingWrites } from "@/lib/flush";
import { nextMeetingSeed } from "@/lib/meeting";
import { useNoteTags } from "@/lib/useNoteTags";
import { reportError, useUiStore } from "@/stores/uiStore";

/**
 * Above a note tagged `meeting`: "Start meeting" and "Prepare next meeting…" (the same window as
 * a new meeting note, filled in from this one). Nothing is shown for other notes.
 */
export function StartMeetingButton({ path }: { path: string | null }) {
  const { tags } = useNoteTags(path);
  // The tag makes a note a meeting, wherever it is; a note without it is only a note.
  if (path === null || !tags.includes("meeting")) return null;

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
