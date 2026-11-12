import type { EditorSettings } from "@/bindings/EditorSettings";

/** What the person can choose for reading, with the words kept in the settings file. */
export const LINE_SPACINGS = [
  { id: "normal", label: "Normal", value: "1.65" },
  { id: "roomy", label: "Roomy", value: "1.9" },
  { id: "extra", label: "Extra roomy", value: "2.2" },
] as const;

export const LETTER_SPACINGS = [
  { id: "normal", label: "Normal", value: "normal" },
  { id: "wide", label: "Wide", value: "0.04em" },
] as const;

export const TEXT_FONTS = [
  {
    id: "system",
    label: "System",
    value: "ui-sans-serif, system-ui, -apple-system, 'Segoe UI', sans-serif",
  },
  { id: "serif", label: "Serif", value: "ui-serif, Georgia, Cambria, 'Times New Roman', serif" },
  {
    id: "mono",
    label: "Monospace",
    value: "ui-monospace, SFMono-Regular, Menlo, Consolas, 'Liberation Mono', monospace",
  },
] as const;

/** The value of the choice with this id; the first one for a word that is not known. */
function pick(list: readonly { id: string; value: string }[], id: string): string {
  return (list.find((x) => x.id === id) ?? list[0])?.value ?? "";
}

/**
 * Makes the reading choices show: the space between lines and letters and the font as CSS
 * variables (the editor and the Markdown text read them), and whether the line you are in is
 * followed as an attribute on the page.
 */
export function applyReading(
  e: Pick<EditorSettings, "lineSpacing" | "letterSpacing" | "textFont" | "followLine">,
): void {
  const root = document.documentElement;
  root.style.setProperty("--read-line-height", pick(LINE_SPACINGS, e.lineSpacing));
  root.style.setProperty("--read-letter-spacing", pick(LETTER_SPACINGS, e.letterSpacing));
  root.style.setProperty("--read-font", pick(TEXT_FONTS, e.textFont));
  if (e.followLine) root.setAttribute("data-follow-line", "");
  else root.removeAttribute("data-follow-line");
}
