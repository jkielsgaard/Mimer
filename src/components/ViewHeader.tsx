import { ArrowLeft } from "lucide-react";
import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { useUiStore } from "@/stores/uiStore";

/**
 * The top row of a page in the middle (Tasks, a task, Ideas): an optional way back, the title,
 * the page's buttons, and "Back to notes" at the end. Every page uses it.
 */
export function ViewHeader({
  title,
  back,
  children,
}: {
  title: string;
  /** A step back inside the area (for example from a task to the list). */
  back?: { label: string; run: () => void };
  children?: ReactNode;
}) {
  return (
    <div className="flex h-12 shrink-0 items-center gap-2 border-b px-5">
      {back && (
        <Button size="sm" variant="ghost" onClick={back.run}>
          <ArrowLeft /> {back.label}
        </Button>
      )}
      <h2 className="min-w-0 flex-1 truncate text-base font-semibold">{title}</h2>
      {children}
      <Button
        size="sm"
        variant="ghost"
        onClick={() => {
          useUiStore.getState().setCenterView("notes");
        }}
      >
        Back to notes
      </Button>
    </div>
  );
}
