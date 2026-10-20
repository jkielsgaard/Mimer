import { ChevronLeft, ChevronRight } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { SidebarSection } from "@/features/fileTree/SidebarSection";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api";
import { monthGrid, monthTitle, sameDayLastMonth } from "@/lib/calendar";
import { shortDate, todayIso } from "@/lib/taskLogic";
import { cn } from "@/lib/utils";
import { useVaultStore } from "@/stores/vaultStore";

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

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
  const [shown, setShown] = useState(() => {
    const [y, m] = today.split("-").map(Number);
    return { year: y ?? 1970, month: (m ?? 1) - 1 };
  });
  const weeks = useMemo(() => monthGrid(shown.year, shown.month), [shown]);
  const step = (n: number): void => {
    const d = new Date(shown.year, shown.month + n, 1);
    setShown({ year: d.getFullYear(), month: d.getMonth() });
  };
  const open = (iso: string): void => {
    void useVaultStore.getState().openDailyNote(iso);
  };
  const lastMonth = sameDayLastMonth(today);

  return (
    <SidebarSection title="Daily notes" storageKey="daily">
      <div className="px-2 pb-2">
        <div className="mb-1 flex items-center">
          <Button
            size="icon"
            variant="ghost"
            className="size-7"
            aria-label="Previous month"
            onClick={() => {
              step(-1);
            }}
          >
            <ChevronLeft />
          </Button>
          <span className="flex-1 text-center text-xs font-semibold">
            {monthTitle(shown.year, shown.month)}
          </span>
          <Button
            size="icon"
            variant="ghost"
            className="size-7"
            aria-label="Next month"
            onClick={() => {
              step(1);
            }}
          >
            <ChevronRight />
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="ml-1 h-7"
            onClick={() => {
              const [y, m] = today.split("-").map(Number);
              setShown({ year: y ?? 1970, month: (m ?? 1) - 1 });
              open(today);
            }}
          >
            Today
          </Button>
        </div>
        <div
          role="grid"
          aria-label={monthTitle(shown.year, shown.month)}
          className="flex flex-col gap-0.5"
        >
          <div
            role="row"
            className="grid grid-cols-7 text-center text-[10px] text-muted-foreground"
          >
            {WEEKDAYS.map((d) => (
              <span key={d} role="columnheader">
                {d}
              </span>
            ))}
          </div>
          {weeks.map((week) => (
            <div key={week[0]?.iso} role="row" className="grid grid-cols-7 gap-0.5">
              {week.map((d) => (
                <button
                  key={d.iso}
                  type="button"
                  role="gridcell"
                  aria-label={`${shortDate(d.iso)}${dates.has(d.iso) ? ", has a note" : ""}`}
                  aria-current={d.iso === today ? "date" : undefined}
                  className={cn(
                    "flex h-8 flex-col items-center justify-center gap-0.5 rounded-md text-xs hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring",
                    !d.inMonth && "text-muted-foreground/60",
                    d.iso === today && "bg-primary text-primary-foreground hover:bg-primary",
                  )}
                  onClick={() => {
                    open(d.iso);
                  }}
                >
                  {d.day}
                  <span
                    aria-hidden
                    className={cn(
                      "size-1 rounded-full",
                      dates.has(d.iso)
                        ? d.iso === today
                          ? "bg-primary-foreground"
                          : "bg-primary"
                        : "bg-transparent",
                    )}
                  />
                </button>
              ))}
            </div>
          ))}
        </div>
        <p className="mt-1.5 text-[11px] text-muted-foreground">
          A dot means a note was written that day. Click a day to open it, or to make it.
        </p>
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
      </div>
    </SidebarSection>
  );
}
