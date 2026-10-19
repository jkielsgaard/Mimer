import type { ReactNode } from "react";

/**
 * The top row of a side panel (left or right): its name, then its buttons. Every panel uses it,
 * so they all start the same way.
 */
export function PanelHeader({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="flex h-9 shrink-0 items-center gap-1 border-b px-3">
      <h2 className="flex-1 truncate text-xs font-semibold">{title}</h2>
      {children}
    </div>
  );
}
