import { safeStorage } from "@/lib/safeStorage";
import { emptyLayout, type Pane, type WorkspaceLayout } from "@/stores/workspaceStore";

const PREFIX = "mimer.workspace.";

/** Checks the shape of a stored layout. Anything unexpected yields null (never throws). */
export function validateLayout(value: unknown): WorkspaceLayout | null {
  if (typeof value !== "object" || value === null) return null;
  const v = value as { panes?: unknown; focused?: unknown };
  if (!Array.isArray(v.panes) || (v.focused !== "primary" && v.focused !== "secondary"))
    return null;
  const panes: Pane[] = [];
  for (const raw of v.panes as unknown[]) {
    if (typeof raw !== "object" || raw === null) return null;
    const p = raw as { id?: unknown; tabs?: unknown; active?: unknown };
    if (p.id !== "primary" && p.id !== "secondary") return null;
    const tabs: unknown = p.tabs;
    if (!Array.isArray(tabs) || !tabs.every((t): t is string => typeof t === "string")) return null;
    const active: unknown = p.active;
    if (active !== null && typeof active !== "string") return null;
    panes.push({ id: p.id, tabs, active });
  }
  if (panes.length === 0 || panes[0]?.id !== "primary") return null;
  return { panes, focused: v.focused };
}

/** Stores the tabs and split of a vault in localStorage. */
export function saveLayout(vaultPath: string, layout: WorkspaceLayout): void {
  safeStorage.setItem(PREFIX + vaultPath, JSON.stringify(layout));
}

/** Restores a stored layout, or null when there is none or it is unreadable. */
export function loadLayout(vaultPath: string): WorkspaceLayout | null {
  const raw = safeStorage.getItem(PREFIX + vaultPath);
  if (raw === null) return null;
  try {
    return validateLayout(JSON.parse(raw));
  } catch {
    return null;
  }
}

export { emptyLayout };
