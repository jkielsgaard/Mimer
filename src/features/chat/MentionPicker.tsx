import { Folder } from "lucide-react";
import { isFolderMention } from "@/lib/mentionQuery";
import { basename, dirname } from "@/lib/utils";
import { cn } from "@/lib/utils";

interface Props {
  /** Vault-relative note paths to choose from. */
  items: readonly string[];
  /** Index of the highlighted row (moved with the arrow keys in the message box). */
  activeIndex: number;
  /** Note count of each folder that can be attached (a path not in the map is a note). */
  folders?: ReadonlyMap<string, number>;
  onPick: (path: string) => void;
}

/** The list that opens when `/` is typed in the message box. Keyboard handling stays in the box. */
export function MentionPicker({ items, activeIndex, folders, onPick }: Props) {
  return (
    <ul
      role="listbox"
      aria-label="Notes and folders to attach"
      className="absolute inset-x-2 bottom-full z-20 mb-1 max-h-56 overflow-auto rounded-md border bg-card p-1 text-sm shadow-lg"
    >
      {items.length === 0 && (
        <li className="px-2 py-1.5 text-xs text-muted-foreground">No matching notes or folders</li>
      )}
      {items.map((path, i) => (
        <li
          key={path}
          role="option"
          aria-selected={i === activeIndex}
          className={cn(
            "cursor-pointer rounded px-2 py-1.5",
            i === activeIndex ? "bg-accent" : "hover:bg-muted",
          )}
          // Pick on mousedown so the message box keeps focus.
          onMouseDown={(e) => {
            e.preventDefault();
            onPick(path);
          }}
        >
          <div className="flex items-center gap-1.5 truncate text-[13px] font-medium">
            {isFolderMention(path) && <Folder className="size-3.5 shrink-0" aria-hidden />}
            <span className="truncate">{basename(path).replace(/\.md$/i, "")}</span>
            {isFolderMention(path) && (
              <span className="ml-auto shrink-0 pl-2 text-[11px] font-normal text-muted-foreground">
                {String(folders?.get(path) ?? 0)} notes
              </span>
            )}
          </div>
          {dirname(path) !== "" && (
            <div className="truncate text-[11px] text-muted-foreground">{dirname(path)}</div>
          )}
        </li>
      ))}
    </ul>
  );
}
