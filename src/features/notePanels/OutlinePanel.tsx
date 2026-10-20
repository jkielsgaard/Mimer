import { useMemo } from "react";
import { goToLine } from "@/lib/editorViews";
import { outlineOf, tagsOf } from "@/lib/outline";
import { searchForTag } from "@/lib/actions";
import { startTag } from "@/lib/editorViews";
import { useNoteText } from "./useNoteText";

/** The headings of the open note. Click one to go there. */
export function OutlinePanel() {
  const { path, text } = useNoteText();
  const headings = useMemo(() => outlineOf(text), [text]);
  const tags = useMemo(() => tagsOf(text), [text]);
  const top = Math.min(...headings.map((h) => h.level), 6);
  return (
    <div className="flex h-full min-h-0 flex-col">
      {path !== null && (
        <div className="flex flex-wrap items-center gap-1 border-b px-3 py-2">
          {tags.map((t) => (
            <button
              key={t}
              type="button"
              title={`Search for #${t}`}
              className="rounded-full bg-accent px-2 text-xs text-accent-foreground hover:opacity-80 focus-visible:ring-2 focus-visible:ring-ring"
              onClick={() => {
                searchForTag(t);
              }}
            >
              #{t}
            </button>
          ))}
          <button
            type="button"
            aria-label="Add a tag"
            title="Add a tag: type # and pick one you already use"
            className="rounded-full border px-2 text-xs text-muted-foreground hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring"
            onClick={startTag}
          >
            + tag
          </button>
        </div>
      )}
      <div className="min-h-0 flex-1 overflow-auto px-2 py-2">
        {path === null && <p className="px-2 text-xs text-muted-foreground">No note open.</p>}
        {path !== null && headings.length === 0 && (
          <p className="px-2 text-xs text-muted-foreground">
            This note has no headings. Start a line with # to make one.
          </p>
        )}
        <ul>
          {headings.map((h) => (
            <li key={h.line}>
              <button
                type="button"
                className="w-full truncate rounded-md py-1 pr-2 text-left text-sm hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring"
                style={{ paddingLeft: `${String(8 + (h.level - top) * 14)}px` }}
                onClick={() => {
                  goToLine(h.line);
                }}
              >
                {h.text}
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
