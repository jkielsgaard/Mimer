import { useEffect, useState } from "react";
import { SidebarSection } from "@/features/fileTree/SidebarSection";
import { MonthCalendar } from "@/components/MonthCalendar";
import { api } from "@/lib/api";
import { sameDayLastMonth } from "@/lib/calendar";
import { InfoHint } from "@/components/InfoHint";
import { shortDate, todayIso } from "@/lib/taskLogic";
import { useVaultStore } from "@/stores/vaultStore";

/** The dates that have a daily note, read again when the files change. */
export function useDailyDates(): Set<string> {
  const files = useVaultStore((s) => s.files);
  const [dates, setDates] = useState<Set<string>>(new Set());
  useEffect(() => {
    let alive = true;
    api
      .listDailyDates()
      .then((d) => {
        if (alive) setDates(new Set(d));
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [files]);
  return dates;
}

/**
 * The daily notes as a calendar at the top of the Files panel: a dot on every day that has a note.
 * Click a day to open its note, or to make it when there is none yet. The notes themselves are not
 * listed in the file tree; this is the way to them.
 */
export function CalendarSection() {
  const today = todayIso();
  const dates = useDailyDates();
  const open = (iso: string): void => {
    void useVaultStore.getState().openDailyNote(iso);
  };
  const lastMonth = sameDayLastMonth(today);
  return (
    <SidebarSection
      title="Daily notes"
      storageKey="daily"
      hint={
        <InfoHint
          label="Daily notes"
          text="A dot means a note was written that day. Click a day to open it, or to make it."
          topic="start"
        />
      }
    >
      <MonthCalendar dots={dates} dotLabel="has a note" onPick={open} todayTitle="Today's note">
        {dates.has(lastMonth) && (
          <button
            type="button"
            className="mt-1 w-full rounded-md px-2 py-1 text-left text-xs hover:bg-muted"
            onClick={() => {
              open(lastMonth);
            }}
          >
            This day last month: {shortDate(lastMonth)}
          </button>
        )}
      </MonthCalendar>
    </SidebarSection>
  );
}
