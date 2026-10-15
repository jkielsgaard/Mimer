/** A ready-made job for Mimer. Choosing one puts its prompt in the message box. */
export interface MimerTask {
  id: string;
  title: string;
  /** One line shown under the title in the menu. */
  hint: string;
  prompt: string;
}

/**
 * The jobs offered in the Tasks menu. Each prompt works on the attached notes and folders, or on
 * the current note when nothing is attached, and never asks Mimer to invent facts.
 */
export const TASKS: readonly MimerTask[] = [
  {
    id: "merge",
    title: "Merge notes",
    hint: "Combine the attached notes into one",
    prompt:
      "Merge the attached notes into one note. Keep all information, remove duplicates, order it logically with clear headings, and propose deleting the notes that were merged.",
  },
  {
    id: "structure",
    title: "Propose a structure",
    hint: "A better folder and note layout",
    prompt:
      "Look at the attached folder or notes and propose a clearer structure: which folders and notes should exist and what should move where. Explain the idea first, then propose the moves.",
  },
  {
    id: "split",
    title: "Split a long note",
    hint: "One note per heading, plus an index",
    prompt:
      "Split the note into one note per main heading, and create an index note that links to all of them. Keep the original text as it is.",
  },
  {
    id: "summarise",
    title: "Summarise",
    hint: "A short overview note",
    prompt:
      "Write a short summary of the attached notes as a new note. Only use what is in the notes, and link to each source note.",
  },
  {
    id: "proofread",
    title: "Fix spelling and grammar",
    hint: "Correct the text, keep the meaning",
    prompt:
      "Fix spelling and grammar in the attached notes. Do not change the meaning, the structure, the links or the tags.",
  },
  {
    id: "duplicates",
    title: "Find duplicates and overlaps",
    hint: "Notes that cover the same thing",
    prompt:
      "Find notes among the attached ones that cover the same subject or repeat each other. List them and say how they overlap. Then propose merging the ones that clearly belong together.",
  },
  {
    id: "index",
    title: "Create an index page",
    hint: "A table of contents with links",
    prompt:
      "Create an index note for the attached folder with a short description and a link to every note, grouped by subject.",
  },
  {
    id: "links",
    title: "Add links between notes",
    hint: "Connect related notes with [[links]]",
    prompt:
      "Find places in the attached notes where another note in the vault is mentioned or clearly related, and propose adding [[wiki-links]] to it. Change nothing else.",
  },
  {
    id: "actions",
    title: "Collect action items",
    hint: "Tasks from meeting notes into one list",
    prompt:
      "Collect all action items and decisions from the attached notes into one new note, as a task list grouped by note. Include who owns each item if the notes say so.",
  },
  {
    id: "tidy",
    title: "Tidy up formatting",
    hint: "Consistent headings, lists and tags",
    prompt:
      "Tidy up the formatting of the attached notes: consistent heading levels, lists and spacing, and tags in the front matter. Do not change the wording.",
  },
];
