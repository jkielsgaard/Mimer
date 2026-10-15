import { Type } from "lucide-react";
import { useTitleFollow } from "@/stores/titleFollowStore";
import { useUiStore } from "@/stores/uiStore";

/**
 * Shown on a new note whose file name follows the first heading. Clicking it keeps the current
 * name from now on.
 */
export function TitleFollowChip({ path }: { path: string | null }) {
  const following = useTitleFollow((s) => path !== null && s.paths.has(path));
  if (!following || path === null) return null;
  return (
    <button
      type="button"
      className="inline-flex items-center gap-1 rounded px-2 py-0.5 text-[11px] text-muted-foreground hover:bg-muted"
      title="The file name changes as you write the first heading. Click to keep the current name."
      aria-label="File name follows the title"
      onClick={() => {
        useTitleFollow.getState().stop(path);
        useUiStore.getState().toast("The file name will stay as it is.", "success");
      }}
    >
      <Type className="size-3" aria-hidden /> Name follows title
    </button>
  );
}
