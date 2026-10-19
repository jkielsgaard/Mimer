import splashImage from "@/assets/Image_w_logo.png";
import { appVersion, releaseStage } from "@/lib/version";

/**
 * The start screen: the Mimer picture with the version. It is shown in a small window of its own
 * (a fixed size, no frame) while the app loads; the main window opens when the app is ready.
 */
export function SplashScreen() {
  return (
    <div
      role="img"
      aria-label="Mimer is starting"
      className="relative flex h-screen w-screen select-none items-end justify-center overflow-hidden bg-black"
    >
      <img
        src={splashImage}
        alt=""
        className="absolute inset-0 size-full object-cover"
        draggable={false}
      />
      <p className="relative mb-3 rounded bg-black/55 px-3 py-0.5 text-xs text-[#e7d3a5]">
        Version {appVersion} {releaseStage}
      </p>
    </div>
  );
}
