import type { ProposalAction } from "@/bindings/ProposalAction";
import type { ProposalView } from "@/bindings/ProposalView";
import { dirname } from "@/lib/utils";

export type KindFilter = "all" | ProposalAction;

export interface ProposalGroup {
  key: string;
  label: string;
  items: ProposalView[];
}

/** The group a proposal is listed under: moves by destination folder, the rest by kind. */
export function groupLabel(v: ProposalView): string {
  const p = v.proposal;
  switch (p.action) {
    case "move": {
      const folder = dirname(p.newPath ?? "");
      return folder === "" ? "Moved to the vault root" : `Moved to ${folder}`;
    }
    case "edit":
      return "Edited notes";
    case "create":
      return "New notes";
    case "delete":
      return "Deleted notes";
  }
}

/** The proposals of the chosen kind, grouped in the order the groups first appear. */
export function groupProposals(
  items: readonly ProposalView[],
  filter: KindFilter,
): ProposalGroup[] {
  const groups: ProposalGroup[] = [];
  for (const v of items) {
    if (filter !== "all" && v.proposal.action !== filter) continue;
    const label = groupLabel(v);
    let g = groups.find((x) => x.key === label);
    if (!g) {
      g = { key: label, label, items: [] };
      groups.push(g);
    }
    g.items.push(v);
  }
  return groups;
}

/** How many proposals of each kind there are. */
export function countByKind(items: readonly ProposalView[]): Record<ProposalAction, number> {
  const n: Record<ProposalAction, number> = { edit: 0, create: 0, move: 0, delete: 0 };
  for (const v of items) n[v.proposal.action] += 1;
  return n;
}

/** The first non-empty lines of a note, for a quick look. */
export function firstLines(text: string, max = 6): string {
  return text
    .split("\n")
    .filter((l) => l.trim() !== "")
    .slice(0, max)
    .join("\n");
}
