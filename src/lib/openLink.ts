import { api, toApiError } from "@/lib/api";
import { useUiStore } from "@/stores/uiStore";

/**
 * Opens a web address in the user's own browser. When that fails, a dialog says so and shows
 * the address, so it can be copied: a link must never just do nothing.
 */
export async function openLink(url: string): Promise<void> {
  try {
    await api.openExternal(url);
  } catch (e) {
    useUiStore.getState().showNotice({
      title: "The link could not be opened",
      details: [toApiError(e).message, url.length > 300 ? `${url.slice(0, 300)}…` : url],
      hint: "Copy the address above and open it in a browser yourself.",
    });
  }
}
