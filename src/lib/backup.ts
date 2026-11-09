import type { VaultBackup } from "@/bindings/VaultBackup";

/** A backup older than this many days gets a warning in the status bar. */
export const STALE_DAYS = 7;

const DAY = 24 * 60 * 60 * 1000;

/**
 * What the status bar says about a vault's backup: nothing when none is chosen or the last one is
 * recent, otherwise a short warning. `last_error` counts as a warning at once.
 */
export function backupWarning(b: VaultBackup | undefined, now: Date = new Date()): string | null {
  if (!b || b.folder.trim() === "") return null;
  if (b.lastError !== null && b.lastError !== "") return "Backup failed";
  if (b.lastOk === null) return "Not backed up yet";
  const at = Date.parse(b.lastOk);
  if (Number.isNaN(at)) return null;
  const days = Math.floor((now.getTime() - at) / DAY);
  return days >= STALE_DAYS ? `Backup is ${String(days)} days old` : null;
}

/** "Backed up today 09:12", "Backed up 3 days ago" or "Backed up on 2026-10-29": the last good one. */
export function backupLabel(lastOk: string | null, now: Date = new Date()): string {
  if (lastOk === null) return "Not backed up yet";
  const at = new Date(lastOk);
  if (Number.isNaN(at.getTime())) return "Not backed up yet";
  const sameDay = at.toDateString() === now.toDateString();
  if (sameDay) {
    const hh = String(at.getHours()).padStart(2, "0");
    const mm = String(at.getMinutes()).padStart(2, "0");
    return `Backed up today ${hh}:${mm}`;
  }
  const days = Math.floor((now.getTime() - at.getTime()) / DAY);
  if (days < 30)
    return `Backed up ${String(Math.max(days, 1))} days ago`.replace("1 days", "1 day");
  return `Backed up on ${at.getFullYear()}-${String(at.getMonth() + 1).padStart(2, "0")}-${String(at.getDate()).padStart(2, "0")}`;
}
