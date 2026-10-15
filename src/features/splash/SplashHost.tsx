import { useState } from "react";
import { useSettingsStore } from "@/stores/settingsStore";
import { SplashScreen } from "./SplashScreen";

/** Shows the start screen once per launch, until the app has loaded its settings. */
export function SplashHost() {
  const ready = useSettingsStore((s) => s.settings !== null || s.error !== null);
  const [done, setDone] = useState(false);
  if (done) return null;
  return (
    <SplashScreen
      ready={ready}
      onDone={() => {
        setDone(true);
      }}
    />
  );
}
