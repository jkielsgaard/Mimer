// Frontend mirror of the backend link resolver (src-tauri/src/links/resolve.rs).
// The editor needs synchronous resolution to style resolved/unresolved links.
import { basename, isMarkdown } from "./utils";

function stem(path: string): string {
  return basename(path).replace(/\.md$/i, "");
}

function pick(paths: string[] | undefined): string | null {
  if (!paths || paths.length === 0) return null;
  const sorted = [...paths].sort((a, b) => a.length - b.length || (a < b ? -1 : a > b ? 1 : 0));
  return sorted[0] ?? null;
}

function push(map: Map<string, string[]>, key: string, value: string): void {
  const list = map.get(key);
  if (list) list.push(value);
  else map.set(key, [value]);
}

export class LinkResolver {
  private readonly byStem = new Map<string, string[]>();
  private readonly byFilename = new Map<string, string[]>();
  private readonly byPath = new Map<string, string>();

  constructor(files: readonly string[]) {
    for (const f of files) {
      this.byPath.set(f.toLowerCase(), f);
      push(this.byFilename, basename(f).toLowerCase(), f);
      if (isMarkdown(f)) push(this.byStem, stem(f).toLowerCase(), f);
    }
  }

  /** Resolves a wiki-link target to a vault path (path form, else shortest-path name match). */
  resolve(target: string): string | null {
    const t = target.trim();
    if (t === "") return null;
    if (t.includes("/")) {
      const lower = t.replace(/^\/+/, "").toLowerCase();
      return this.byPath.get(lower) ?? this.byPath.get(`${lower}.md`) ?? null;
    }
    const lower = t.toLowerCase();
    return pick(this.byStem.get(lower)) ?? pick(this.byFilename.get(lower));
  }

  /** True when the vault has a file at exactly this path (letter case ignored). */
  has(path: string): boolean {
    return this.byPath.has(path.toLowerCase());
  }

  /** Shortest unambiguous link text for a file: name if unique, otherwise path. */
  shortestForm(path: string): string {
    if (isMarkdown(path)) {
      const count = this.byStem.get(stem(path).toLowerCase())?.length ?? 0;
      return count <= 1 ? stem(path) : path.slice(0, -3);
    }
    const count = this.byFilename.get(basename(path).toLowerCase())?.length ?? 0;
    return count <= 1 ? basename(path) : path;
  }
}

function isSubsequence(needle: string, hay: string): boolean {
  let i = 0;
  for (const ch of hay) {
    if (ch === needle[i]) i++;
    if (i === needle.length) return true;
  }
  return needle.length === 0;
}

/** Fuzzy-filters link targets (name or path) for `[[` autocomplete. Best matches first. */
export function filterLinkTargets(files: readonly string[], query: string, limit = 50): string[] {
  const resolver = new LinkResolver(files);
  const q = query.trim().toLowerCase();
  const scored: [number, string][] = [];
  for (const f of files) {
    if (q === "" && !isMarkdown(f)) continue;
    const form = resolver.shortestForm(f);
    const name = form.toLowerCase();
    const path = f.toLowerCase();
    let rank: number;
    if (q === "" || name.startsWith(q)) rank = 0;
    else if (name.includes(q)) rank = 1;
    else if (path.includes(q)) rank = 2;
    else if (isSubsequence(q, path)) rank = 3;
    else continue;
    scored.push([rank, form]);
  }
  scored.sort((a, b) => a[0] - b[0] || a[1].length - b[1].length || a[1].localeCompare(b[1]));
  const seen = new Set<string>();
  const out: string[] = [];
  for (const [, form] of scored) {
    if (seen.has(form)) continue;
    seen.add(form);
    out.push(form);
    if (out.length >= limit) break;
  }
  return out;
}

/** Flattens a tree into file paths. */
export function flattenTree(
  nodes: readonly { path: string; isDir: boolean; children: readonly unknown[] }[],
): string[] {
  const out: string[] = [];
  const walk = (
    list: readonly { path: string; isDir: boolean; children: readonly unknown[] }[],
  ): void => {
    for (const n of list) {
      if (n.isDir) walk(n.children as typeof list);
      else out.push(n.path);
    }
  };
  walk(nodes);
  return out;
}
