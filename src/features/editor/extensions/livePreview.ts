import { ensureSyntaxTree, syntaxTree } from "@codemirror/language";
import {
  EditorState,
  StateEffect,
  StateField,
  type Extension,
  type Range,
  type Text,
} from "@codemirror/state";
import { Decoration, EditorView, WidgetType, type DecorationSet } from "@codemirror/view";
import { parseSizedAlt } from "@/lib/imageMarkdown";
import { parseTable } from "@/lib/markdownTable";
import { imageSrc, ImageWidget } from "./images";
import { TableWidget } from "./tableWidget";
import { previewConfig } from "./previewConfig";
import { findTags, tagDecorations } from "./tags";
import { findWikiLinks, wikiLinkDecorations } from "./wikiLinks";

/** Dispatch to force the decorations to be rebuilt (e.g. when the file list changed). */
export const refreshPreview = StateEffect.define();

const hide = Decoration.replace({});

/** Line numbers touched by the selection. Syntax markers on these lines stay visible. */
export function activeLineNumbers(state: EditorState): Set<number> {
  const lines = new Set<number>();
  for (const r of state.selection.ranges) {
    const a = state.doc.lineAt(r.from).number;
    const b = state.doc.lineAt(r.to).number;
    for (let n = a; n <= b; n++) lines.add(n);
  }
  return lines;
}

export interface FrontmatterRange {
  from: number;
  /** End of the closing `---` line (no trailing newline). */
  to: number;
}

/** Finds the YAML frontmatter block at the top of the document. */
export function findFrontmatter(doc: Text): FrontmatterRange | null {
  if (doc.lines < 2 || doc.line(1).text.trimEnd() !== "---") return null;
  const max = Math.min(doc.lines, 500);
  for (let n = 2; n <= max; n++) {
    if (doc.line(n).text.trimEnd() === "---") return { from: 0, to: doc.line(n).to };
  }
  return null;
}

class CheckboxWidget extends WidgetType {
  constructor(readonly checked: boolean) {
    super();
  }
  override eq(other: CheckboxWidget): boolean {
    return other.checked === this.checked;
  }
  override toDOM(view: EditorView): HTMLElement {
    const box = document.createElement("input");
    box.type = "checkbox";
    box.checked = this.checked;
    box.className = "cm-task-checkbox";
    box.addEventListener("mousedown", (e) => {
      e.preventDefault();
      const pos = view.posAtDOM(box);
      const current = view.state.doc.sliceString(pos, pos + 3);
      if (current !== "[ ]" && current.toLowerCase() !== "[x]") return;
      view.dispatch({ changes: { from: pos, to: pos + 3, insert: this.checked ? "[ ]" : "[x]" } });
    });
    return box;
  }
  override ignoreEvent(): boolean {
    return true;
  }
}

class HrWidget extends WidgetType {
  override toDOM(): HTMLElement {
    const hr = document.createElement("hr");
    hr.className = "cm-hr";
    return hr;
  }
}

class PropertiesWidget extends WidgetType {
  constructor(
    readonly keys: string[],
    readonly rest: string,
  ) {
    super();
  }
  override eq(other: PropertiesWidget): boolean {
    return other.rest === this.rest;
  }
  override toDOM(view: EditorView): HTMLElement {
    const el = document.createElement("div");
    el.className = "cm-properties";
    const title = document.createElement("span");
    title.className = "cm-properties-title";
    title.textContent = "Properties";
    const keys = document.createElement("span");
    keys.className = "cm-properties-keys";
    keys.textContent = this.keys.join(" · ");
    el.append(title, keys);
    el.addEventListener("mousedown", (e) => {
      e.preventDefault();
      view.dispatch({ selection: { anchor: Math.min(4, view.state.doc.length) } });
      view.focus();
    });
    return el;
  }
  override ignoreEvent(): boolean {
    return true;
  }
}

function frontmatterKeys(doc: Text, fm: FrontmatterRange): string[] {
  const keys: string[] = [];
  const last = doc.lineAt(fm.to).number;
  for (let n = 2; n < last; n++) {
    const m = /^([A-Za-z0-9_-][^:]*):/.exec(doc.line(n).text);
    if (m?.[1]) keys.push(m[1]);
  }
  return keys;
}

/** Builds every live-preview decoration for the current state. Exported for tests. */
export function buildDecorations(state: EditorState): DecorationSet {
  const cfg = state.facet(previewConfig);
  const doc = state.doc;
  const active = activeLineNumbers(state);
  const ranges: Range<Decoration>[] = [];
  const codeRanges: [number, number][] = [];
  const renderedTables: [number, number][] = [];
  const fm = findFrontmatter(doc);
  const fmEnd = fm ? fm.to : -1;
  const tree = ensureSyntaxTree(state, doc.length, 200) ?? syntaxTree(state);

  const lineActive = (from: number, to: number): boolean => {
    const a = doc.lineAt(from).number;
    const b = doc.lineAt(Math.max(from, to)).number;
    for (let n = a; n <= b; n++) if (active.has(n)) return true;
    return false;
  };
  const addHide = (from: number, to: number): void => {
    if (to > from) ranges.push(hide.range(from, to));
  };
  const addLines = (from: number, to: number, cls: string): void => {
    const a = doc.lineAt(from).number;
    const b = doc.lineAt(to).number;
    for (let n = a; n <= b; n++)
      ranges.push(Decoration.line({ class: cls }).range(doc.line(n).from));
  };

  if (fm) {
    const cursorInside = lineActive(fm.from, fm.to);
    if (cursorInside) {
      addLines(fm.from, fm.to, "cm-frontmatter");
    } else {
      const rest = doc.sliceString(fm.from, fm.to);
      ranges.push(
        Decoration.replace({
          widget: new PropertiesWidget(frontmatterKeys(doc, fm), rest),
          block: true,
        }).range(fm.from, fm.to),
      );
    }
  }

  tree.iterate({
    enter: (node) => {
      if (node.to <= fmEnd) return false;
      const name = node.name;
      const heading = /^ATXHeading(\d)$/.exec(name);
      if (heading) {
        addLines(node.from, node.from, `cm-h cm-h${heading[1] ?? "1"}`);
        return;
      }
      switch (name) {
        case "SetextHeading1":
        case "SetextHeading2":
          addLines(node.from, node.from, `cm-h cm-h${name.endsWith("1") ? "1" : "2"}`);
          return;
        case "HeaderMark": {
          const parent = node.node.parent?.name ?? "";
          if (parent.startsWith("ATXHeading") && !lineActive(node.from, node.to)) {
            const after = doc.sliceString(node.to, node.to + 1);
            addHide(node.from, node.to + (after === " " ? 1 : 0));
          }
          return;
        }
        case "StrongEmphasis":
          ranges.push(Decoration.mark({ class: "cm-strong" }).range(node.from, node.to));
          return;
        case "Emphasis":
          ranges.push(Decoration.mark({ class: "cm-em" }).range(node.from, node.to));
          return;
        case "Strikethrough":
          ranges.push(Decoration.mark({ class: "cm-strike" }).range(node.from, node.to));
          return;
        case "EmphasisMark":
        case "StrikethroughMark":
          if (!lineActive(node.from, node.to)) addHide(node.from, node.to);
          return;
        case "InlineCode":
          codeRanges.push([node.from, node.to]);
          ranges.push(Decoration.mark({ class: "cm-inline-code" }).range(node.from, node.to));
          return;
        case "CodeMark":
          if (node.node.parent?.name === "InlineCode" && !lineActive(node.from, node.to)) {
            addHide(node.from, node.to);
          }
          return;
        case "FencedCode":
        case "CodeBlock": {
          codeRanges.push([node.from, node.to]);
          addLines(node.from, node.to, "cm-codeblock");
          if (name === "FencedCode") {
            addLines(node.from, node.from, "cm-codefence");
            addLines(node.to, node.to, "cm-codefence");
          }
          return false;
        }
        case "Blockquote":
          addLines(node.from, node.to, "cm-quote");
          return;
        case "QuoteMark":
          ranges.push(Decoration.mark({ class: "cm-quote-mark" }).range(node.from, node.to));
          return;
        case "ListMark":
          ranges.push(Decoration.mark({ class: "cm-list-mark" }).range(node.from, node.to));
          return;
        case "TaskMarker": {
          const text = doc.sliceString(node.from, node.to);
          ranges.push(
            Decoration.replace({ widget: new CheckboxWidget(text.toLowerCase() === "[x]") }).range(
              node.from,
              node.to,
            ),
          );
          return;
        }
        case "CommentBlock": {
          // The markers around a generated index list are not for reading; show them only when
          // the cursor is on them.
          const text = doc.sliceString(node.from, node.to).trim();
          if (
            /^<!--\s*mimer:index:(start|end)\s*-->$/.test(text) &&
            !lineActive(node.from, node.to)
          ) {
            ranges.push(Decoration.line({ class: "cm-index-marker" }).range(node.from));
            addHide(node.from, node.to);
          }
          return;
        }
        case "HorizontalRule":
          if (!lineActive(node.from, node.to)) {
            ranges.push(Decoration.replace({ widget: new HrWidget() }).range(node.from, node.to));
          }
          return;
        case "Table": {
          const source = doc.sliceString(node.from, node.to);
          if (!lineActive(node.from, node.to) && parseTable(source) !== null) {
            renderedTables.push([node.from, node.to]);
            ranges.push(
              Decoration.replace({ widget: new TableWidget(source), block: true }).range(
                node.from,
                node.to,
              ),
            );
          } else {
            addLines(node.from, node.to, "cm-table");
          }
          return false; // table cells are not decorated separately
        }
        case "Image": {
          const marks = node.node.getChildren("LinkMark");
          const url = node.node.getChild("URL");
          const open = marks[0];
          const close = marks[1];
          if (!url || !open || !close) return false;
          const src = imageSrc(cfg, doc.sliceString(url.from, url.to));
          if (src !== null && !lineActive(node.from, node.to)) {
            const sized = parseSizedAlt(doc.sliceString(open.to, close.from));
            ranges.push(
              Decoration.replace({ widget: new ImageWidget(src, sized.text, sized.width) }).range(
                node.from,
                node.to,
              ),
            );
          } else {
            ranges.push(Decoration.mark({ class: "cm-image-syntax" }).range(node.from, node.to));
          }
          return false;
        }
        case "Link": {
          const marks = node.node.getChildren("LinkMark");
          const url = node.node.getChild("URL");
          const open = marks[0];
          const close = marks[1];
          if (!url || !open || !close || marks.length < 4) return;
          const href = doc.sliceString(url.from, url.to);
          ranges.push(
            Decoration.mark({ class: "cm-link", attributes: { "data-href": href } }).range(
              open.to,
              close.from,
            ),
          );
          if (!lineActive(node.from, node.to)) {
            addHide(open.from, open.to);
            addHide(close.from, node.to);
          }
          return;
        }
        case "URL":
          if (node.node.parent?.name === "Autolink") {
            ranges.push(
              Decoration.mark({
                class: "cm-link",
                attributes: { "data-href": doc.sliceString(node.from, node.to) },
              }).range(node.from, node.to),
            );
          }
          return;
        default:
          return;
      }
    },
  });

  // Wiki-links and tags are matched on raw lines, outside code and frontmatter.
  const inCode = (pos: number): boolean => codeRanges.some(([a, b]) => pos >= a && pos < b);
  const inTable = (pos: number): boolean => renderedTables.some(([a, b]) => pos >= a && pos < b);
  for (let n = 1; n <= doc.lines; n++) {
    const line = doc.line(n);
    if (line.to <= fmEnd || line.text === "" || inTable(line.from)) continue;
    const isActive = active.has(n);
    for (const w of findWikiLinks(line.text, line.from)) {
      if (!inCode(w.from)) ranges.push(...wikiLinkDecorations(w, isActive, cfg));
    }
    for (const t of tagMatchesOutsideCode(line.text, line.from, inCode)) {
      ranges.push(...tagDecorations([t]));
    }
  }

  return Decoration.set(ranges, true);
}

function tagMatchesOutsideCode(text: string, offset: number, inCode: (pos: number) => boolean) {
  return findTags(text, offset).filter((t) => !inCode(t.from));
}

const previewField = StateField.define<DecorationSet>({
  create: (state) => buildDecorations(state),
  update(value, tr) {
    if (
      tr.docChanged ||
      tr.selection ||
      tr.reconfigured ||
      tr.effects.some((e) => e.is(refreshPreview)) ||
      syntaxTree(tr.state) !== syntaxTree(tr.startState)
    ) {
      return buildDecorations(tr.state);
    }
    return value;
  },
  provide: (f) => EditorView.decorations.from(f),
});

/** Click handling for wiki-links, tags and Markdown links. */
const previewClicks = EditorView.domEventHandlers({
  mousedown(event, view) {
    const target = event.target;
    if (!(target instanceof HTMLElement) || event.button !== 0) return false;
    const cfg = view.state.facet(previewConfig);
    const mod = event.ctrlKey || event.metaKey;
    const el = target.closest<HTMLElement>("[data-wikilink], [data-tag], [data-href]");
    if (!el) return false;
    const pos = view.posAtDOM(el);
    const wasRendered = !activeLineNumbers(view.state).has(view.state.doc.lineAt(pos).number);
    const wiki = el.dataset.wikilink;
    if (wiki !== undefined) {
      const resolved = el.dataset.resolved ? el.dataset.resolved : null;
      if (mod || (wasRendered && resolved === null)) {
        event.preventDefault();
        cfg.openWikiLink(wiki, resolved);
        return true;
      }
      return false;
    }
    const tag = el.dataset.tag;
    if (tag !== undefined) {
      if (mod || wasRendered) {
        event.preventDefault();
        cfg.openTag(tag);
        return true;
      }
      return false;
    }
    const href = el.dataset.href;
    if (href !== undefined && mod) {
      event.preventDefault();
      cfg.openHref(href, cfg.notePath);
      return true;
    }
    return false;
  },
});

/** The complete live-preview extension (decorations, click handling, styling hooks). */
export function livePreview(): Extension {
  return [previewField, previewClicks];
}
