import { EditorView, WidgetType } from "@codemirror/view";

let counter = 0;

/** The code inside a fenced block that is written with the language `mermaid`, or null. */
export function mermaidSource(block: string): string | null {
  const lines = block.split("\n");
  const open = /^\s*(```|~~~)\s*mermaid\b/i.exec(lines[0] ?? "");
  if (!open) return null;
  const fence = open[1] ?? "```";
  const last = lines.length > 1 ? (lines[lines.length - 1] ?? "") : "";
  const end = last.trim().startsWith(fence) ? lines.length - 1 : lines.length;
  const source = lines.slice(1, end).join("\n").trim();
  return source === "" ? null : source;
}

/**
 * A Mermaid diagram drawn in place of its code while the cursor is somewhere else. The library is
 * loaded the first time a note has a diagram, and draws on this computer. A diagram with a mistake
 * shows what is wrong and its code. Clicking the picture puts the cursor in the code.
 */
export class MermaidWidget extends WidgetType {
  constructor(readonly source: string) {
    super();
  }

  eq(other: MermaidWidget): boolean {
    return other.source === this.source;
  }

  toDOM(view: EditorView): HTMLElement {
    const box = document.createElement("div");
    box.className = "cm-mermaid";
    box.setAttribute("role", "img");
    box.setAttribute("aria-label", "Diagram. Click to edit its code.");
    box.title = "Click to edit the diagram's code";
    box.textContent = "Drawing the diagram…";
    box.addEventListener("mousedown", (e) => {
      e.preventDefault();
      const pos = view.posAtDOM(box);
      view.dispatch({ selection: { anchor: pos } });
      view.focus();
    });
    void draw(box, this.source);
    return box;
  }

  ignoreEvent(): boolean {
    return false;
  }
}

/** Draws the diagram into `box`, or says what is wrong with it. Exported for tests. */
export async function draw(box: HTMLElement, source: string): Promise<void> {
  try {
    const { default: mermaid } = await import("mermaid");
    mermaid.initialize({
      startOnLoad: false,
      // Strict: the library cleans what it draws, so a diagram cannot run anything.
      securityLevel: "strict",
      theme: document.documentElement.classList.contains("dark") ? "dark" : "default",
    });
    counter += 1;
    const { svg } = await mermaid.render(`mimer-mermaid-${String(counter)}`, source);
    box.innerHTML = svg;
  } catch (e) {
    const message = e instanceof Error ? e.message.split("\n")[0] : "The diagram has a mistake";
    box.textContent = "";
    const msg = document.createElement("p");
    msg.className = "cm-mermaid-error";
    msg.textContent = `This diagram cannot be drawn: ${message ?? "it has a mistake"}`;
    const code = document.createElement("pre");
    code.textContent = source;
    box.append(msg, code);
  }
}
