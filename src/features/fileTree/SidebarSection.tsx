import { ChevronDown, ChevronRight } from "lucide-react";
import type { ReactNode } from "react";
import { savedSectionOpen, useTreeStore } from "@/stores/treeStore";

interface Props {
  title: string;
  /** Remembers whether the section is open, per computer. */
  storageKey: string;
  /** Number shown after the title. */
  count?: number;
  children: ReactNode;
}

/** A titled group in the file panel that can be folded away. */
export function SidebarSection({ title, storageKey, count, children }: Props) {
  const open = useTreeStore((s) => s.sectionOpen[storageKey] ?? savedSectionOpen(storageKey));
  const setOpen = useTreeStore((s) => s.setSectionOpen);
  return (
    <section aria-label={title} className="border-b pb-1">
      <button
        type="button"
        aria-expanded={open}
        className="flex w-full items-center gap-1 px-2 py-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground hover:text-foreground"
        onClick={() => {
          setOpen(storageKey, !open);
        }}
      >
        {open ? <ChevronDown className="size-3" /> : <ChevronRight className="size-3" />}
        {title}
        {count !== undefined && <span className="ml-auto tabular-nums">{count}</span>}
      </button>
      {open && children}
    </section>
  );
}
