import type { NoteContent } from "@/bindings/NoteContent";
import { GENERAL, itemNotes, meetingMoment, parseMeeting, type Meeting } from "./meeting";
import { shortDate } from "./taskLogic";
import { formatTime, type TimeFormat } from "./timeFormat";

/** A note tagged `meeting`, read: what the Meetings area lists. */
export interface MeetingNote {
  path: string;
  meeting: Meeting;
  content: string;
}

export interface MeetingGroups {
  today: MeetingNote[];
  /** From tomorrow on, the nearest first. */
  upcoming: MeetingNote[];
  /** Before today, the latest first. */
  past: MeetingNote[];
  /** Meetings that were never given a date. */
  undated: MeetingNote[];
}

/** The tagged notes as meetings. */
export function toMeetingNotes(notes: readonly NoteContent[]): MeetingNote[] {
  return notes.map((n) => ({ path: n.path, content: n.content, meeting: parseMeeting(n.content) }));
}

/** Time of day, then title: the order of the meetings on one day. */
function sameDay(a: MeetingNote, b: MeetingNote): number {
  return (
    (a.meeting.time ?? "").localeCompare(b.meeting.time ?? "") ||
    a.meeting.title.localeCompare(b.meeting.title)
  );
}

/** Sorts the meetings into today, upcoming, past and undated. `today` is `YYYY-MM-DD`. */
export function groupMeetings(list: readonly MeetingNote[], today: string): MeetingGroups {
  const dated = (m: MeetingNote): string => m.meeting.date ?? "";
  const byDay = (a: MeetingNote, b: MeetingNote): number =>
    dated(a).localeCompare(dated(b)) || sameDay(a, b);
  return {
    today: list.filter((m) => m.meeting.date === today).sort(sameDay),
    upcoming: list.filter((m) => m.meeting.date !== null && m.meeting.date > today).sort(byDay),
    past: list
      .filter((m) => m.meeting.date !== null && m.meeting.date < today)
      .sort((a, b) => byDay(b, a)),
    undated: list
      .filter((m) => m.meeting.date === null)
      .sort((a, b) => a.meeting.title.localeCompare(b.meeting.title)),
  };
}

/** The days that have a meeting. */
export function meetingDays(list: readonly MeetingNote[]): Set<string> {
  return new Set(list.flatMap((m) => (m.meeting.date === null ? [] : [m.meeting.date])));
}

/** The meetings on one day, in the order they happen. */
export function meetingsOn(list: readonly MeetingNote[], iso: string): MeetingNote[] {
  return list.filter((m) => m.meeting.date === iso).sort(sameDay);
}

/** The meeting to show when none is chosen: today's first, else the next, else the latest. */
export function defaultMeeting(g: MeetingGroups, now: Date): MeetingNote | null {
  const at = now.getTime();
  const next = g.today.find((m) => (meetingMoment(m.meeting) ?? Infinity) >= at);
  return next ?? g.today[0] ?? g.upcoming[0] ?? g.past[0] ?? g.undated[0] ?? null;
}

/** `14:30` for a meeting today, `Thu 29 Oct` for another day, `No date` without one. */
export function whenLabel(m: Meeting, today: string, format: TimeFormat = "24"): string {
  if (m.date === null) return "No date";
  if (m.date === today) return m.time === null ? "Today" : formatTime(m.time, format);
  return shortDate(m.date);
}

/** What was written under the agenda items (and under Notes itself), the empty parts left out. */
export function meetingNotes(m: MeetingNote): { item: string; text: string }[] {
  return [GENERAL, ...m.meeting.agenda.map((a) => a.text)]
    .map((item) => ({ item, text: itemNotes(m.content, item) }))
    .filter((n) => n.text !== "");
}
