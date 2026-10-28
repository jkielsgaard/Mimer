import { CalendarCheck, ChevronLeft, ChevronRight } from "lucide-react";
import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { monthGrid, monthTitle, shortMonthTitle } from "@/lib/calendar";
import { useNarrow } from "@/lib/useNarrow";
import { shortDate, todayIso } from "@/lib/taskLogic";
import { cn } from "@/lib/utils";

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

/** Below this width the weekdays are one letter and the month is short, so nothing runs together. */
const NARROW = 230;

/**
 * A month to pick a day from, with a dot on the days in `dots`. Used for the daily notes (Files)
 * and for the meetings (Meetings): the day that is picked is handed to `onPick`.
 */
export function MonthCalendar({
  dots,
  dotLabel,
  onPick,
  selected,
  todayTitle = "Today",
  children,
}: {
  dots: ReadonlySet<string>;
  /** What a dot means, read out for a day that has one ("has a note"). */
  dotLabel: string;
  onPick: (iso: string) => void;
  /** The day that is chosen, if the page keeps one. */
  selected?: string | null;
  /** The tooltip of the Today button. */
  todayTitle?: string;
  /** Shown under the grid. */
  children?: React.ReactNode;
}) {
  const today = todayIso();
  const [shown, setShown] = useState(() => {
    const [y, m] = today.split("-").map(Number);
    return { year: y ?? 1970, month: (m ?? 1) - 1 };
  });
  const weeks = useMemo(() => monthGrid(shown.year, shown.month), [shown]);
  const step = (n: number): void => {
    const d = new Date(shown.year, shown.month + n, 1);
    setShown({ year: d.getFullYear(), month: d.getMonth() });
  };
  const { ref, narrow } = useNarrow<HTMLDivElement>(NARROW);
  return (
    <div ref={ref} className="px-2 pb-2">
      <div className="mb-1 flex items-center">
        <Button
          size="icon"
          variant="ghost"
          className={narrow ? "size-6" : "size-7"}
          aria-label="Previous month"
          onClick={() => {
            step(-1);
          }}
        >
          <ChevronLeft />
        </Button>
        <span
          className={cn(
            "min-w-0 flex-1 truncate text-center font-semibold",
            narrow ? "text-[11px]" : "text-xs",
          )}
        >
          {narrow ? shortMonthTitle(shown.year, shown.month) : monthTitle(shown.year, shown.month)}
        </span>
        <Button
          size="icon"
          variant="ghost"
          className={narrow ? "size-6" : "size-7"}
          aria-label="Next month"
          onClick={() => {
            step(1);
          }}
        >
          <ChevronRight />
        </Button>
        <Button
          size={narrow ? "icon" : "sm"}
          variant="outline"
          className={narrow ? "ml-0.5 size-6" : "ml-1 h-7"}
          aria-label="Today"
          title={todayTitle}
          onClick={() => {
            const [y, m] = today.split("-").map(Number);
            setShown({ year: y ?? 1970, month: (m ?? 1) - 1 });
            onPick(today);
          }}
        >
          {narrow ? <CalendarCheck /> : "Today"}
        </Button>
      </div>
      <div
        role="grid"
        aria-label={monthTitle(shown.year, shown.month)}
        className="flex flex-col gap-0.5"
      >
        <div role="row" className="grid grid-cols-7 text-center text-[10px] text-muted-foreground">
          {WEEKDAYS.map((d) => (
            <span key={d} role="columnheader" aria-label={d}>
              {narrow ? d.slice(0, 1) : d}
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
                aria-label={`${shortDate(d.iso)}${dots.has(d.iso) ? `, ${dotLabel}` : ""}`}
                aria-current={d.iso === today ? "date" : undefined}
                className={cn(
                  "flex h-8 flex-col items-center justify-center gap-0.5 rounded-md text-xs hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring",
                  !d.inMonth && "text-muted-foreground/60",
                  d.iso === today && "bg-primary text-primary-foreground hover:bg-primary",
                  d.iso === selected && d.iso !== today && "bg-accent text-accent-foreground",
                )}
                onClick={() => {
                  onPick(d.iso);
                }}
              >
                {d.day}
                <span
                  aria-hidden
                  className={cn(
                    "size-1 rounded-full",
                    dots.has(d.iso)
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
      {children}
    </div>
  );
}
