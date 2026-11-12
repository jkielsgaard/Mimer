import { useEffect, useRef } from "react";
import { draw } from "@/lib/mermaidDraw";

/**
 * A Mermaid diagram drawn from its code, on this computer. A diagram with a mistake shows what is
 * wrong and its code. Used where a diagram is proposed before it is written anywhere.
 */
export function DiagramPreview({ source }: { source: string }) {
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    el.textContent = "Drawing the diagram…";
    void draw(el, source);
  }, [source]);
  return (
    <div
      ref={box}
      role="img"
      aria-label="The diagram"
      className="diagram-preview max-h-80 overflow-auto p-2 text-sm [&_svg]:mx-auto [&_svg]:h-auto [&_svg]:max-w-full"
    />
  );
}
