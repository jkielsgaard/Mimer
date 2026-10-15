import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

/** Merges Tailwind class names. */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}

/** Folder part of a vault path ("" for root). */
export function dirname(path: string): string {
  const i = path.lastIndexOf("/");
  return i < 0 ? "" : path.slice(0, i);
}

/** Last segment of a path. */
export function basename(path: string): string {
  const i = path.lastIndexOf("/");
  return i < 0 ? path : path.slice(i + 1);
}

/** Joins vault path segments, skipping empty ones. */
export function joinPath(...parts: string[]): string {
  return parts.filter((p) => p !== "").join("/");
}

/** File name without the `.md` extension. */
export function noteTitle(path: string): string {
  return basename(path).replace(/\.md$/i, "");
}

export function isMarkdown(path: string): boolean {
  return /\.md$/i.test(path);
}

export function isImage(path: string): boolean {
  return /\.(png|jpe?g|gif|webp|svg|bmp|avif)$/i.test(path);
}

/** True when `path` is `folder` or lies inside it. */
export function isInside(path: string, folder: string): boolean {
  return folder === "" || path === folder || path.startsWith(`${folder}/`);
}

/** Relative time like "5 minutes ago". */
export function relativeTime(seconds: number, now: number = Date.now()): string {
  const diff = Math.max(0, Math.round(now / 1000 - seconds));
  if (diff < 45) return "just now";
  const units: [number, string][] = [
    [60, "minute"],
    [3600, "hour"],
    [86400, "day"],
    [2592000, "month"],
    [31536000, "year"],
  ];
  let value = diff / 60;
  let label = "minute";
  for (const [size, name] of units) {
    if (diff >= size) {
      value = diff / size;
      label = name;
    }
  }
  const n = Math.max(1, Math.floor(value));
  return `${n} ${label}${n === 1 ? "" : "s"} ago`;
}

/**
 * Resolves a relative link from a note (`../attachments/a%20b.png`) to a vault path.
 * Returns `null` when it escapes the vault or is not a relative path.
 */
export function resolveRelativePath(notePath: string, href: string): string | null {
  if (/^[a-z][a-z0-9+.-]*:/i.test(href) || href.startsWith("#") || href.startsWith("//"))
    return null;
  let decoded = href;
  try {
    decoded = decodeURIComponent(href);
  } catch {
    /* keep as is */
  }
  const clean = (decoded.split("#")[0] ?? "").split("?")[0] ?? "";
  const parts = clean.startsWith("/")
    ? []
    : dirname(notePath)
        .split("/")
        .filter((p) => p !== "");
  for (const seg of clean.split("/")) {
    if (seg === "" || seg === ".") continue;
    if (seg === "..") {
      if (parts.length === 0) return null;
      parts.pop();
    } else {
      parts.push(seg);
    }
  }
  return parts.length === 0 ? null : parts.join("/");
}
