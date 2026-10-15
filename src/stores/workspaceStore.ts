import { create } from "zustand";
import { isInside } from "@/lib/utils";

// Tabs and split view. The helpers are pure functions over `WorkspaceLayout` so the
// behaviour can be tested without React. The store wraps them.

export type PaneId = "primary" | "secondary";

export interface Pane {
  id: PaneId;
  /** Vault-relative note paths, in tab order. */
  tabs: string[];
  active: string | null;
}

export interface WorkspaceLayout {
  panes: Pane[];
  focused: PaneId;
}

export function emptyLayout(): WorkspaceLayout {
  return { panes: [{ id: "primary", tabs: [], active: null }], focused: "primary" };
}

function pane(layout: WorkspaceLayout, id: PaneId): Pane | undefined {
  return layout.panes.find((p) => p.id === id);
}

function mapPane(layout: WorkspaceLayout, id: PaneId, fn: (p: Pane) => Pane): WorkspaceLayout {
  return { ...layout, panes: layout.panes.map((p) => (p.id === id ? fn(p) : p)) };
}

function paneOf(layout: WorkspaceLayout, path: string): PaneId | null {
  for (const p of layout.panes) if (p.tabs.includes(path)) return p.id;
  return null;
}

/** Drops the secondary pane when it has no tabs left, and focuses the primary pane. */
function dropEmptySecondary(layout: WorkspaceLayout): WorkspaceLayout {
  const sec = pane(layout, "secondary");
  if (!sec || sec.tabs.length > 0) return layout;
  return {
    panes: layout.panes.filter((p) => p.id !== "secondary"),
    focused: "primary",
  };
}

function ensureSecondary(layout: WorkspaceLayout): WorkspaceLayout {
  if (pane(layout, "secondary")) return layout;
  return { ...layout, panes: [...layout.panes, { id: "secondary", tabs: [], active: null }] };
}

/** Removes `path` from a pane's tab list, choosing the neighbour as the new active tab. */
function removeTab(p: Pane, path: string): Pane {
  const idx = p.tabs.indexOf(path);
  if (idx < 0) return p;
  const tabs = p.tabs.filter((t) => t !== path);
  let active = p.active;
  if (p.active === path) {
    // Right neighbour first (same index after removal), then the left one, else nothing.
    active = tabs[idx] ?? tabs[idx - 1] ?? null;
  }
  return { ...p, tabs, active };
}

/**
 * Opens a note. If it is already open in any pane, that tab is focused instead (a note is
 * never open twice). Otherwise it is added to `to` (default: the focused pane).
 */
export function openPath(layout: WorkspaceLayout, path: string, to?: PaneId): WorkspaceLayout {
  const where = paneOf(layout, path);
  if (where !== null) {
    return { ...mapPane(layout, where, (p) => ({ ...p, active: path })), focused: where };
  }
  const target = to ?? layout.focused;
  const base = target === "secondary" ? ensureSecondary(layout) : layout;
  return {
    ...mapPane(base, target, (p) => ({ ...p, tabs: [...p.tabs, path], active: path })),
    focused: target,
  };
}

/** Closes a tab wherever it is. */
export function closePath(layout: WorkspaceLayout, path: string): WorkspaceLayout {
  const where = paneOf(layout, path);
  if (where === null) return layout;
  return dropEmptySecondary(mapPane(layout, where, (p) => removeTab(p, path)));
}

/** Makes a tab active in its pane and focuses that pane. */
export function activate(layout: WorkspaceLayout, id: PaneId, path: string): WorkspaceLayout {
  const p = pane(layout, id);
  if (!p || !p.tabs.includes(path)) return layout;
  return { ...mapPane(layout, id, (x) => ({ ...x, active: path })), focused: id };
}

export function focusPane(layout: WorkspaceLayout, id: PaneId): WorkspaceLayout {
  return pane(layout, id) ? { ...layout, focused: id } : layout;
}

/** Moves a tab inside its pane. */
export function reorder(
  layout: WorkspaceLayout,
  id: PaneId,
  from: number,
  to: number,
): WorkspaceLayout {
  const p = pane(layout, id);
  if (!p || from < 0 || from >= p.tabs.length || to < 0 || to >= p.tabs.length) return layout;
  return mapPane(layout, id, (x) => {
    const tabs = [...x.tabs];
    const [moved] = tabs.splice(from, 1);
    if (moved !== undefined) tabs.splice(to, 0, moved);
    return { ...x, tabs };
  });
}

/** Moves a tab to another pane (creating the secondary pane when needed). */
export function moveToPane(
  layout: WorkspaceLayout,
  path: string,
  to: PaneId,
  index?: number,
): WorkspaceLayout {
  const from = paneOf(layout, path);
  if (from === null) return openPath(layout, path, to);
  if (from === to) return activate(layout, to, path);
  let next = ensureSecondary(layout);
  next = mapPane(next, from, (p) => removeTab(p, path));
  next = mapPane(next, to, (p) => {
    const tabs = [...p.tabs];
    tabs.splice(index ?? tabs.length, 0, path);
    return { ...p, tabs, active: path };
  });
  return dropEmptySecondary({ ...next, focused: to });
}

/** Merges the secondary pane back into the primary one. */
export function unsplit(layout: WorkspaceLayout): WorkspaceLayout {
  const prim = pane(layout, "primary");
  const sec = pane(layout, "secondary");
  if (!prim || !sec) return layout;
  const tabs = [...prim.tabs, ...sec.tabs.filter((t) => !prim.tabs.includes(t))];
  const active = pane(layout, layout.focused)?.active ?? prim.active;
  return { panes: [{ id: "primary", tabs, active }], focused: "primary" };
}

/** Rewrites tabs after a file or folder was renamed or moved. */
export function renamePaths(layout: WorkspaceLayout, from: string, to: string): WorkspaceLayout {
  const map = (p: string): string =>
    p === from ? to : isInside(p, from) ? to + p.slice(from.length) : p;
  return {
    ...layout,
    panes: layout.panes.map((p) => {
      const tabs = [...new Set(p.tabs.map(map))];
      return { ...p, tabs, active: p.active === null ? null : map(p.active) };
    }),
  };
}

/** Closes every tab inside a deleted file or folder. */
export function removePaths(layout: WorkspaceLayout, prefix: string): WorkspaceLayout {
  let next = layout;
  for (const p of layout.panes) {
    for (const t of p.tabs) if (isInside(t, prefix)) next = closePath(next, t);
  }
  return next;
}

/** Drops tabs whose files no longer exist (used when a layout is restored). */
export function filterExisting(layout: WorkspaceLayout, files: readonly string[]): WorkspaceLayout {
  const known = new Set(files);
  let next = layout;
  for (const p of layout.panes) {
    for (const t of p.tabs) if (!known.has(t)) next = closePath(next, t);
  }
  return next;
}

/** The active note of the focused pane. */
export function focusedActive(layout: WorkspaceLayout): string | null {
  return pane(layout, layout.focused)?.active ?? null;
}

interface WorkspaceState {
  layout: WorkspaceLayout;
  open: (path: string, to?: PaneId) => void;
  close: (path: string) => void;
  activate: (id: PaneId, path: string) => void;
  focusPane: (id: PaneId) => void;
  reorder: (id: PaneId, from: number, to: number) => void;
  moveToPane: (path: string, to: PaneId, index?: number) => void;
  unsplit: () => void;
  renamePaths: (from: string, to: string) => void;
  removePaths: (prefix: string) => void;
  restore: (layout: WorkspaceLayout) => void;
  reset: () => void;
}

/** Set while the layout is replaced programmatically (open/close vault), so nothing is saved. */
export const layoutPersistence = { paused: false };

export const useWorkspaceStore = create<WorkspaceState>((set) => ({
  layout: emptyLayout(),
  open: (path, to) => {
    set((s) => ({ layout: openPath(s.layout, path, to) }));
  },
  close: (path) => {
    set((s) => ({ layout: closePath(s.layout, path) }));
  },
  activate: (id, path) => {
    set((s) => ({ layout: activate(s.layout, id, path) }));
  },
  focusPane: (id) => {
    set((s) => (s.layout.focused === id ? s : { layout: focusPane(s.layout, id) }));
  },
  reorder: (id, from, to) => {
    set((s) => ({ layout: reorder(s.layout, id, from, to) }));
  },
  moveToPane: (path, to, index) => {
    set((s) => ({ layout: moveToPane(s.layout, path, to, index) }));
  },
  unsplit: () => {
    set((s) => ({ layout: unsplit(s.layout) }));
  },
  renamePaths: (from, to) => {
    set((s) => ({ layout: renamePaths(s.layout, from, to) }));
  },
  removePaths: (prefix) => {
    set((s) => ({ layout: removePaths(s.layout, prefix) }));
  },
  restore: (layout) => {
    set({ layout });
  },
  reset: () => {
    set({ layout: emptyLayout() });
  },
}));
