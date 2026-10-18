import type { Skill } from "@/bindings/Skill";
import { fuzzyFilter } from "@/lib/fuzzy";
import { skillFits } from "@/lib/skills";

export type PaletteGroup = "Skills" | "Notes" | "Actions";

export interface PaletteItem {
  id: string;
  group: PaletteGroup;
  label: string;
  /** A short hint at the right: the kind of skill, the folder of a note, a shortcut. */
  hint?: string;
  run: () => void;
}

/** What a skill run from the palette works on: the open note, else the selected folder. */
export interface PaletteTarget {
  path: string;
  isDir: boolean;
  name: string;
}

/** The skills offered for the target, as palette items. */
export function skillItems(
  skills: readonly Skill[],
  target: PaletteTarget | null,
  run: (skill: Skill, target: PaletteTarget) => void,
): PaletteItem[] {
  if (target === null) return [];
  return skills
    .filter((s) => skillFits(s, target.isDir))
    .map((s) => ({
      id: `skill:${s.id}`,
      group: "Skills" as const,
      label: s.name,
      hint: s.description,
      run: () => {
        run(s, target);
      },
    }));
}

const ORDER: PaletteGroup[] = ["Skills", "Notes", "Actions"];

/**
 * The items to list for a query: skills and actions are matched by name, notes only when
 * something is typed (a vault can have thousands). Groups keep a fixed order.
 */
export function filterPalette(
  skills: readonly PaletteItem[],
  notes: readonly PaletteItem[],
  actions: readonly PaletteItem[],
  query: string,
): PaletteItem[] {
  const q = query.trim();
  const pick = (items: readonly PaletteItem[], limit: number): PaletteItem[] =>
    fuzzyFilter(items, q, (i) => i.label, limit);
  const by: Record<PaletteGroup, PaletteItem[]> = {
    Skills: pick(skills, q === "" ? 5 : 8),
    Notes: q === "" ? [] : pick(notes, 8),
    Actions: pick(actions, q === "" ? 8 : 6),
  };
  return ORDER.flatMap((g) => by[g]);
}
