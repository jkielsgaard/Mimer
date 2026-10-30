import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { meetingMoment, todayAndTomorrow, type Meeting } from "@/lib/meeting";
import { formatTime, type TimeFormat } from "@/lib/timeFormat";
import { openFile } from "@/lib/actions";
import { useMeetingStore } from "@/stores/meetingStore";
import { useUiStore } from "@/stores/uiStore";
import { useMeetingsLoaded } from "./useMeetings";
import { PlainButton } from "@/components/ui/plain-button";

/** How long a meeting stays on the line after it has started. */
const STAYS_MS = 2 * 60 * 60 * 1000;

export interface PlannedMeeting {
  path: string;
  meeting: Meeting;
}

/** The meetings still to come, or started less than two hours ago, in the order they happen. */
export function comingMeetings(list: PlannedMeeting[], now: Date): PlannedMeeting[] {
  const from = now.getTime() - STAYS_MS;
  return list
    .map((p) => ({ p, at: meetingMoment(p.meeting) }))
    .filter((x): x is { p: PlannedMeeting; at: number } => x.at !== null && x.at >= from)
    .sort((a, b) => a.at - b.at)
    .map((x) => x.p);
}

/** `14:00`, `Today` or `Tomorrow 11:00`. */
function when(m: Meeting, now: Date, format: TimeFormat): string {
  const today = todayAndTomorrow(now)[0];
  const day = m.date === today ? "" : "Tomorrow";
  const time = m.time === null ? (m.date === today ? "Today" : "") : formatTime(m.time, format);
  return [day, time].filter((x) => x !== "").join(" ");
}

/**
 * One line at the top of Landing: the next meeting, with a Start button. "+2" shows the others.
 * Nothing is shown when no meeting is today or tomorrow.
 */
export function MeetingLine() {
  const meetings = useMeetingStore((s) => s.meetings);
  const format = useUiStore((s) => s.timeFormat);
  const [more, setMore] = useState(false);
  const [now, setNow] = useState(() => new Date());
  useMeetingsLoaded();

  // The clock moves on: what is "next" changes without anything else changing.
  useEffect(() => {
    const id = setInterval(() => {
      setNow(new Date());
    }, 60_000);
    return () => {
      clearInterval(id);
    };
  }, []);

  // Today's and tomorrow's meetings, wherever their notes are: the tag makes a note a meeting.
  const planned = useMemo<PlannedMeeting[]>(() => {
    const days = todayAndTomorrow(now);
    return meetings
      .filter((m) => m.meeting.date !== null && days.includes(m.meeting.date))
      .map((m) => ({ path: m.path, meeting: m.meeting }));
  }, [meetings, now]);

  const coming = useMemo(() => comingMeetings(planned, now), [planned, now]);
  const first = coming[0];
  if (!first) return null;
  const others = coming.slice(1);

  const row = (p: PlannedMeeting, strong: boolean) => (
    <li key={p.path} className="flex items-center gap-2 rounded px-2 py-1 hover:bg-muted">
      <span className="w-16 shrink-0 text-xs text-muted-foreground">
        {when(p.meeting, now, format)}
      </span>
      <PlainButton
        type="button"
        title={`Open ${p.meeting.title}`}
        className={`min-w-0 flex-1 truncate text-left text-[13px] ${strong ? "font-semibold" : ""}`}
        onClick={() => {
          void openFile(p.path);
        }}
      >
        {p.meeting.title}
      </PlainButton>
      {strong && others.length > 0 && (
        <PlainButton
          type="button"
          aria-expanded={more}
          aria-label={`${String(others.length)} more meetings`}
          className="rounded-full bg-accent px-1.5 text-[11px] font-semibold text-accent-foreground"
          onClick={() => {
            setMore(!more);
          }}
        >
          +{others.length}
        </PlainButton>
      )}
      <Button
        size="sm"
        className="h-6 px-2 text-xs"
        aria-label={`Start ${p.meeting.title}`}
        onClick={() => {
          useUiStore.getState().setMeetingFocus(p.path);
        }}
      >
        Start
      </Button>
    </li>
  );

  return (
    <ul aria-label="Next meeting" className="px-1 pb-1">
      {row(first, true)}
      {more && others.map((p) => row(p, false))}
    </ul>
  );
}
