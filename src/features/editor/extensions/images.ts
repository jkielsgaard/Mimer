import { WidgetType, type EditorView } from "@codemirror/view";
import { IMAGE_SIZES, withImageWidth } from "@/lib/imageMarkdown";
import { basename, resolveRelativePath } from "@/lib/utils";
import { useUiStore } from "@/stores/uiStore";
import type { PreviewConfig } from "./previewConfig";

/**
 * An inline image shown in place of `![alt](path)` or `![[name]]` when the cursor is elsewhere.
 * Pointing at it shows a small bar to change its size, which is written into the note
 * (`![alt|400](path)`).
 */
export class ImageWidget extends WidgetType {
  constructor(
    readonly src: string,
    readonly alt: string,
    readonly width: number | null = null,
  ) {
    super();
  }

  override eq(other: ImageWidget): boolean {
    return other.src === this.src && other.alt === this.alt && other.width === this.width;
  }

  override toDOM(view: EditorView): HTMLElement {
    const wrap = document.createElement("span");
    wrap.className = "cm-image-wrap";
    const img = document.createElement("img");
    img.src = this.src;
    img.alt = this.alt;
    img.className = "cm-image";
    img.title = "Click to enlarge";
    img.style.cursor = "zoom-in";
    img.addEventListener("click", () => {
      useUiStore.getState().openImagePreview({
        src: this.src,
        name: this.alt || "Picture",
        path: null,
      });
    });
    if (this.width !== null) img.style.width = `${String(this.width)}px`;
    img.addEventListener("error", () => {
      const span = document.createElement("span");
      span.className = "cm-image-missing";
      span.textContent = `🖼 ${this.alt || "image not found"}`;
      wrap.replaceChildren(span);
    });
    const bar = document.createElement("span");
    bar.className = "cm-image-sizes";
    bar.setAttribute("role", "group");
    bar.setAttribute("aria-label", "Image size");
    for (const size of IMAGE_SIZES) {
      const button = document.createElement("button");
      button.type = "button";
      button.textContent = size.label;
      button.setAttribute("aria-pressed", String(size.width === this.width));
      // Keep the editor's selection and focus while the bar is used.
      button.addEventListener("mousedown", (e) => {
        e.preventDefault();
      });
      button.addEventListener("click", () => {
        setImageWidth(view, wrap, size.width);
      });
      bar.append(button);
    }
    wrap.append(img, bar);
    return wrap;
  }

  override ignoreEvent(): boolean {
    return true;
  }
}

/** Rewrites the picture that `wrap` stands for so that it has `width` (null = original size). */
export function setImageWidth(view: EditorView, wrap: HTMLElement, width: number | null): void {
  const pos = view.posAtDOM(wrap);
  const line = view.state.doc.lineAt(pos);
  const rewritten = withImageWidth(view.state.sliceDoc(pos, line.to), width);
  if (!rewritten) return;
  view.dispatch({ changes: { from: pos, to: pos + rewritten.replaces, insert: rewritten.text } });
}

/** Webview-loadable URL for a Markdown image URL, or null if it cannot be shown. */
export function imageSrc(cfg: PreviewConfig, url: string): string | null {
  if (/^(https?:|data:)/i.test(url)) return url;
  let vaultPath = resolveRelativePath(cfg.notePath, url);
  if (vaultPath === null) return null;
  // The link may point where the picture no longer is (the note or the picture was moved by
  // something that did not update it). If the file is not there but one with that name is, show it.
  if (cfg.fileExists && !cfg.fileExists(vaultPath)) {
    const moved = cfg.resolveLink(basename(vaultPath));
    if (moved !== null) vaultPath = moved;
  }
  return cfg.assetUrl(vaultPath);
}
