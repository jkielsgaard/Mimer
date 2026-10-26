import { basename, dirname } from "@/lib/utils";

/** The text of the first top-level heading (`# Title`) after any frontmatter, or null. */
export function firstHeading(content: string): string | null {
  let body = content;
  if (body.startsWith("---")) {
    const end = /\n---\s*(\n|$)/.exec(body.slice(3));
    if (end) body = body.slice(3 + end.index + end[0].length);
  }
  let inFence = false;
  for (const line of body.split("\n")) {
    if (/^\s*(```|~~~)/.test(line)) {
      inFence = !inFence;
      continue;
    }
    if (inFence) continue;
    const m = /^#\s+(.+?)\s*#*\s*$/.exec(line);
    if (m?.[1]) return cleanTitle(m[1]);
  }
  return null;
}

/** Plain text of a heading: link and emphasis marks removed. */
function cleanTitle(text: string): string {
  return text
    .replace(/\[\[([^\]|]+)\|([^\]]+)\]\]/g, "$2")
    .replace(/\[\[([^\]]+)\]\]/g, "$1")
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/[*`~]|(^|\s)_|_(\s|$)/g, "$1$2")
    .trim();
}

const RESERVED = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i;

/**
 * A file name (without `.md`) for a title: characters the system does not allow are removed,
 * spaces are tidied, and the length is limited. Null when nothing usable is left.
 */
export function fileNameFromTitle(title: string): string | null {
  const cleaned = title
    // eslint-disable-next-line no-control-regex
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/[. ]+$/, "")
    .slice(0, 80)
    .trim();
  if (cleaned === "" || cleaned.startsWith(".")) return null;
  return RESERVED.test(cleaned.split(".")[0] ?? "") ? `${cleaned}_` : cleaned;
}

/**
 * The path for a note named `base` in `folder`: `Base.md`, or `Base 2.md`, `Base 3.md` … when a
 * different file already has that name (compared without regard to case). `current` is the
 * note being renamed and does not count as a clash.
 */
export function uniqueNotePath(
  folder: string,
  base: string,
  files: readonly string[],
  current: string,
): string {
  const taken = new Set(files.filter((f) => f !== current).map((f) => f.toLowerCase()));
  const join = (name: string): string => (folder === "" ? `${name}.md` : `${folder}/${name}.md`);
  let candidate = join(base);
  for (let n = 2; taken.has(candidate.toLowerCase()); n++) candidate = join(`${base} ${String(n)}`);
  return candidate;
}

/**
 * The new path for a note that follows its title, or null when nothing should change (no
 * heading yet, or the name already matches).
 */
export function planTitleRename(
  path: string,
  content: string,
  files: readonly string[],
): string | null {
  const title = firstHeading(content);
  const base = title === null ? null : fileNameFromTitle(title);
  if (base === null) return null;
  const target = uniqueNotePath(dirname(path), base, files, path);
  return target === path ? null : target;
}

/** True for the names the app gives new notes: `Untitled.md`, `Untitled 1.md` … */
export function isUntitledName(path: string): boolean {
  return /^Untitled( \d+)?\.md$/i.test(basename(path));
}

/** A file name from a title: no characters or endings a file cannot have. */
export function fileNameFrom(title: string): string {
  return fileNameFromTitle(title.replace(/#/g, " ")) ?? "Untitled";
}
