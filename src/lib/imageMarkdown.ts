/** Picture sizes offered in the note: width in pixels, or null for the original size. */
export const IMAGE_SIZES: readonly { id: string; label: string; width: number | null }[] = [
  { id: "small", label: "Small", width: 200 },
  { id: "medium", label: "Medium", width: 400 },
  { id: "large", label: "Large", width: 800 },
  { id: "original", label: "Original", width: null },
];

/** How inserted images are written in the note. */
export type ImageLinkStyle = "markdown" | "wiki";

/** Link from a note to a vault file: `../` for every folder level, spaces as `%20`. */
export function relativeLink(notePath: string, targetPath: string): string {
  const depth = notePath.split("/").length - 1;
  return `${"../".repeat(depth)}${targetPath}`.replace(/ /g, "%20");
}

/**
 * The text to insert for a picture. `markdown` is `![alt](relative/path)` and works in every
 * Markdown editor; `wiki` is `![[name]]`, which survives moving the note.
 * `shortName` gives the shortest unambiguous name for the picture's vault path.
 */
export function imageMarkdown(
  style: ImageLinkStyle,
  notePath: string,
  vaultPath: string,
  shortName: (path: string) => string,
  alt = "",
): string {
  return style === "wiki"
    ? `![[${shortName(vaultPath)}]]`
    : `![${alt}](${relativeLink(notePath, vaultPath)})`;
}

/** Splits `text|400` (the alt text of a sized picture) into the text and the width. */
export function parseSizedAlt(alt: string): { text: string; width: number | null } {
  const m = /^(.*)\|(\d{2,4})$/s.exec(alt);
  return m ? { text: m[1] ?? "", width: Number(m[2]) } : { text: alt, width: null };
}

/** The width in a wiki embed's alias (`|400`), or null. */
export function widthFromAlias(alias: string | null): number | null {
  const m = alias === null ? null : /^\|(\d{2,4})$/.exec(alias.trim());
  return m ? Number(m[1]) : null;
}

/**
 * The picture syntax at the start of `syntax` with its width set (or removed for `null`):
 * `![alt](url)` gets `![alt|400](url)`, `![[name]]` gets `![[name|400]]`. Returns the new text
 * and how much of the old text it replaces, or null when `syntax` does not start with a picture.
 */
export function withImageWidth(
  syntax: string,
  width: number | null,
): { text: string; replaces: number } | null {
  const md = /^!\[([^\]]*)\]\(([^)]*)\)/.exec(syntax);
  if (md) {
    const alt = parseSizedAlt(md[1] ?? "").text;
    const sized = width === null ? alt : `${alt}|${String(width)}`;
    return { text: `![${sized}](${md[2] ?? ""})`, replaces: md[0].length };
  }
  const wiki = /^!\[\[([^\]|]+)(?:\|[^\]]*)?\]\]/.exec(syntax);
  if (wiki) {
    const target = wiki[1] ?? "";
    return {
      text: width === null ? `![[${target}]]` : `![[${target}|${String(width)}]]`,
      replaces: wiki[0].length,
    };
  }
  return null;
}
