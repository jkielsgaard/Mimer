import type { ReactNode } from "react";

/**
 * The top row of a side panel (left or right): its name, then its buttons. Every panel uses it,
 * so they all start the same way.
 */
export function PanelHeader({
  title,
  about,
  children,
}: {
  title: string;
  /** What the panel is about (a note's name), shown after the title in the same row. */
  about?: string | null;
  children?: ReactNode;
}) {
  return (
    <div className="flex h-9 shrink-0 items-center gap-1 border-b px-3">
      <h2 className="min-w-0 flex-1 truncate text-xs font-semibold">
        {title}
        {about && <span className="font-normal text-muted-foreground"> · {about}</span>}
      </h2>
      {children}
    </div>
  );
}
