import { Plus, X } from "lucide-react";
import { useMemo, useState } from "react";
import { MonthCalendar } from "@/components/MonthCalendar";
import { PanelHeader } from "@/components/PanelHeader";
import { Button } from "@/components/ui/button";
import {
  groupMeetings,
  meetingDays,
  meetingsOn,
  whenLabel,
  type MeetingNote,
} from "@/lib/meetingList";
import { shortDate, todayIso } from "@/lib/taskLogic";
import { cn } from "@/lib/utils";
import { useMeetingStore } from "@/stores/meetingStore";
import { useMeetingsLoaded, useShownMeeting } from "./useMeetings";
import { useUiStore } from "@/stores/uiStore";

/** How many past meetings are listed before "Show more". */
const PAST_SHOWN = 10;

function MeetingRow({ m, today, shown }: { m: MeetingNote; today: string; shown: boolean }) {
  const format = useUiStore((s) => s.timeFormat);
  return (
    <li>
      <button
        type="button"
        aria-current={shown}
        title={m.path}
        className={cn(
          "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring",
          shown && "bg-accent text-accent-foreground",
        )}
        onClick={() => {
          useMeetingStore.getState().select(m.path);
          useUiStore.getState().setCenterView("meetings");
        }}
      >
        <span className="w-16 shrink-0 text-xs text-muted-foreground tabular-nums">
          {whenLabel(m.meeting, today, format)}
        </span>
        <span className="min-w-0 flex-1 truncate">{m.meeting.title}</span>
      </button>
    </li>
  );
}

/**
 * The left panel of the Meetings area: a calendar with a dot on the days that have a meeting, then
 * today (the daily note and the day's meetings), the ones to come and the ones that are over. A
 * click on a day shows only that day. A click on a meeting opens it in the middle.
 */
export function MeetingsPanel() {
  const meetings = useMeetingStore((s) => s.meetings);
  const loaded = useMeetingStore((s) => s.loaded);
  const day = useMeetingStore((s) => s.day);
  const centerView = useUiStore((s) => s.centerView);
  const shownMeeting = useShownMeeting();
  const [allPast, setAllPast] = useState(false);
  useMeetingsLoaded();

  const today = todayIso();
  const groups = useMemo(() => groupMeetings(meetings, today), [meetings, today]);
  const days = useMemo(() => meetingDays(meetings), [meetings]);
  const shown = centerView === "meetings" ? shownMeeting?.path : undefined;

  const rows = (list: MeetingNote[]) =>
    list.map((m) => <MeetingRow key={m.path} m={m} today={today} shown={shown === m.path} />);
  const heading = (text: string, extra?: React.ReactNode) => (
    <div className="flex items-center px-2 pb-1 pt-3">
      <h3 className="section-label flex-1">{text}</h3>
      {extra}
    </div>
  );
  const past = allPast ? groups.past : groups.past.slice(0, PAST_SHOWN);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <PanelHeader title="Meetings">
        <Button
          size="sm"
          variant="outline"
          onClick={() => {
            useUiStore.getState().setMeetingFormOpen(true);
          }}
        >
          <Plus /> New
        </Button>
      </PanelHeader>
      <div className="min-h-0 flex-1 overflow-auto pb-3 pt-2">
        <MonthCalendar
          dots={days}
          dotLabel="has a meeting"
          selected={day}
          todayTitle="Show today"
          onPick={(iso) => {
            useMeetingStore.getState().setDay(iso === todayIso() ? null : iso);
          }}
        />
        <div className="px-2">
          {day !== null ? (
            <>
              {heading(
                shortDate(day),
                <Button
                  size="icon"
                  variant="ghost"
                  className="size-6"
                  aria-label="Show every day again"
                  onClick={() => {
                    useMeetingStore.getState().setDay(null);
                  }}
                >
                  <X />
                </Button>,
              )}
              <ul>{rows(meetingsOn(meetings, day))}</ul>
              {meetingsOn(meetings, day).length === 0 && (
                <p className="px-2 py-2 text-xs text-muted-foreground">No meetings that day.</p>
              )}
            </>
          ) : (
            <>
              {heading("Today")}
              <ul>{rows(groups.today)}</ul>
              {loaded && groups.today.length === 0 && (
                <p className="px-2 py-1 text-xs text-muted-foreground">No meetings today.</p>
              )}
              {groups.upcoming.length > 0 && (
                <>
                  {heading("Upcoming")}
                  <ul>{rows(groups.upcoming)}</ul>
                </>
              )}
              {groups.past.length > 0 && (
                <>
                  {heading("Past")}
                  <ul className="text-muted-foreground">{rows(past)}</ul>
                  {groups.past.length > PAST_SHOWN && (
                    <button
                      type="button"
                      className="w-full rounded-md px-2 py-1 text-left text-xs text-muted-foreground hover:bg-muted"
                      onClick={() => {
                        setAllPast(!allPast);
                      }}
                    >
                      {allPast ? "Show fewer" : `Show all ${String(groups.past.length)}`}
                    </button>
                  )}
                </>
              )}
              {groups.undated.length > 0 && (
                <>
                  {heading("No date")}
                  <ul>{rows(groups.undated)}</ul>
                </>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
