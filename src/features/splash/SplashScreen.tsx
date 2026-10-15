import { useEffect, useState } from "react";
import splashImage from "@/assets/Image_w_logo.png";
import { appVersion, releaseStage } from "@/lib/version";

/** How long the start screen stays at least (milliseconds). */
export const SPLASH_MIN_MS = 2200;
const FADE_MS = 450;

interface Props {
  /** True when the app has loaded; the start screen leaves once this is true and the time is up. */
  ready: boolean;
  /** Called after the start screen has faded out. */
  onDone: () => void;
}

/**
 * The start screen: the Mimer picture with the version, shown while the app loads. It stays for
 * a moment so it can be seen, and a click or any key skips the wait.
 */
export function SplashScreen({ ready, onDone }: Props) {
  const [timeUp, setTimeUp] = useState(false);
  const [leaving, setLeaving] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => {
      setTimeUp(true);
    }, SPLASH_MIN_MS);
    const skip = (): void => {
      setTimeUp(true);
    };
    window.addEventListener("keydown", skip);
    return () => {
      clearTimeout(t);
      window.removeEventListener("keydown", skip);
    };
  }, []);

  useEffect(() => {
    if (!ready || !timeUp) return;
    setLeaving(true);
    const t = setTimeout(onDone, FADE_MS);
    return () => {
      clearTimeout(t);
    };
  }, [ready, timeUp, onDone]);

  return (
    <div
      role="dialog"
      aria-label="Mimer is starting"
      className="fixed inset-0 z-[100] flex cursor-pointer items-end justify-center bg-black transition-opacity motion-reduce:transition-none"
      style={{ opacity: leaving ? 0 : 1, transitionDuration: `${String(FADE_MS)}ms` }}
      onClick={() => {
        setTimeUp(true);
      }}
    >
      <img
        src={splashImage}
        alt="Mimer, keeper of the well of wisdom"
        className="absolute inset-0 size-full object-cover"
        draggable={false}
      />
      <div className="relative mb-6 flex flex-col items-center gap-1 rounded-md bg-black/55 px-5 py-2 text-center text-[#e7d3a5]">
        <p className="text-sm tracking-wide">Notes you own, with an AI that helps you keep order</p>
        <p className="text-xs opacity-80">
          Version {appVersion} {releaseStage}
        </p>
      </div>
    </div>
  );
}
