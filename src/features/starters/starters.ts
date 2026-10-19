/** A question a starter asks. */
export interface StarterField {
  id: string;
  label: string;
  placeholder: string;
  /** Several lines: one item per line. */
  multiline?: boolean;
}

/** A ready-made kind of note: a few questions, and the note Mimer writes from the answers. */
export interface Starter {
  id: string;
  name: string;
  hint: string;
  /** Where the note goes: the meetings folder, the quick notes folder. */
  folder: "meetings" | "quick";
  title: (date: string) => string;
  fields: StarterField[];
  build: (title: string, date: string, v: Record<string, string>) => string;
}

/** An answer, or `[blank]` where nothing was written, so it is easy to find and fill in. */
function or(v: string | undefined, blank: string): string {
  const t = (v ?? "").trim();
  return t === "" ? `[${blank}]` : t;
}

/** One line per non-empty line of the answer. */
function lines(v: string | undefined): string[] {
  return (v ?? "")
    .split("\n")
    .map((l) => l.trim().replace(/^[-*]\s+/, ""))
    .filter((l) => l !== "");
}

function checklist(v: string | undefined, blank: string): string {
  const items = lines(v);
  return (items.length > 0 ? items : [`[${blank}]`]).map((l) => `- [ ] ${l}`).join("\n");
}

function bullets(v: string | undefined, blank: string): string {
  const items = lines(v);
  return (items.length > 0 ? items : [`[${blank}]`]).map((l) => `- ${l}`).join("\n");
}

export const STARTERS: Starter[] = [
  {
    id: "meeting",
    name: "Meeting",
    hint: "Who, what, next steps",
    folder: "meetings",
    title: (date) => `Meeting ${date}`,
    fields: [
      { id: "people", label: "Who was in the meeting?", placeholder: "Mette, Peter and me" },
      {
        id: "decided",
        label: "What was decided?",
        placeholder: "One thing per line",
        multiline: true,
      },
      {
        id: "next",
        label: "What happens next, and who does it?",
        placeholder: "One thing per line, for example: Peter asks head office about a discount",
        multiline: true,
      },
    ],
    build: (title, date, v) =>
      `# ${title}\n\n**Date:** ${date}\n**People:** ${or(v.people, "who")}\n\n## Decided\n\n${bullets(v.decided, "what was decided")}\n\n## Next steps\n\n${checklist(v.next, "who does what by when")}\n`,
  },
  {
    id: "status",
    name: "Status update",
    hint: "Done, next, blocked",
    folder: "quick",
    title: (date) => `Status ${date}`,
    fields: [
      { id: "done", label: "What is done?", placeholder: "One thing per line", multiline: true },
      { id: "next", label: "What is next?", placeholder: "One thing per line", multiline: true },
      {
        id: "blocked",
        label: "Is anything in the way?",
        placeholder: "Leave empty if not",
        multiline: true,
      },
    ],
    build: (title, date, v) =>
      `# ${title}\n\n**Date:** ${date}\n\n## Done\n\n${bullets(v.done, "what is done")}\n\n## Next\n\n${checklist(v.next, "what is next")}\n\n## In the way\n\n${lines(v.blocked).length > 0 ? bullets(v.blocked, "") : "Nothing."}\n`,
  },
  {
    id: "reply",
    name: "Reply to an e-mail",
    hint: "Short and clear",
    folder: "quick",
    title: (date) => `Reply ${date}`,
    fields: [
      { id: "from", label: "Who wrote?", placeholder: "Mette from Acme" },
      { id: "asks", label: "What do they ask?", placeholder: "In a few words", multiline: true },
      {
        id: "answer",
        label: "What do you want to answer?",
        placeholder: "The main points",
        multiline: true,
      },
    ],
    build: (title, date, v) =>
      `# ${title}\n\n**From:** ${or(v.from, "who")}\n**Date:** ${date}\n\n## They ask\n\n${or(v.asks, "what they ask")}\n\n## My answer\n\n${bullets(v.answer, "the main points")}\n\n- [ ] Send the reply\n`,
  },
  {
    id: "idea",
    name: "Idea",
    hint: "Why, how, first step",
    folder: "quick",
    title: (date) => `Idea ${date}`,
    fields: [
      { id: "what", label: "What is the idea?", placeholder: "In a sentence" },
      { id: "why", label: "Why is it good?", placeholder: "What does it fix or give?" },
      {
        id: "first",
        label: "What is the first small step?",
        placeholder: "Something you can do today",
      },
    ],
    build: (title, date, v) =>
      `# ${title}\n\n**Date:** ${date}\n\n${or(v.what, "the idea")}\n\n## Why\n\n${or(v.why, "why it is good")}\n\n## First step\n\n- [ ] ${or(v.first, "the first small step")}\n`,
  },
];
