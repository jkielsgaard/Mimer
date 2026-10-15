// The running app's version, shown in the status bar, the welcome screen and Settings.

/**
 * Joins a SemVer version and its build metadata (`0.2.0` + `63947f4.dirty` →
 * `0.2.0+63947f4.dirty`). Build metadata identifies the exact build but never changes precedence.
 */
export function formatVersion(version: string, build: string): string {
  return build === "" ? version : `${version}+${build}`;
}

/** Version of the running app, with build metadata when known. */
export const appVersion = formatVersion(__APP_VERSION__, __APP_BUILD__);

/** Mimer is in beta: shown next to the version so nobody mistakes it for a finished release. */
export const releaseStage = "beta";

/** Build time of the running app as a readable local date and time. */
export function buildDateLabel(iso: string = __APP_BUILD_DATE__): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "unknown";
  const pad = (n: number): string => String(n).padStart(2, "0");
  return `${String(d.getFullYear())}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
