import { Plus } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import type { Backlink } from "@/bindings/Backlink";
import { Button } from "@/components/ui/button";
import { openFile } from "@/lib/actions";
import { api } from "@/lib/api";
import { focusedView } from "@/lib/editorViews";
import { searchWords, wikiTargets } from "@/lib/outline";
import { noteTitle } from "@/lib/utils";
import { useVaultStore } from "@/stores/vaultStore";
import { useNoteText } from "./useNoteText";
import { MANAGED_NOTES } from "@/features/fileTree/treeUtils";

/** The name a wiki-link uses for a note: its file name without `.md`. */
function linkName(path: string): string {
  return (path.split("/").pop() ?? path).replace(/\.md$/i, "");
}

/** Adds `[[name]]` under a `## Related` heading at the end of the open note. */
export function addRelatedLink(name: string): void {
  const view = focusedView();
  if (!view) return;
  const doc = view.state.doc.toString();
  const link = `- [[${name}]]`;
  const insert = /\n## Related\s*\n/.test(doc)
    ? `${doc.endsWith("\n") ? "" : "\n"}${link}\n`
    : `${doc.endsWith("\n") ? "" : "\n"}\n## Related\n\n${link}\n`;
  view.dispatch({ changes: { from: doc.length, insert } });
}

/**
 * The links of the open note: notes that link to it, notes it links to, and notes that seem to be
 * about the same thing (found by searching for the words of its title and its tags, no AI).
 */
export function LinksPanel() {
  const { path, text } = useNoteText();
  const resolver = useVaultStore((s) => s.resolver);
  const indexNonce = useVaultStore((s) => s.indexNonce);
  const [back, setBack] = useState<Backlink[]>([]);
  const [related, setRelated] = useState<string[]>([]);

  const out = useMemo(
    () => wikiTargets(text).map((t) => ({ target: t, path: resolver.resolve(t) })),
    [text, resolver],
  );

  useEffect(() => {
    if (path === null) {
      setBack([]);
      return;
    }
    let alive = true;
    api
      .backlinks(path)
      .then((b) => {
        if (alive) setBack(b);
      })
      .catch(() => {
        if (alive) setBack([]);
      });
    return () => {
      alive = false;
    };
  }, [path, indexNonce]);

  const tags = useMemo(
    () =>
      [
        ...new Set(
          [...text.matchAll(/(?:^|\s)#([\p{L}\p{N}_/-]*\p{L}[\p{L}\p{N}_/-]*)/gu)].map(
            (m) => m[1] ?? "",
          ),
        ),
      ].slice(0, 3),
    [text],
  );
  useEffect(() => {
    if (path === null) {
      setRelated([]);
      return;
    }
    let alive = true;
    const linked = new Set([path, ...out.map((o) => o.path), ...back.map((b) => b.path)]);
    for (const m of MANAGED_NOTES) linked.add(m);
    const queries = [
      ...searchWords(noteTitle(path)).map((w) => ({ text: w, tag: null, folder: null })),
      ...tags.filter((t) => t !== "").map((t) => ({ text: "", tag: t, folder: null })),
    ];
    void Promise.all(queries.map((q) => api.search(q).catch(() => []))).then((lists) => {
      const score = new Map<string, number>();
      for (const list of lists) {
        for (const h of list.slice(0, 10)) {
          if (!linked.has(h.path)) score.set(h.path, (score.get(h.path) ?? 0) + 1);
        }
      }
      if (alive) {
        setRelated(
          [...score.entries()]
            .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
            .slice(0, 6)
            .map(([p]) => p),
        );
      }
    });
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- the lists are compared by content
  }, [path, tags.join(" "), out.length, back.length, indexNonce]);

  const heading = (label: string) => <h3 className="px-3 pb-1 pt-3 section-label">{label}</h3>;
  const row = (p: string, key: string, extra?: React.ReactNode) => (
    <li key={key} className="flex items-center gap-1 px-1">
      <button
        type="button"
        className="min-w-0 flex-1 truncate rounded-md px-2 py-1 text-left text-sm hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring"
        onClick={() => void openFile(p)}
      >
        {noteTitle(p)}
      </button>
      {extra}
    </li>
  );

  if (path === null) {
    return <p className="p-3 text-xs text-muted-foreground">No note open.</p>;
  }
  return (
    <div className="h-full min-h-0 overflow-auto pb-3">
      {heading(`Linked from · ${String(back.length)}`)}
      {back.length === 0 && (
        <p className="px-3 text-xs text-muted-foreground">No note links here yet.</p>
      )}
      <ul>{back.map((b) => row(b.path, `b-${b.path}`))}</ul>

      {heading(`Links in this note · ${String(out.length)}`)}
      {out.length === 0 && (
        <p className="px-3 text-xs text-muted-foreground">
          Type [[ in the note to link another note.
        </p>
      )}
      <ul>
        {out.map((o) =>
          o.path === null ? (
            <li key={`o-${o.target}`} className="px-3 py-1 text-sm text-muted-foreground">
              {o.target} <span className="text-[11px]">(no such note)</span>
            </li>
          ) : (
            row(o.path, `o-${o.target}`)
          ),
        )}
      </ul>

      {heading("Maybe related")}
      {related.length === 0 && (
        <p className="px-3 text-xs text-muted-foreground">Nothing found from the title and tags.</p>
      )}
      <ul>
        {related.map((p) =>
          row(
            p,
            `r-${p}`,
            <Button
              size="icon"
              variant="ghost"
              className="size-7"
              aria-label={`Link ${noteTitle(p)} from this note`}
              title="Add a link under Related at the end of this note"
              onClick={() => {
                addRelatedLink(linkName(p));
              }}
            >
              <Plus />
            </Button>,
          ),
        )}
      </ul>
      <p className="px-3 pt-3 text-[11px] text-muted-foreground">
        Maybe related is found by searching for the words of the title and the tags. No AI is used.
      </p>
    </div>
  );
}
