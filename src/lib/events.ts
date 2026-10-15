// Typed wrappers around Tauri `listen`.
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import type { FileChanged } from "@/bindings/FileChanged";

export type { FileChanged };

export function onFileChanged(handler: (e: FileChanged) => void): Promise<UnlistenFn> {
  return listen<FileChanged>("vault://file-changed", (e) => {
    handler(e.payload);
  });
}

export function onIndexUpdated(handler: () => void): Promise<UnlistenFn> {
  return listen("vault://index-updated", () => {
    handler();
  });
}

export function onCommitted(
  handler: (e: { sha: string; message: string }) => void,
): Promise<UnlistenFn> {
  return listen<{ sha: string; message: string }>("git://committed", (e) => {
    handler(e.payload);
  });
}

export function onCloseRequested(handler: () => void): Promise<UnlistenFn> {
  return listen("app://close-requested", () => {
    handler();
  });
}

export function onEngineStatus(
  handler: (e: import("@/bindings/EngineStatus").EngineStatus) => void,
): Promise<UnlistenFn> {
  return listen<import("@/bindings/EngineStatus").EngineStatus>("engine://status", (e) => {
    handler(e.payload);
  });
}

export function onEmbeddingStatus(
  handler: (e: import("@/bindings/EmbeddingStatus").EmbeddingStatus) => void,
): Promise<UnlistenFn> {
  return listen<import("@/bindings/EmbeddingStatus").EmbeddingStatus>(
    "embeddings://status",
    (e) => {
      handler(e.payload);
    },
  );
}
