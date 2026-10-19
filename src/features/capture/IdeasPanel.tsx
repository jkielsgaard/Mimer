import { StickyNote } from "lucide-react";
import { PanelHeader } from "@/components/PanelHeader";
import { useEffect, useMemo, useState } from "react";
import { Input } from "@/components/ui/input";
import { shortDate, todayIso } from "@/lib/taskLogic";
import { cn } from "@/lib/utils";
import { useIdeaStore, type IdeaFilter } from "@/stores/ideaStore";
import { useUiStore } from "@/stores/uiStore";

const FILTERS: { id: IdeaFilter; label: string }[] = [
  { id: "open", label: "Open" },
  { id: "used", label: "Used" },
  { id: "archived", label: "Archived" },
];

/**
 * The left panel of the Ideas area: write an idea, choose open, used or archived ideas and pick
 * one. The picked idea is opened in the middle, where it can be read, changed and turned into
 * something.
 */
export function IdeasPanel() {
  const ideas = useIdeaStore((s) => s.ideas);
  const loaded = useIdeaStore((s) => s.loaded);
  const filter = useIdeaStore((s) => s.filter);
  const selected = useIdeaStore((s) => s.selectedLine);
  const [draft, setDraft] = useState("");
  const today = todayIso();

  useEffect(() => {
    void useIdeaStore.getState().load();
  }, []);

  const shown = useMemo(
    () =>
      ideas.filter((i) =>
        filter === "open" ? i.status === null : i.status === (filter as string),
      ),
    [ideas, filter],
  );
  const count = (f: IdeaFilter): number =>
    ideas.filter((i) => (f === "open" ? i.status === null : i.status === (f as string))).length;

  return (
    <div className="flex h-full min-h-0 flex-col">
      <PanelHeader title="Ideas" />
      <form
        className="px-3 pt-2"
        onSubmit={(e) => {
          e.preventDefault();
          const text = draft.trim();
          if (text === "") return;
          setDraft("");
          void useIdeaStore.getState().add(text, "", true);
        }}
      >
        <Input
          aria-label="Write an idea here"
          className="h-9"
          placeholder="Write an idea…"
          value={draft}
          onChange={(e) => {
            setDraft(e.target.value);
          }}
        />
      </form>
      <div
        role="group"
        aria-label="Show ideas"
        className="mx-3 mt-2 flex overflow-hidden rounded-md border text-xs"
      >
        {FILTERS.map((f, i) => (
          <button
            key={f.id}
            type="button"
            aria-pressed={filter === f.id}
            className={cn(
              "flex-1 px-2 py-1.5 focus-visible:ring-2 focus-visible:ring-ring",
              i > 0 && "border-l",
              filter === f.id ? "bg-accent text-accent-foreground" : "hover:bg-muted",
            )}
            onClick={() => {
              useIdeaStore.getState().setFilter(f.id);
            }}
          >
            {f.label} {count(f.id)}
          </button>
        ))}
      </div>
      <div className="min-h-0 flex-1 overflow-auto px-2 pb-3 pt-2">
        {loaded && shown.length === 0 && (
          <p className="px-2 py-3 text-xs text-muted-foreground">
            {filter === "open" ? "No open ideas. Write one above." : "Nothing here yet."}
          </p>
        )}
        <ul>
          {shown.map((i) => (
            <li key={i.line}>
              <button
                type="button"
                aria-current={selected === i.line}
                className={cn(
                  "flex w-full flex-col rounded-md px-2 py-1.5 text-left hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring",
                  selected === i.line && "bg-accent text-accent-foreground",
                )}
                onClick={() => {
                  useIdeaStore.getState().select(i.line);
                  useUiStore.getState().setCenterView("ideas");
                }}
              >
                <span className="flex items-center gap-1 text-sm font-medium">
                  <span className="truncate">{i.text}</span>
                  {i.note !== "" && (
                    <StickyNote
                      className="size-3 shrink-0 text-muted-foreground"
                      aria-label="Has a note"
                    />
                  )}
                </span>
                <span className="text-[11px] text-muted-foreground">
                  {i.date === today ? "Today" : shortDate(i.date)}
                  {i.tags.map((t) => ` · #${t}`).join("")}
                </span>
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
