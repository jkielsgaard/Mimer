import { ChevronDown, ChevronRight } from "lucide-react";
import type { ReactNode } from "react";
import { savedSectionOpen, useTreeStore } from "@/stores/treeStore";
import { PlainButton } from "@/components/ui/plain-button";

interface Props {
  title: string;
  /** Remembers whether the section is open, per computer. */
  storageKey: string;
  /** Number shown after the title. */
  count?: number;
  /** A small "?" after the title that explains the section. */
  hint?: ReactNode;
  children: ReactNode;
}

/** A titled group in the file panel that can be folded away. */
export function SidebarSection({ title, storageKey, count, hint, children }: Props) {
  const open = useTreeStore((s) => s.sectionOpen[storageKey] ?? savedSectionOpen(storageKey));
  const setOpen = useTreeStore((s) => s.setSectionOpen);
  return (
    <section aria-label={title} className="border-b pb-1">
      <div className="flex items-center gap-1.5 px-2 py-1 section-label">
        <PlainButton
          type="button"
          aria-expanded={open}
          className="flex min-w-0 flex-1 items-center gap-1 text-left section-label hover:text-foreground"
          onClick={() => {
            setOpen(storageKey, !open);
          }}
        >
          {open ? <ChevronDown className="size-3" /> : <ChevronRight className="size-3" />}
          <span className="truncate">{title}</span>
          {count !== undefined && <span className="ml-auto tabular-nums">{count}</span>}
        </PlainButton>
        {hint}
      </div>
      {open && children}
    </section>
  );
}
