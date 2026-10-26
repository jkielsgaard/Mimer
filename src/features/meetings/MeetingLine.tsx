import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api";
import { meetingMoment, parseMeeting, todayAndTomorrow, type Meeting } from "@/lib/meeting";
import { openFile } from "@/lib/actions";
import type { TreeNode } from "@/bindings/TreeNode";
import { useUiStore } from "@/stores/uiStore";
import { useVaultStore } from "@/stores/vaultStore";

/** How long a meeting stays on the line after it has started. */
const STAYS_MS = 2 * 60 * 60 * 1000;

export interface PlannedMeeting {
  path: string;
  meeting: Meeting;
}

/** The folder `path` in the tree, however deep it is. */
function findDir(nodes: TreeNode[], path: string): TreeNode | null {
  for (const n of nodes) {
    if (!n.isDir) continue;
    if (n.path === path) return n;
    if (path.startsWith(`${n.path}/`)) return findDir(n.children, path);
  }
  return null;
}

/** The notes in the meetings folder whose name starts with today's or tomorrow's date. */
export function candidatesIn(tree: TreeNode[], folder: string, now: Date): string[] {
  const days = todayAndTomorrow(now);
  const dir = folder === "" ? null : findDir(tree, folder.replace(/\/+$/, ""));
  return (dir?.children ?? [])
    .filter((n) => !n.isDir && days.some((d) => n.name.startsWith(`${d} `)))
    .map((n) => n.path);
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
function when(m: Meeting, now: Date): string {
  const today = todayAndTomorrow(now)[0];
  const day = m.date === today ? "" : "Tomorrow";
  return [day, m.time ?? (m.date === today ? "Today" : "")].filter((x) => x !== "").join(" ");
}

/**
 * One line at the top of Landing: the next meeting, with a Start button. "+2" shows the others.
 * Nothing is shown when no meeting is today or tomorrow.
 */
export function MeetingLine() {
  const tree = useVaultStore((s) => s.tree);
  const folder = useVaultStore((s) => s.vault?.config.meetingsFolder) ?? "";
  const [planned, setPlanned] = useState<PlannedMeeting[]>([]);
  const [more, setMore] = useState(false);
  const [now, setNow] = useState(() => new Date());

  const paths = useMemo(() => candidatesIn(tree, folder, now), [tree, folder, now]);
  const key = paths.join("\n");

  // The clock moves on: what is "next" changes without anything else changing.
  useEffect(() => {
    const id = setInterval(() => {
      setNow(new Date());
    }, 60_000);
    return () => {
      clearInterval(id);
    };
  }, []);

  useEffect(() => {
    let live = true;
    void Promise.all(
      key === ""
        ? []
        : key.split("\n").map((path) =>
            api
              .readNote(path)
              .then((n): PlannedMeeting => ({ path, meeting: parseMeeting(n.content) }))
              .catch(() => null),
          ),
    ).then((all) => {
      if (live) setPlanned(all.filter((x): x is PlannedMeeting => x !== null));
    });
    return () => {
      live = false;
    };
  }, [key]);

  const coming = useMemo(() => comingMeetings(planned, now), [planned, now]);
  const first = coming[0];
  if (!first) return null;
  const others = coming.slice(1);

  const row = (p: PlannedMeeting, strong: boolean) => (
    <li key={p.path} className="flex items-center gap-2 rounded px-2 py-1 hover:bg-muted">
      <span className="w-11 shrink-0 text-xs text-muted-foreground">{when(p.meeting, now)}</span>
      <button
        type="button"
        title={`Open ${p.meeting.title}`}
        className={`min-w-0 flex-1 truncate text-left text-[13px] ${strong ? "font-semibold" : ""}`}
        onClick={() => {
          void openFile(p.path);
        }}
      >
        {p.meeting.title}
      </button>
      {strong && others.length > 0 && (
        <button
          type="button"
          aria-expanded={more}
          aria-label={`${String(others.length)} more meetings`}
          className="rounded-full bg-accent px-1.5 text-[11px] font-semibold text-accent-foreground"
          onClick={() => {
            setMore(!more);
          }}
        >
          +{others.length}
        </button>
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
