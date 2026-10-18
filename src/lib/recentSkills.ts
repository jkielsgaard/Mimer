const KEY = "mimer.recentSkills";
const MAX = 6;

/** The ids of the skills used most recently, newest first. Kept in this browser only. */
export function recentSkillIds(): string[] {
  try {
    const raw = localStorage.getItem(KEY);
    const list: unknown = raw === null ? [] : JSON.parse(raw);
    return Array.isArray(list) ? list.filter((x): x is string => typeof x === "string") : [];
  } catch {
    return [];
  }
}

/** Remembers that a skill was just used. */
export function pushRecentSkill(id: string): void {
  try {
    const next = [id, ...recentSkillIds().filter((x) => x !== id)].slice(0, MAX);
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    /* storage can be blocked; recent skills are only a convenience */
  }
}
