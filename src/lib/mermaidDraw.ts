let counter = 0;

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
