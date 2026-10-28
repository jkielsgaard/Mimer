import { ChevronDown, Plus, Search, SlidersHorizontal, X } from "lucide-react";
import { useState, type ReactNode } from "react";
import { MoveButtons } from "@/components/MoveButtons";
import { ViewHeader } from "@/components/ViewHeader";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { newNoteInCurrentFolder } from "@/lib/actions";
import { WIDGETS, type WidgetId } from "@/lib/startLayout";
import { useNarrow } from "@/lib/useNarrow";
import { cn } from "@/lib/utils";
import { useStartStore } from "@/stores/startStore";
import { useUiStore } from "@/stores/uiStore";
import { usePinned, usePinnedLoaded, useRecentNotes } from "./useStartData";
import {
  AreasWidget,
  CaptureWidget,
  ChangedWidget,
  ContinueWidget,
  EpicsWidget,
  InboxWidget,
  NextMeetingWidget,
  PinnedWidget,
  RecentWidget,
  SearchWidget,
  TodayMeetingsWidget,
  useWidgetData,
  WorkingOnWidget,
} from "./widgets";

/** Below this width the page is one column. */
const NARROW = 640;

function renderWidget(id: WidgetId, narrow: boolean): ReactNode {
  switch (id) {
    case "continue":
      return <ContinueWidget />;
    case "recent":
      return <RecentWidget narrow={narrow} />;
    case "pinned":
      return <PinnedWidget />;
    case "capture":
      return <CaptureWidget />;
    case "search":
      return <SearchWidget />;
    case "nextMeeting":
      return <NextMeetingWidget />;
    case "todayMeetings":
      return <TodayMeetingsWidget />;
    case "workingOn":
      return <WorkingOnWidget />;
    case "inbox":
      return <InboxWidget />;
    case "areas":
      return <AreasWidget />;
    case "changed":
      return <ChangedWidget />;
    case "epics":
      return <EpicsWidget />;
  }
}

/** "New": what to make, not only a note. The same choices as File → New in the top bar. */
function NewMenu() {
  const item = (label: string, run: () => void) => (
    <DropdownMenuItem key={label} onSelect={run}>
      {label}
    </DropdownMenuItem>
  );
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button size="sm">
          <Plus /> New <ChevronDown />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-52">
        {item("Note", newNoteInCurrentFolder)}
        {item("Meeting", () => {
          useUiStore.getState().setMeetingFormOpen(true);
        })}
        {item("Quick note", () => {
          useUiStore.getState().openCapture("note");
        })}
        {item("Task", () => {
          useUiStore.getState().openCapture("task");
        })}
        {item("Idea", () => {
          useUiStore.getState().openCapture("idea");
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/** The list of widgets that are not on the page yet. */
function AddWidgetDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const layout = useStartStore((s) => s.layout);
  const left = WIDGETS.filter((w) => !layout.some((p) => p.id === w.id));
  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) onClose();
      }}
    >
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Add a widget</DialogTitle>
          <DialogDescription>
            A widget shows part of your own notes. It is added at the end; move it where you want
            it.
          </DialogDescription>
        </DialogHeader>
        {left.length === 0 ? (
          <p className="text-sm text-muted-foreground">Every widget is on the page already.</p>
        ) : (
          <ul className="flex max-h-96 flex-col gap-1 overflow-auto">
            {left.map((w) => (
              <li
                key={w.id}
                className="flex items-center gap-3 rounded-md px-2 py-2 hover:bg-muted"
              >
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="text-sm font-semibold">{w.title}</span>
                  <span className="text-xs text-muted-foreground">{w.does}</span>
                </span>
                <Button
                  size="sm"
                  variant="outline"
                  aria-label={`Add ${w.title}`}
                  onClick={() => {
                    useStartStore.getState().add(w.id);
                  }}
                >
                  <Plus /> Add
                </Button>
              </li>
            ))}
          </ul>
        )}
        <DialogFooter>
          <Button onClick={onClose}>Done</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/**
 * The start page: widgets you choose and arrange yourself. The page you get at first is Continue,
 * Recent and Pinned. All of it comes from your own notes, so it works without AI and without a
 * calendar. It shows when no note is open, and from the house icon at the left edge.
 */
export function StartPage() {
  const layout = useStartStore((s) => s.layout);
  const editing = useStartStore((s) => s.editing);
  const { notes } = useRecentNotes();
  const { paths: pinned } = usePinned();
  usePinnedLoaded();
  const { ref, narrow } = useNarrow<HTMLDivElement>(NARROW);
  const [adding, setAdding] = useState(false);
  useWidgetData();

  const empty = notes.length === 0 && pinned.length === 0;
  const store = useStartStore.getState();

  return (
    <section aria-label="Start" className="flex h-full min-h-0 flex-col bg-background">
      <ViewHeader title={empty ? "Welcome to Mimer" : "Welcome back"}>
        {editing ? (
          <>
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                setAdding(true);
              }}
            >
              <Plus /> Add widget
            </Button>
            <Button size="sm" variant="outline" onClick={store.reset}>
              Reset
            </Button>
            <Button
              size="sm"
              onClick={() => {
                store.setEditing(false);
              }}
            >
              Done
            </Button>
          </>
        ) : (
          <>
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                useUiStore.getState().setQuickOpen(true);
              }}
            >
              <Search /> Search…
            </Button>
            <NewMenu />
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                store.setEditing(true);
              }}
            >
              <SlidersHorizontal /> Customize
            </Button>
          </>
        )}
      </ViewHeader>
      <div ref={ref} className="min-h-0 flex-1 overflow-auto px-5 py-5">
        <div className="mx-auto flex max-w-4xl flex-col gap-6">
          {empty && (
            <div className="flex flex-col items-start gap-3">
              <p className="text-sm text-muted-foreground">
                Nothing here yet. Start with one of these. Your notes will be listed here as you
                write them: the last one you worked on, the recent ones and the ones you pin.
              </p>
              <div className="flex flex-wrap gap-2">
                <Button onClick={newNoteInCurrentFolder}>New note</Button>
                <Button
                  variant="outline"
                  onClick={() => {
                    useUiStore.getState().setMeetingFormOpen(true);
                  }}
                >
                  New meeting
                </Button>
                <Button
                  variant="outline"
                  onClick={() => {
                    useUiStore.getState().setVaultSwitcherOpen(true);
                  }}
                >
                  Open a folder
                </Button>
              </div>
            </div>
          )}
          {editing && (
            <p className="rounded-md border border-dashed border-primary/60 px-3 py-2 text-xs text-muted-foreground">
              The widgets are placed from left to right, then down. The arrows on a widget move it
              one place earlier or later; <b>Half</b> and <b>Full</b> set its width.
            </p>
          )}
          {layout.length === 0 && (
            <p className="py-6 text-sm text-muted-foreground">
              The page is empty. Press <b>Customize</b>, then <b>Add widget</b>, or <b>Reset</b>.
            </p>
          )}
          <div className={cn("grid items-start gap-4", narrow ? "grid-cols-1" : "grid-cols-2")}>
            {layout.map((p, i) => {
              const info = WIDGETS.find((w) => w.id === p.id);
              const title = info?.title ?? p.id;
              return (
                <section
                  key={p.id}
                  aria-label={title}
                  className={cn(
                    "flex flex-col gap-2 rounded-xl border bg-card p-4",
                    p.wide && !narrow && "col-span-2",
                    editing && "border-dashed border-primary/60 bg-accent/30",
                  )}
                >
                  <div className="flex items-center gap-2">
                    <h3 className="section-label flex-1">{title}</h3>
                    {editing && (
                      <>
                        <MoveButtons
                          label={title}
                          always
                          canUp={i > 0}
                          canDown={i < layout.length - 1}
                          onUp={() => {
                            store.move(p.id, true);
                          }}
                          onDown={() => {
                            store.move(p.id, false);
                          }}
                        />
                        <div
                          role="group"
                          aria-label={`Width of ${title}`}
                          className="flex overflow-hidden rounded-md border text-xs"
                        >
                          {[
                            { label: "Half", wide: false },
                            { label: "Full", wide: true },
                          ].map((o, n) => (
                            <button
                              key={o.label}
                              type="button"
                              aria-pressed={p.wide === o.wide}
                              className={cn(
                                "px-2 py-0.5 focus-visible:ring-2 focus-visible:ring-ring",
                                n > 0 && "border-l",
                                p.wide === o.wide
                                  ? "bg-accent text-accent-foreground"
                                  : "hover:bg-muted",
                              )}
                              onClick={() => {
                                store.setWide(p.id, o.wide);
                              }}
                            >
                              {o.label}
                            </button>
                          ))}
                        </div>
                        <Button
                          size="icon"
                          variant="ghost"
                          className="size-7"
                          aria-label={`Remove ${title}`}
                          onClick={() => {
                            store.remove(p.id);
                          }}
                        >
                          <X />
                        </Button>
                      </>
                    )}
                  </div>
                  {renderWidget(p.id, narrow)}
                </section>
              );
            })}
          </div>
        </div>
      </div>
      <AddWidgetDialog
        open={adding}
        onClose={() => {
          setAdding(false);
        }}
      />
    </section>
  );
}
