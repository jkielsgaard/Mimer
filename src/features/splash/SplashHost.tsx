import { useEffect, useRef } from "react";
import { api } from "@/lib/api";
import { useSettingsStore } from "@/stores/settingsStore";

/** The start screen stays at least this long (milliseconds), so it can be seen. */
export const SPLASH_MIN_MS = 1800;

/**
 * In the main window: once the app has loaded its settings (and the start screen has been seen for
 * a moment), tell the backend to show this window and close the start screen. Renders nothing.
 */
export function SplashHost() {
  const ready = useSettingsStore((s) => s.settings !== null || s.error !== null);
  const started = useRef(Date.now());
  const sent = useRef(false);
  useEffect(() => {
    if (!ready || sent.current) return;
    const wait = Math.max(0, SPLASH_MIN_MS - (Date.now() - started.current));
    const t = setTimeout(() => {
      sent.current = true;
      void api.splashDone().catch(() => undefined);
    }, wait);
    return () => {
      clearTimeout(t);
    };
  }, [ready]);
  return null;
}
