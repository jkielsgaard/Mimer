import type { SkillKind } from "@/bindings/SkillKind";
import type { SkillTarget } from "@/bindings/SkillTarget";

/** What should happen to the notes, in plain words. Each goal is one way Mimer carries it out. */
export const GOALS: Record<
  SkillKind,
  { title: string; text: string; group: string; example: string }
> = {
  fix: {
    title: "Fix small mistakes",
    text: "Spelling, grammar and wrong words. Only the wrong words are changed.",
    group: "Fix small mistakes",
    example: "Fix spelling and grammar. Keep my own words and the way I write.",
  },
  rewrite: {
    title: "Change the text in each note",
    text: "Translate, shorten, restructure. You get a before and after for every note.",
    group: "Change the text",
    example:
      "Translate the note to English. Keep the names of people and companies, and the links.",
  },
  sort: {
    title: "Move the notes into folders",
    text: "For sorting an import or a messy folder.",
    group: "Move into folders",
    example: "Sort the notes into these folders: Customers, Meetings, Tasks, Miscellaneous.",
  },
  create: {
    title: "Make one new note from them",
    text: "A summary, a task list, an overview.",
    group: "Make a new note",
    example: "Collect every task and decision into one list, with who does what.",
  },
  answer: {
    title: "Just answer me in the chat",
    text: "Nothing in the notes is changed.",
    group: "Answer in the chat",
    example: "Explain what the notes say in plain words. Only use what is in the notes.",
  },
};

export const GOAL_ORDER: SkillKind[] = ["fix", "rewrite", "sort", "create", "answer"];

/** Where a skill is offered in the file tree's right-click menu. */
export const TARGETS: Record<SkillTarget, { label: string; short: string }> = {
  note: { label: "A note", short: "Note" },
  folder: { label: "A folder (all the notes in it)", short: "Folder" },
  both: { label: "Notes and folders", short: "Note or folder" },
};
export const TARGET_ORDER: SkillTarget[] = ["note", "folder", "both"];

/** The usual place to offer a skill: sorting fits a folder, the rest fits both. */
export function defaultTarget(kind: SkillKind): SkillTarget {
  return kind === "sort" ? "folder" : "both";
}

/** A short name made from the first words of the description, for the user to change. */
export function nameFrom(description: string): string {
  const first = description.trim().split(/[.!?\n]/)[0] ?? "";
  const words = first.split(/\s+/).filter((w) => w !== "");
  let name = "";
  for (const w of words) {
    if ((name + " " + w).trim().length > 40) break;
    name = (name + " " + w).trim();
  }
  return name === "" ? "" : name.charAt(0).toUpperCase() + name.slice(1);
}
