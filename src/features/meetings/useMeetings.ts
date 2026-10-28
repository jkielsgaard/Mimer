import { useEffect, useMemo } from "react";
import { defaultMeeting, groupMeetings, type MeetingNote } from "@/lib/meetingList";
import { todayIso } from "@/lib/taskLogic";
import { useMeetingStore } from "@/stores/meetingStore";
import { useVaultStore } from "@/stores/vaultStore";

/** The meeting that is shown in the middle: the chosen one, or the one that comes next. */
export function useShownMeeting(): MeetingNote | null {
  const meetings = useMeetingStore((s) => s.meetings);
  const selected = useMeetingStore((s) => s.selected);
  return useMemo(() => {
    const chosen = meetings.find((m) => m.path === selected);
    if (chosen) return chosen;
    return defaultMeeting(groupMeetings(meetings, todayIso()), new Date());
  }, [meetings, selected]);
}

/** Reads the meetings when the area opens and again when the notes change. */
export function useMeetingsLoaded(): void {
  const files = useVaultStore((s) => s.files);
  const nonce = useVaultStore((s) => s.reloadNonce);
  const indexNonce = useVaultStore((s) => s.indexNonce);
  useEffect(() => {
    void useMeetingStore.getState().load();
  }, [files, nonce, indexNonce]);
}
