import { basename, isImage, isMarkdown } from "@/lib/utils";
import { imageMarkdown, relativeLink, type ImageLinkStyle } from "@/lib/imageMarkdown";

/**
 * The text to insert when a file from the file tree is dropped into a note: a `[[wiki-link]]` for
 * a note, an image for a picture, a plain link for other files. Null for folders and unknown paths.
 */
export function linkForDroppedPath(
  path: string,
  notePath: string,
  files: readonly string[],
  style: ImageLinkStyle,
  shortName: (path: string) => string,
): string | null {
  if (!files.includes(path) || path === notePath) return null;
  if (isMarkdown(path)) return `[[${shortName(path)}]]`;
  if (isImage(path)) {
    const stem = basename(path).replace(/\.[^.]+$/, "");
    return imageMarkdown(style, notePath, path, shortName, stem);
  }
  return `[${basename(path)}](${relativeLink(notePath, path)})`;
}
