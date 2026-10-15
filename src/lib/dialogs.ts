// Typed wrappers around the native file dialogs. Components never import Tauri plugins directly.
import { open, save } from "@tauri-apps/plugin-dialog";

/** Asks the user for a folder. Resolves to null when cancelled. */
export async function pickFolder(): Promise<string | null> {
  const picked = await open({ directory: true, multiple: false });
  return typeof picked === "string" ? picked : null;
}

/** Asks the user for one or more picture files. Resolves to an empty list when cancelled. */
export async function pickImages(): Promise<string[]> {
  const picked = await open({
    multiple: true,
    filters: [
      { name: "Pictures", extensions: ["png", "jpg", "jpeg", "gif", "webp", "svg", "bmp", "avif"] },
    ],
  });
  if (picked === null) return [];
  return Array.isArray(picked) ? picked : [picked];
}

/** Asks the user where to save a file. Resolves to null when cancelled. */
export async function pickSavePath(
  defaultPath: string,
  extension: string,
  filterName: string,
): Promise<string | null> {
  return save({ defaultPath, filters: [{ name: filterName, extensions: [extension] }] });
}
