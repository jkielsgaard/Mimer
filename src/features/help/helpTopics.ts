import exportMd from "./topics/export.md?raw";
import historyMd from "./topics/history.md?raw";
import imagesMd from "./topics/images.md?raw";
import importMd from "./topics/import.md?raw";
import linksMd from "./topics/links.md?raw";
import mimerMd from "./topics/mimer.md?raw";
import projectsMd from "./topics/projects.md?raw";
import ravenMd from "./topics/raven.md?raw";
import searchMd from "./topics/search.md?raw";
import shortcutsMd from "./topics/shortcuts.md?raw";
import startMd from "./topics/start.md?raw";
import templatesMd from "./topics/templates.md?raw";
import titleMd from "./topics/title.md?raw";
import vaultsMd from "./topics/vaults.md?raw";
import writingMd from "./topics/writing.md?raw";

/** One page of the how-to guide. `body` is Markdown. */
export interface HelpTopic {
  id: string;
  title: string;
  /** One line shown under the title in the list. */
  summary: string;
  body: string;
}

/** The guide, in the order it is shown. The text of each topic is in `topics/<id>.md`. */
export const HELP_TOPICS: readonly HelpTopic[] = [
  {
    id: "start",
    title: "Getting started",
    summary: "Vaults, the window and saving",
    body: startMd,
  },
  {
    id: "writing",
    title: "Writing notes",
    summary: "The toolbar, Markdown and tables",
    body: writingMd,
  },
  {
    id: "title",
    title: "Naming a note",
    summary: "Type the title, the file follows",
    body: titleMd,
  },
  {
    id: "links",
    title: "Links and index pages",
    summary: "Link notes, make an index",
    body: linksMd,
  },
  { id: "images", title: "Images", summary: "Add, resize and tidy pictures", body: imagesMd },
  {
    id: "mimer",
    title: "Mimer, the assistant",
    summary: "Ask, attach notes, review changes",
    body: mimerMd,
  },
  {
    id: "raven",
    title: "Raven, the cloud AI",
    summary: "Knowledge from the internet, without your notes",
    body: ravenMd,
  },
  {
    id: "projects",
    title: "Projects",
    summary: "Instructions for one area",
    body: projectsMd,
  },
  {
    id: "templates",
    title: "Templates and quick notes",
    summary: "Meetings, quick and daily notes",
    body: templatesMd,
  },
  {
    id: "vaults",
    title: "Several vaults",
    summary: "Keep things apart, switch fast",
    body: vaultsMd,
  },
  {
    id: "history",
    title: "Version history",
    summary: "Nothing is lost, restore anything",
    body: historyMd,
  },
  {
    id: "search",
    title: "Finding notes",
    summary: "Quick open, search and filters",
    body: searchMd,
  },
  {
    id: "import",
    title: "Import from OneNote",
    summary: "Move your notes to Mimer",
    body: importMd,
  },
  { id: "export", title: "Export and share", summary: "HTML, Word and PDF", body: exportMd },
  {
    id: "shortcuts",
    title: "Keyboard shortcuts",
    summary: "All shortcuts in one list",
    body: shortcutsMd,
  },
];

/** The topic with this id, or the first one. */
export function findTopic(id: string): HelpTopic {
  return HELP_TOPICS.find((t) => t.id === id) ?? (HELP_TOPICS[0] as HelpTopic);
}

/** Topics whose title, summary or text contains every word of `query` (without regard to case). */
export function searchTopics(query: string): readonly HelpTopic[] {
  const words = query
    .toLowerCase()
    .split(/\s+/)
    .filter((w) => w !== "");
  if (words.length === 0) return HELP_TOPICS;
  return HELP_TOPICS.filter((t) => {
    const text = `${t.title} ${t.summary} ${t.body}`.toLowerCase();
    return words.every((w) => text.includes(w));
  });
}
