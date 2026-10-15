import { markdown, markdownLanguage } from "@codemirror/lang-markdown";
import { EditorState } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { describe, expect, it } from "vitest";
import { LinkResolver } from "@/lib/links";
import { livePreview } from "./livePreview";
import { defaultPreviewConfig, previewConfig } from "./previewConfig";

function makeView(doc: string, cursor: number): EditorView {
  const resolver = new LinkResolver(["attachments/pic.png", "Plan.md"]);
  return new EditorView({
    parent: document.body,
    state: EditorState.create({
      doc,
      selection: { anchor: cursor },
      extensions: [
        markdown({ base: markdownLanguage }),
        livePreview(),
        previewConfig.of({
          ...defaultPreviewConfig,
          notePath: "Plan.md",
          resolveLink: (t) => resolver.resolve(t),
          assetUrl: (p) => `asset://${p}`,
        }),
      ],
    }),
  });
}

describe("image widget", () => {
  const doc = "text\n\n![Chart](attachments/pic.png)\n\nend";

  it("shows the picture at the size written in the note", () => {
    const v = makeView("![Chart|400](attachments/pic.png)\n\nend", 36);
    const img = v.dom.querySelector<HTMLImageElement>("img.cm-image");
    expect(img?.alt).toBe("Chart");
    expect(img?.style.width).toBe("400px");
    v.destroy();
  });

  it("offers four sizes, and the current one is marked", () => {
    const v = makeView("![Chart|400](attachments/pic.png)\n\nend", 36);
    const buttons = [...v.dom.querySelectorAll<HTMLButtonElement>(".cm-image-sizes button")];
    expect(buttons.map((b) => b.textContent)).toEqual(["Small", "Medium", "Large", "Original"]);
    expect(buttons.map((b) => b.getAttribute("aria-pressed"))).toEqual([
      "false",
      "true",
      "false",
      "false",
    ]);
    v.destroy();
  });

  it("choosing a size writes it into the note", () => {
    const v = makeView(doc, doc.length);
    const large = [...v.dom.querySelectorAll<HTMLButtonElement>(".cm-image-sizes button")].find(
      (b) => b.textContent === "Large",
    );
    large?.click();
    expect(v.state.doc.toString()).toBe("text\n\n![Chart|800](attachments/pic.png)\n\nend");
    v.destroy();
  });

  it("Original removes the size again, and short embeds work too", () => {
    const sized = "![[pic.png|400]]\n\nend";
    const v = makeView(sized, sized.length);
    [...v.dom.querySelectorAll<HTMLButtonElement>(".cm-image-sizes button")]
      .find((b) => b.textContent === "Original")
      ?.click();
    expect(v.state.doc.toString()).toBe("![[pic.png]]\n\nend");
    v.destroy();
  });
});
