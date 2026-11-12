import type { InlineCommand } from "@/bindings/InlineCommand";

export type InlineActionId =
  | "fix"
  | "clearer"
  | "simpler"
  | "formal"
  | "friendly"
  | "shorten"
  | "list"
  | "toDanish"
  | "toEnglish"
  | "explain"
  | "diagram"
  | "findTasks";

export interface InlineAction {
  id: InlineActionId;
  label: string;
  /** What it does, in a few words. */
  hint: string;
  command: InlineCommand;
  /** The fixed instruction for a `custom` command. */
  instruction: string | null;
  /** The answer is shown next to the text; nothing in the note changes. */
  answer?: boolean;
  /** The answer is a Mermaid diagram, which can be added under the text (the text stays). */
  diagram?: boolean;
}

const SAME =
  "Keep exactly the same meaning and every fact, name, number, link and tag. Do not add anything new and do not leave anything out. Keep the Markdown formatting and write in the language of the text.";

/** The AI commands for selected text. Each one has a fixed prompt: nothing has to be typed. */
export const INLINE_ACTIONS: InlineAction[] = [
  {
    id: "fix",
    label: "Fix spelling and grammar",
    hint: "Only wrong words change",
    command: "fixSpelling",
    instruction: null,
  },
  {
    id: "clearer",
    label: "Rewrite: clearer",
    hint: "Same meaning, easier to read",
    command: "custom",
    instruction: `Rewrite the text so it is clearer and easier to read. ${SAME}`,
  },
  {
    id: "simpler",
    label: "Rewrite: simpler words",
    hint: "Everyday words, short sentences",
    command: "custom",
    instruction: `Rewrite the text with simple, everyday words and short sentences. ${SAME}`,
  },
  {
    id: "formal",
    label: "Rewrite: more formal",
    hint: "For a report or a customer",
    command: "custom",
    instruction: `Rewrite the text in a more formal, professional tone. ${SAME}`,
  },
  {
    id: "friendly",
    label: "Rewrite: friendlier",
    hint: "Warmer, more personal",
    command: "custom",
    instruction: `Rewrite the text in a friendlier, warmer tone. ${SAME}`,
  },
  {
    id: "shorten",
    label: "Shorten",
    hint: "Keeps every fact",
    command: "custom",
    instruction:
      "Shorten the text. Keep every fact, name, number, link and tag; remove only repetition and filler words. Keep the Markdown formatting and the language of the text.",
  },
  {
    id: "list",
    label: "Make it a list",
    hint: "Steps or points",
    command: "restructureList",
    instruction: null,
  },
  {
    id: "toDanish",
    label: "Translate to Danish",
    hint: "Names and numbers stay",
    command: "custom",
    instruction:
      "Translate the text into Danish. Keep names, numbers, links, tags and the Markdown formatting as they are.",
  },
  {
    id: "toEnglish",
    label: "Translate to English",
    hint: "Names and numbers stay",
    command: "custom",
    instruction:
      "Translate the text into English. Keep names, numbers, links, tags and the Markdown formatting as they are.",
  },
  {
    id: "explain",
    label: "Explain this",
    hint: "An answer next to the text; nothing changes",
    command: "custom",
    instruction:
      "Explain the text in plain words, in two to five short sentences, for someone who is new to the subject. Explain hard words. Answer in the language of the text. Do not repeat the text.",
    answer: true,
  },
  {
    id: "diagram",
    label: "Draw as a diagram",
    hint: "Added under the text, as text you can edit",
    command: "custom",
    instruction:
      "Draw what the text describes as a Mermaid flowchart. Answer with the Mermaid code only: no explanation and no code fence. Start with `flowchart LR`. Use short labels (one to four words) in the language of the text, a box for each thing or step, and an arrow for each link between them. Put a label on an arrow only when it adds something. At most 12 boxes. Leave out anything the text does not say.",
    answer: true,
    diagram: true,
  },
  {
    id: "findTasks",
    label: "Find tasks in it",
    hint: "You choose which to add",
    command: "custom",
    instruction: null,
  },
];

export function inlineAction(id: InlineActionId): InlineAction | undefined {
  return INLINE_ACTIONS.find((a) => a.id === id);
}
