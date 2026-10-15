import { useUiStore } from "@/stores/uiStore";

/** Copies text to the clipboard and says so (or says why not). */
export async function copyText(text: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(text);
    useUiStore.getState().toast("Copied", "success");
  } catch {
    useUiStore.getState().toast("Could not copy. Select the text and copy it by hand.", "error");
  }
}
