import type { Completion, CompletionContext, CompletionResult } from "@codemirror/autocomplete";
import type { Range } from "@codemirror/state";
import { Decoration } from "@codemirror/view";
import { filterLinkTargets } from "@/lib/links";
import { isImage } from "@/lib/utils";
import { widthFromAlias } from "@/lib/imageMarkdown";
import { ImageWidget } from "./images";
import type { PreviewConfig } from "./previewConfig";

const WIKI_RE = /!?\[\[([^[\]|#]+)(#[^[\]|]+)?(\|[^[\]]+)?\]\]/g;

export interface WikiMatch {
  from: number;
  to: number;
  target: string;
  heading: string | null;
  alias: string | null;
  embed: boolean;
}

/** Finds wiki-links in one line (`offset` = document position of the line start). */
export function findWikiLinks(line: string, offset: number): WikiMatch[] {
  const out: WikiMatch[] = [];
  for (const m of line.matchAll(WIKI_RE)) {
    const [whole, target = "", heading, alias] = m;
    const from = offset + m.index;
    out.push({
      from,
      to: from + whole.length,
      target: target.trim(),
      heading: heading ?? null,
      alias: alias ?? null,
      embed: whole.startsWith("!"),
    });
  }
  return out;
}

const hide = Decoration.replace({});

/**
 * Decorations for one wiki-link. When the line is active the whole link is styled with its
 * brackets visible; otherwise the brackets (and `target|` before an alias) are hidden.
 */
export function wikiLinkDecorations(
  m: WikiMatch,
  active: boolean,
  cfg: PreviewConfig,
): Range<Decoration>[] {
  const resolved = cfg.resolveLink(m.target);
  const out: Range<Decoration>[] = [];
  if (!active && m.embed && resolved !== null && isImage(resolved)) {
    out.push(
      Decoration.replace({
        widget: new ImageWidget(cfg.assetUrl(resolved), m.target, widthFromAlias(m.alias)),
      }).range(m.from, m.to),
    );
    return out;
  }
  const cls = resolved === null ? "cm-wikilink cm-wikilink-unresolved" : "cm-wikilink";
  const attrs = { "data-wikilink": m.target, "data-resolved": resolved ?? "" };
  if (active) {
    out.push(Decoration.mark({ class: cls, attributes: attrs }).range(m.from, m.to));
    return out;
  }
  const open = m.from + (m.embed ? 3 : 2);
  const close = m.to - 2;
  out.push(hide.range(m.from, open));
  if (m.alias !== null) {
    const aliasStart = close - (m.alias.length - 1);
    out.push(hide.range(open, aliasStart));
    out.push(Decoration.mark({ class: cls, attributes: attrs }).range(aliasStart, close));
  } else {
    out.push(Decoration.mark({ class: cls, attributes: attrs }).range(open, close));
  }
  out.push(hide.range(close, m.to));
  return out;
}

/** `[[` autocomplete over the vault's files. */
export function wikiLinkCompletion(getFiles: () => readonly string[]) {
  return (context: CompletionContext): CompletionResult | null => {
    const before = context.matchBefore(/\[\[[^\]\n|#]*/);
    if (!before) return null;
    const query = before.text.slice(2);
    const options: Completion[] = filterLinkTargets(getFiles(), query).map((form) => ({
      label: form,
      type: "text",
      apply: (view, _completion, from, to) => {
        const hasClose = view.state.doc.sliceString(to, to + 2) === "]]";
        const insert = hasClose ? form : `${form}]]`;
        view.dispatch({
          changes: { from, to, insert },
          selection: { anchor: from + insert.length + (hasClose ? 2 : 0) },
        });
      },
    }));
    return { from: before.from + 2, options, filter: false };
  };
}
