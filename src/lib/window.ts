// Typed wrapper around the main window (title). Components never import Tauri window APIs directly.
import { getCurrentWindow } from "@tauri-apps/api/window";

/** Sets the native window title. Failures are ignored: the title is cosmetic. */
export async function setWindowTitle(title: string): Promise<void> {
  await getCurrentWindow()
    .setTitle(title)
    .catch(() => undefined);
}
