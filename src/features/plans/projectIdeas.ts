import { joinText, type PlanNode } from "@/lib/planTree";
import { linkTarget } from "./nodeInfo";

const MAX_NOTES = 200;

/**
 * The notes of a project as ideas to start a plan from: a folder in the project becomes an idea
 * with its notes under it, and a note becomes an idea that links to it. Nothing is changed in the
 * project; `except` (the plan itself) is left out.
 */
export function projectIdeas(
  files: readonly string[],
  folder: string,
  except?: string,
): PlanNode[] {
  const prefix = `${folder}/`;
  const notes = files
    .filter((f) => f.startsWith(prefix) && /\.md$/i.test(f) && f !== except)
    .filter((f) => !f.split("/").some((p) => p.startsWith(".")))
    .sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }))
    .slice(0, MAX_NOTES);
  const root: PlanNode = { text: "", children: [] };
  const groups = new Map<string, PlanNode>();
  const groupOf = (dir: string): PlanNode => {
    if (dir === "") return root;
    const have = groups.get(dir);
    if (have) return have;
    const node: PlanNode = { text: dir.slice(dir.lastIndexOf("/") + 1), children: [] };
    const up = dir.includes("/") ? dir.slice(0, dir.lastIndexOf("/")) : "";
    groupOf(up).children.push(node);
    groups.set(dir, node);
    return node;
  };
  for (const f of notes) {
    const rest = f.slice(prefix.length);
    const dir = rest.includes("/") ? rest.slice(0, rest.lastIndexOf("/")) : "";
    const name = rest.slice(rest.lastIndexOf("/") + 1).replace(/\.md$/i, "");
    groupOf(dir).children.push({ text: joinText(name, [linkTarget(f)]), children: [] });
  }
  return root.children;
}
