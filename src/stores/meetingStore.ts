import { create } from "zustand";
import { api } from "@/lib/api";
import { toMeetingNotes, type MeetingNote } from "@/lib/meetingList";

interface MeetingState {
  meetings: MeetingNote[];
  loaded: boolean;
  /** The meeting shown in the middle (its note), or null for the default one. */
  selected: string | null;
  /** A day picked in the calendar, or null. */
  day: string | null;
  /** Reads the notes tagged `meeting` again. */
  load: () => Promise<void>;
  select: (path: string | null) => void;
  setDay: (iso: string | null) => void;
}

/** The read that is running, and whether another was asked for meanwhile. */
let running: Promise<void> | null = null;
let again = false;
/** Read through a function: TypeScript would otherwise think `again` is still false. */
const askedAgain = (): boolean => again;

/**
 * The meetings: every note with the tag `meeting`, wherever it is. Several screens ask for them
 * when the notes change; the asks are joined, so one read runs at a time and the last one asked
 * for is what the list shows when the promise ends.
 */
export const useMeetingStore = create<MeetingState>((set) => ({
  meetings: [],
  loaded: false,
  selected: null,
  day: null,
  load: () => {
    if (running) {
      again = true;
      return running;
    }
    running = (async () => {
      do {
        again = false;
        try {
          set({ meetings: toMeetingNotes(await api.taggedNotes("meeting")), loaded: true });
        } catch {
          // The list stays as it was; the next change of the notes reads it again.
          set({ loaded: true });
        }
      } while (askedAgain());
    })().finally(() => {
      running = null;
    });
    return running;
  },
  select: (selected) => {
    set({ selected });
  },
  setDay: (day) => {
    set({ day });
  },
}));
