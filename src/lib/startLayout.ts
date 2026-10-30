/** The widgets the start page can be built from. */
export type WidgetId =
  | "continue"
  | "recent"
  | "pinned"
  | "capture"
  | "search"
  | "nextMeeting"
  | "workingOn"
  | "inbox"
  | "areas"
  | "changed"
  | "epics";

export interface WidgetInfo {
  id: WidgetId;
  title: string;
  /** One line in the list of widgets. */
  does: string;
}

export const WIDGETS: readonly WidgetInfo[] = [
  {
    id: "continue",
    title: "Continue",
    does: "The last note, with its first lines and an Open button.",
  },
  {
    id: "recent",
    title: "Recent",
    does: "The notes you opened lately, with filters for notes, meetings and epics.",
  },
  { id: "pinned", title: "Pinned", does: "The notes you pinned." },
  { id: "capture", title: "Write it down", does: "Save a thought as a note, a task or an idea." },
  { id: "search", title: "Search and ask", does: "A search box. Ask AI shows when an AI is on." },
  {
    id: "nextMeeting",
    title: "Next meeting",
    does: "Today's and tomorrow's meetings, each with a Start button.",
  },
  {
    id: "workingOn",
    title: "Working on",
    does: "Tasks with the status Doing or Waiting, across your epics.",
  },
  { id: "inbox", title: "To sort", does: "Quick notes and open ideas that are not sorted yet." },
  { id: "areas", title: "Areas", does: "Tasks, Meetings, Notes and Ideas with a number on each." },
  { id: "changed", title: "Changed since yesterday", does: "Notes changed since yesterday." },
  { id: "epics", title: "Epic progress", does: "Your open epics and how far each has come." },
];

/** One widget on the page: `wide` takes the whole width, otherwise half. */
export interface Placed {
  id: WidgetId;
  wide: boolean;
}

/** The page as it is before anything is changed. */
export const DEFAULT_LAYOUT: readonly Placed[] = [
  { id: "continue", wide: true },
  { id: "recent", wide: false },
  { id: "pinned", wide: false },
];

const KEY = "mimer.startLayout";
const IDS = new Set<string>(WIDGETS.map((w) => w.id));

/** The saved layout, read safely: unknown or repeated widgets are left out. Null when unusable. */
export function parseLayout(raw: unknown): Placed[] | null {
  if (!Array.isArray(raw)) return null;
  const seen = new Set<string>();
  const out: Placed[] = [];
  for (const item of raw as unknown[]) {
    if (typeof item !== "object" || item === null) continue;
    const { id, wide } = item as { id?: unknown; wide?: unknown };
    if (typeof id !== "string" || !IDS.has(id) || seen.has(id)) continue;
    seen.add(id);
    out.push({ id: id as WidgetId, wide: wide === true });
  }
  return out;
}

/** The layout saved on this computer, or the default. */
export function loadLayout(): Placed[] {
  try {
    const raw = localStorage.getItem(KEY);
    const parsed = raw === null ? null : parseLayout(JSON.parse(raw));
    return parsed ?? DEFAULT_LAYOUT.map((p) => ({ ...p }));
  } catch {
    return DEFAULT_LAYOUT.map((p) => ({ ...p }));
  }
}

export function saveLayout(layout: readonly Placed[]): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(layout));
  } catch {
    /* the layout is just not remembered */
  }
}

/** The layout with a widget added at the end (once). */
export function withWidget(layout: readonly Placed[], id: WidgetId): Placed[] {
  return layout.some((p) => p.id === id) ? [...layout] : [...layout, { id, wide: false }];
}

export function withoutWidget(layout: readonly Placed[], id: WidgetId): Placed[] {
  return layout.filter((p) => p.id !== id);
}

/** The layout with a widget moved one place up or down. */
export function withMoved(layout: readonly Placed[], id: WidgetId, up: boolean): Placed[] {
  const out = [...layout];
  const at = out.findIndex((p) => p.id === id);
  const to = up ? at - 1 : at + 1;
  if (at === -1 || to < 0 || to >= out.length) return out;
  const [item] = out.splice(at, 1);
  if (item) out.splice(to, 0, item);
  return out;
}

export function withWide(layout: readonly Placed[], id: WidgetId, wide: boolean): Placed[] {
  return layout.map((p) => (p.id === id ? { ...p, wide } : p));
}
