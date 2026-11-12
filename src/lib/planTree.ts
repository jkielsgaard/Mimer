/**
 * A plan is an ordinary note (with the tag `plan`) whose ideas are a nested list. Everything before
 * the list (the properties, the heading, a few lines about the plan) and everything after it is
 * kept exactly as it is; only the list is read and written here. A list item that is a checklist
 * line (`- [ ] …`) is a task, not an idea, and ends the list.
 */

/** What the area is called in the left bar, the menus and the help. One word, changed here only. */
export const PLANS_LABEL = "Plans";

export interface PlanNode {
  /** The line of the idea without its marker: the words, and the `[[links]]` that tie it to a note. */
  text: string;
  children: PlanNode[];
}

export interface ParsedPlan {
  /** The lines before the first idea. */
  head: string[];
  nodes: PlanNode[];
  /** The lines after the list. */
  tail: string[];
}

/** Where an idea is: the index at each level, from the top (`[2, 0]` is the first child of the third idea). */
export type NodePath = readonly number[];

const ITEM = /^(\s*)[-*+]\s+(.*)$/;
const CHECK = /^\[[ xX]\](\s|$)/;

function indentOf(ws: string): number {
  return ws.replace(/\t/g, "    ").length;
}

/** An idea line: its indentation and its words, or null for any other line. */
function itemOf(line: string): { indent: number; text: string } | null {
  const m = ITEM.exec(line);
  if (!m) return null;
  const text = (m[2] ?? "").trim();
  if (CHECK.test(text)) return null;
  return { indent: indentOf(m[1] ?? ""), text };
}

/** Reads the ideas of a plan note. */
export function parsePlan(content: string): ParsedPlan {
  const lines = content.split("\n");
  const first = lines.findIndex((l) => itemOf(l) !== null);
  if (first === -1) return { head: lines, nodes: [], tail: [] };
  const nodes: PlanNode[] = [];
  const stack: { indent: number; node: PlanNode }[] = [];
  let end = first;
  for (let i = first; i < lines.length; i++) {
    const line = lines[i] ?? "";
    const item = itemOf(line);
    if (item === null) {
      // A blank line inside the list is fine when another idea follows it.
      const next = lines.slice(i + 1).find((l) => l.trim() !== "");
      if (line.trim() === "" && next !== undefined && itemOf(next) !== null) continue;
      break;
    }
    end = i + 1;
    if (item.text === "") continue;
    while (stack.length > 0 && (stack[stack.length - 1]?.indent ?? 0) >= item.indent) stack.pop();
    const node: PlanNode = { text: item.text, children: [] };
    const parent = stack[stack.length - 1]?.node;
    if (parent) parent.children.push(node);
    else nodes.push(node);
    stack.push({ indent: item.indent, node });
  }
  return { head: lines.slice(0, first), nodes, tail: lines.slice(end) };
}

function linesOf(nodes: readonly PlanNode[], depth: number): string[] {
  return nodes.flatMap((n) => [
    `${"  ".repeat(depth)}- ${n.text}`,
    ...linesOf(n.children, depth + 1),
  ]);
}

/**
 * Reads pasted text as ideas: one idea on each line, a smaller part indented under a bigger one
 * (with tabs or spaces). A leading `-`, `*`, `•` or `1.` is dropped.
 */
export function parseIndentedText(text: string): PlanNode[] {
  const lines = text
    .split(/\r?\n/)
    .filter((l) => l.trim() !== "")
    .map((l) => {
      const lead = /^[ \t]*/.exec(l)?.[0] ?? "";
      const width = lead.length + (lead.split("\t").length - 1) * 3;
      const body = l
        .trim()
        .replace(/^([-*•]|\d+[.)])\s+/, "")
        .trim();
      return { width, body };
    })
    .filter((l) => l.body !== "");
  return parsePlan(
    lines.map((l) => `- ${l.body}`.padStart(l.body.length + 2 + l.width, " ")).join("\n"),
  ).nodes;
}

/** The note text of a plan: the head, the ideas as a list, the tail. */
export function serializePlan(p: ParsedPlan): string {
  return [...p.head, ...linesOf(p.nodes, 0), ...p.tail].join("\n");
}

/** The first heading of the note (`# Title`), or `fallback`. */
export function planTitle(content: string, fallback: string): string {
  const m = /^#\s+(.+?)\s*#*\s*$/m.exec(content);
  return m?.[1]?.trim() || fallback;
}

// --- the words of an idea ---------------------------------------------------------------------

const LINK = /\[\[([^\]|]+)(?:\|[^\]]*)?\]\]/g;

/** The words of an idea, and the notes it links to (the targets of its `[[links]]`). */
export function splitText(text: string): { plain: string; links: string[] } {
  const links: string[] = [];
  const plain = text
    .replace(LINK, (_m, target: string) => {
      links.push(target.trim());
      return " ";
    })
    .replace(/\s+/g, " ")
    .trim();
  return { plain, links };
}

/** The line of an idea from its words and links. */
export function joinText(plain: string, links: readonly string[]): string {
  return [plain.trim(), ...links.map((l) => `[[${l}]]`)].filter((x) => x !== "").join(" ");
}

// --- changing the ideas (nothing is changed in place) -----------------------------------------

function copy(nodes: readonly PlanNode[]): PlanNode[] {
  return nodes.map((n) => ({ text: n.text, children: copy(n.children) }));
}

/** The idea at `path`, or undefined. */
export function nodeAt(nodes: readonly PlanNode[], path: NodePath): PlanNode | undefined {
  let list: readonly PlanNode[] = nodes;
  let node: PlanNode | undefined;
  for (const i of path) {
    node = list[i];
    if (!node) return undefined;
    list = node.children;
  }
  return node;
}

/** The list that holds the idea at `path` (the ideas themselves for a top-level one). */
function siblings(nodes: PlanNode[], path: NodePath): PlanNode[] | undefined {
  if (path.length <= 1) return nodes;
  return nodeAt(nodes, path.slice(0, -1))?.children;
}

/** Adds an idea as the last child of the idea at `parent` (the top level when it is empty). */
export function addChild(
  nodes: readonly PlanNode[],
  parent: NodePath,
  text: string,
): { nodes: PlanNode[]; path: NodePath } {
  const next = copy(nodes);
  const list = parent.length === 0 ? next : nodeAt(next, parent)?.children;
  if (!list) return { nodes: next, path: [] };
  list.push({ text, children: [] });
  return { nodes: next, path: [...parent, list.length - 1] };
}

/** Adds an idea right after the idea at `path`, on the same level. */
export function addAfter(
  nodes: readonly PlanNode[],
  path: NodePath,
  text: string,
): { nodes: PlanNode[]; path: NodePath } {
  const next = copy(nodes);
  const list = siblings(next, path);
  const at = path[path.length - 1];
  if (!list || at === undefined) return { nodes: next, path: [] };
  list.splice(at + 1, 0, { text, children: [] });
  return { nodes: next, path: [...path.slice(0, -1), at + 1] };
}

/** Puts a ready-made idea (with its children) right after the idea at `path`, on the same level. */
export function insertAfter(
  nodes: readonly PlanNode[],
  path: NodePath,
  node: PlanNode,
): { nodes: PlanNode[]; path: NodePath } {
  const next = copy(nodes);
  const list = siblings(next, path);
  const at = path[path.length - 1];
  if (!list || at === undefined) return { nodes: next, path: [] };
  list.splice(at + 1, 0, copy([node])[0] ?? node);
  return { nodes: next, path: [...path.slice(0, -1), at + 1] };
}

/** Changes the line of an idea. */
export function setText(nodes: readonly PlanNode[], path: NodePath, text: string): PlanNode[] {
  const next = copy(nodes);
  const n = nodeAt(next, path);
  if (n) n.text = text;
  return next;
}

/** Takes the idea at `path` out, with everything under it. */
export function removeAt(nodes: readonly PlanNode[], path: NodePath): PlanNode[] {
  const next = copy(nodes);
  const list = siblings(next, path);
  const at = path[path.length - 1];
  if (list && at !== undefined) list.splice(at, 1);
  return next;
}

/** Takes several ideas out at once. Their paths are those of the list as it is now. */
export function removeMany(nodes: readonly PlanNode[], paths: readonly NodePath[]): PlanNode[] {
  const order = [...paths].sort((a, b) => {
    for (let i = 0; i < Math.max(a.length, b.length); i++) {
      const d = (b[i] ?? -1) - (a[i] ?? -1);
      if (d !== 0) return d;
    }
    return 0;
  });
  return order.reduce<PlanNode[]>((acc, p) => removeAt(acc, p), copy(nodes));
}

/** Moves the idea one place up (`-1`) or down (`1`) among those on its level. */
export function moveBy(
  nodes: readonly PlanNode[],
  path: NodePath,
  delta: -1 | 1,
): { nodes: PlanNode[]; path: NodePath } {
  const next = copy(nodes);
  const list = siblings(next, path);
  const at = path[path.length - 1];
  if (!list || at === undefined) return { nodes: next, path };
  const to = at + delta;
  if (to < 0 || to >= list.length) return { nodes: next, path };
  const [n] = list.splice(at, 1);
  if (n) list.splice(to, 0, n);
  return { nodes: next, path: [...path.slice(0, -1), to] };
}

/** Makes the idea a child of the one before it. */
export function indentAt(
  nodes: readonly PlanNode[],
  path: NodePath,
): { nodes: PlanNode[]; path: NodePath } {
  const at = path[path.length - 1];
  if (at === undefined || at === 0) return { nodes: copy(nodes), path };
  const next = copy(nodes);
  const list = siblings(next, path);
  const before = list?.[at - 1];
  const [n] = list?.splice(at, 1) ?? [];
  if (!before || !n) return { nodes: copy(nodes), path };
  before.children.push(n);
  return { nodes: next, path: [...path.slice(0, -1), at - 1, before.children.length - 1] };
}

/** Makes the idea a sibling of its parent, right after it. */
export function outdentAt(
  nodes: readonly PlanNode[],
  path: NodePath,
): { nodes: PlanNode[]; path: NodePath } {
  if (path.length < 2) return { nodes: copy(nodes), path };
  const next = copy(nodes);
  const list = siblings(next, path);
  const at = path[path.length - 1];
  if (!list || at === undefined) return { nodes: copy(nodes), path };
  const [n] = list.splice(at, 1);
  const parentPath = path.slice(0, -1);
  const upper = siblings(next, parentPath);
  const pAt = parentPath[parentPath.length - 1];
  if (!n || !upper || pAt === undefined) return { nodes: copy(nodes), path };
  upper.splice(pAt + 1, 0, n);
  return { nodes: next, path: [...parentPath.slice(0, -1), pAt + 1] };
}

/** Every idea with its path, in the order of the list. */
export function walk(
  nodes: readonly PlanNode[],
  prefix: NodePath = [],
): { path: NodePath; node: PlanNode }[] {
  return nodes.flatMap((node, i) => {
    const path = [...prefix, i];
    return [{ path, node }, ...walk(node.children, path)];
  });
}

/** `a` and `b` are the same place. */
export function samePath(a: NodePath | null, b: NodePath | null): boolean {
  return a !== null && b !== null && a.length === b.length && a.every((x, i) => x === b[i]);
}

/** How many ideas there are, all levels together. */
export function countNodes(nodes: readonly PlanNode[]): number {
  return nodes.reduce((n, x) => n + 1 + countNodes(x.children), 0);
}

/** The tags in the properties of a note (`tags: [a, b]` or a list), lower case. */
export function frontTags(content: string): string[] {
  const fm = /^---\r?\n([\s\S]*?)\r?\n---/.exec(content);
  if (!fm?.[1]) return [];
  const lines = fm[1].split(/\r?\n/);
  const at = lines.findIndex((l) => /^tags\s*:/i.test(l));
  if (at === -1) return [];
  const rest = (lines[at] ?? "").replace(/^tags\s*:/i, "").trim();
  if (rest !== "") {
    return rest
      .replace(/^\[|\]$/g, "")
      .split(",")
      .map((t) =>
        t
          .trim()
          .replace(/^["']|["']$/g, "")
          .toLowerCase(),
      )
      .filter((t) => t !== "");
  }
  const out: string[] = [];
  for (const l of lines.slice(at + 1)) {
    const m = /^\s*-\s+(.+)$/.exec(l);
    if (!m?.[1]) break;
    out.push(
      m[1]
        .trim()
        .replace(/^["']|["']$/g, "")
        .toLowerCase(),
    );
  }
  return out;
}
