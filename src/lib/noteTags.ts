/**
 * The tags a note can be given from the Tags menu. A tag is only made when it can do something a
 * folder cannot (see docs/DECISIONS.md); a new one is one more entry here. The names are the words
 * written in the note's properties (`tags: [meeting]`).
 */
export interface NoteTag {
  tag: string;
  label: string;
  /** What it does, shown in the menu. */
  does: string;
}

export const NOTE_TAGS: readonly NoteTag[] = [
  {
    tag: "meeting",
    label: "Meeting",
    does: "Start meeting shows, and the agenda is not read as tasks.",
  },
  {
    tag: "epic",
    label: "Epic",
    does: "Its tasks are listed with your epics in Tasks.",
  },
];
