import { Search } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { SearchHit } from "@/bindings/SearchHit";
import type { TagCount } from "@/bindings/TagCount";
import { Input } from "@/components/ui/input";
import { api, toApiError } from "@/lib/api";
import { openFile } from "@/lib/actions";
import { renderSnippet } from "@/lib/snippet";
import { cn } from "@/lib/utils";
import { useEmbeddingStore } from "@/stores/embeddingStore";
import { reportError, useUiStore } from "@/stores/uiStore";
import { useVaultStore } from "@/stores/vaultStore";
import { InfoHint } from "@/components/InfoHint";
import { PanelHeader } from "@/components/PanelHeader";
import { looksLikeQuestion } from "@/lib/question";
import { useAiBlocked } from "@/lib/useAiBlocked";
import { AnswerCard } from "./AnswerCard";
import { isManagedNote } from "@/features/fileTree/treeUtils";

type Mode = "keyword" | "meaning" | "both";
const MODES: { id: Mode; label: string }[] = [
  { id: "keyword", label: "Keyword" },
  { id: "meaning", label: "Meaning" },
  { id: "both", label: "Both" },
];

/**
 * Full-text search with live results. Keyword mode uses the FTS index; Meaning and Both use
 * embeddings (when semantic search is on). `tag:` and `path:` always use keyword filters.
 */
export function SearchPanel() {
  const seed = useUiStore((s) => s.searchSeed);
  const focusNonce = useUiStore((s) => s.focusSearchNonce);
  const indexNonce = useVaultStore((s) => s.indexNonce);
  const status = useEmbeddingStore((s) => s.status);
  const semanticReady = status?.enabled === true && status.chunks > 0;
  const aiOff = useAiBlocked();
  const [mode, setMode] = useState<Mode>("keyword");
  const [text, setText] = useState(seed);
  const [hits, setHits] = useState<SearchHit[]>([]);
  const [tags, setTags] = useState<TagCount[]>([]);
  const [searched, setSearched] = useState(false);
  const [pending, setPending] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setText(seed);
  }, [seed, focusNonce]);

  useEffect(() => {
    input.current?.focus();
    input.current?.select();
  }, [focusNonce]);

  useEffect(() => {
    api
      .allTags()
      .then(setTags)
      .catch(() => undefined);
  }, [indexNonce]);

  useEffect(() => {
    if (text.trim() === "") {
      setHits([]);
      setSearched(false);
      setPending(false);
      setNotice(null);
      return;
    }
    const filtered = /(^|\s)(tag|path):/.test(text);
    const effective: Mode = !semanticReady || filtered ? "keyword" : mode;
    const delay = effective === "keyword" ? 200 : 500;
    setPending(true);
    let cancelled = false;
    const t = setTimeout(() => {
      const run = async (): Promise<void> => {
        if (effective === "keyword") {
          const h = await api.search({ text, tag: null, folder: null });
          if (!cancelled) setHits(h);
        } else if (effective === "meaning") {
          const h = await api.semanticSearch(text.trim());
          if (!cancelled)
            setHits(h.map((x) => ({ path: x.path, title: x.title, snippet: x.snippet })));
        } else {
          const h = await api.hybridSearch(text);
          if (!cancelled) setHits(h);
        }
        if (!cancelled) setNotice(null);
      };
      run()
        .catch(async (e: unknown) => {
          if (cancelled) return;
          // Semantic search is unavailable (for example the model server is off): keep keyword results.
          setNotice(`Semantic search is unavailable: ${toApiError(e).message}`);
          try {
            setHits(await api.search({ text, tag: null, folder: null }));
          } catch (inner) {
            reportError(inner);
          }
        })
        .finally(() => {
          if (!cancelled) {
            setSearched(true);
            setPending(false);
          }
        });
    }, delay);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [text, indexNonce, mode, semanticReady]);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <PanelHeader title="Search" />
      <div className="relative p-2">
        <Search className="pointer-events-none absolute left-4 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
        <Input
          ref={input}
          aria-label="Search notes"
          className="pl-7"
          placeholder="Search…  (tag:name  path:folder)"
          value={text}
          onChange={(e) => {
            setText(e.target.value);
          }}
        />
      </div>
      {semanticReady && (
        <div className="mx-2 mb-1 flex items-center gap-1.5">
          <div
            role="radiogroup"
            aria-label="Search mode"
            className="flex flex-1 overflow-hidden rounded-md border text-xs"
          >
            {MODES.map((m) => (
              <button
                key={m.id}
                type="button"
                role="radio"
                aria-checked={mode === m.id}
                className={cn(
                  "flex-1 px-2 py-1",
                  mode === m.id ? "bg-accent font-medium" : "hover:bg-muted",
                )}
                onClick={() => {
                  setMode(m.id);
                }}
              >
                {m.label}
              </button>
            ))}
          </div>
          <InfoHint
            label="Search mode"
            text="Keyword finds the words you type. Meaning finds notes about the same thing in other words. Both combines them."
            topic="search"
          />
        </div>
      )}
      {status?.state === "indexing" && (
        <p className="mx-2 mb-1 text-[11px] text-muted-foreground">
          Indexing {status.notesDone}/{status.notesTotal} notes… results may be incomplete.
        </p>
      )}
      {notice && (
        <p role="status" className="mx-2 mb-1 text-[11px] text-destructive">
          {notice}
        </p>
      )}
      <div className="min-h-0 flex-1 overflow-auto px-2 pb-2">
        {text.trim() === "" && tags.length > 0 && (
          <div>
            <p className="px-1 pb-1 text-xs font-medium text-muted-foreground">Tags</p>
            <div className="flex flex-wrap gap-1">
              {tags.map((t) => (
                <button
                  key={t.tag}
                  type="button"
                  className="rounded-full bg-accent px-2 py-0.5 text-xs text-accent-foreground hover:opacity-80"
                  onClick={() => {
                    setText(`tag:${t.tag}`);
                  }}
                >
                  #{t.tag} <span className="opacity-60">{t.count}</span>
                </button>
              ))}
            </div>
          </div>
        )}
        {aiOff === null && looksLikeQuestion(text) && (
          <AnswerCard question={text.trim()} semantic={semanticReady} />
        )}
        {pending && text.trim() !== "" && (
          <p className="p-2 text-xs text-muted-foreground">Searching…</p>
        )}
        {searched && !pending && hits.length === 0 && (
          <p className="p-2 text-xs text-muted-foreground">No results.</p>
        )}
        <ul>
          {hits
            .filter((h) => !isManagedNote(h.path))
            .map((h) => (
              <li key={h.path}>
                <button
                  type="button"
                  className="w-full rounded px-2 py-1.5 text-left hover:bg-muted"
                  onClick={() => {
                    void openFile(h.path);
                  }}
                >
                  <div className="truncate text-[13px] font-medium">{h.title}</div>
                  <div className="truncate text-[11px] text-muted-foreground">{h.path}</div>
                  {h.snippet !== "" && (
                    <div className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">
                      {renderSnippet(h.snippet)}
                    </div>
                  )}
                </button>
              </li>
            ))}
        </ul>
      </div>
    </div>
  );
}
