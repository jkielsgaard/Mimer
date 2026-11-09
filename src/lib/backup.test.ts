import { describe, expect, it } from "vitest";
import type { VaultBackup } from "@/bindings/VaultBackup";
import { backupLabel, backupWarning } from "./backup";

const NOW = new Date("2026-11-09T10:00:00");
const b = (over: Partial<VaultBackup>): VaultBackup => ({
  folder: "/disk",
  onClose: false,
  lastOk: null,
  lastError: null,
  ...over,
});

describe("backupWarning", () => {
  it("says nothing without a backup folder, or when the last backup is recent", () => {
    expect(backupWarning(undefined, NOW)).toBeNull();
    expect(backupWarning(b({ folder: "" }), NOW)).toBeNull();
    expect(backupWarning(b({ lastOk: "2026-11-08T09:00:00" }), NOW)).toBeNull();
    expect(backupWarning(b({ lastOk: "2026-11-03T09:00:00" }), NOW)).toBeNull();
  });

  it("warns when the backup is a week old, never made, or failed", () => {
    expect(backupWarning(b({ lastOk: "2026-10-31T09:00:00" }), NOW)).toBe("Backup is 9 days old");
    expect(backupWarning(b({}), NOW)).toBe("Not backed up yet");
    expect(backupWarning(b({ lastOk: "2026-11-09T09:00:00", lastError: "no disk" }), NOW)).toBe(
      "Backup failed",
    );
  });
});

describe("backupLabel", () => {
  it("writes today with the time, then days, then the date", () => {
    expect(backupLabel(null, NOW)).toBe("Not backed up yet");
    expect(backupLabel("2026-11-09T09:12:00", NOW)).toBe("Backed up today 09:12");
    expect(backupLabel("2026-11-08T09:00:00", NOW)).toBe("Backed up 1 day ago");
    expect(backupLabel("2026-11-06T09:00:00", NOW)).toBe("Backed up 3 days ago");
    expect(backupLabel("2026-09-01T09:00:00", NOW)).toBe("Backed up on 2026-09-01");
  });
});
