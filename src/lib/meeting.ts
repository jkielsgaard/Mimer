/**
 * A meeting is an ordinary note in the meetings folder:
 *
 *     ---
 *     tags: [meeting]
 *     meeting: 2026-10-27 14:00
 *     with: [Mette, Peter]
 *     ---
 *     # Weekly with Mette
 *
 *     ## Agenda
 *
 *     - [ ] Budget
 *
 *     ## Notes
 *
 *     ### Budget
 *
 * These functions read and change that text. They do no file work.
 */

export interface MeetingInput {
  title: string;
  /** `YYYY-MM-DD`, or empty. */
  date: string;
  /** `HH:MM`, or empty. */
  time: string;
  people: string[];
  agenda: string[];
}

export interface AgendaItem {
  text: string;
  done: boolean;
}

export interface Meeting {
  title: string;
  /** `YYYY-MM-DD`, or null when the meeting has no date. */
  date: string | null;
  /** `HH:MM`, or null. */
  time: string | null;
  people: string[];
  agenda: AgendaItem[];
}

/** A name without the characters that would break the list in the frontmatter. */
function cleanName(name: string): string {
  return name
    .replace(/[[\]{},#:"'\\]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** One agenda line as one line of text. */
function cleanItem(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

/** The text of a new meeting note, from what the person filled in (everything is optional). */
export function buildMeetingNote(input: MeetingInput): string {
  const title = cleanItem(input.title) || "Meeting";
  const people = input.people.map(cleanName).filter((p) => p !== "");
  const agenda = input.agenda.map(cleanItem).filter((a) => a !== "");
  const front = ["tags: [meeting]"];
  if (input.date !== "") {
    front.push(`meeting: ${input.date}${input.time !== "" ? ` ${input.time}` : ""}`);
  }
  if (people.length > 0) front.push(`with: [${people.join(", ")}]`);
  const lines = ["---", ...front, "---", `# ${title}`, "", "## Agenda", ""];
  lines.push(...(agenda.length > 0 ? agenda.map((a) => `- [ ] ${a}`) : ["- [ ] "]));
  lines.push("", "## Notes", "");
  for (const a of agenda) lines.push(`### ${a}`, "");
  return `${lines.join("\n").replace(/\n+$/, "")}\n`;
}

/** The part between the `---` lines at the top, and the line the note's body starts on. */
function frontmatter(lines: string[]): { body: string[]; start: number } {
  if (lines[0]?.trim() !== "---") return { body: [], start: 0 };
  const end = lines.findIndex((l, i) => i > 0 && l.trim() === "---");
  if (end === -1) return { body: [], start: 0 };
  return { body: lines.slice(1, end), start: end + 1 };
}

/** The first and last line of the `## name` section (end is where the next `## ` starts). */
function section(
  lines: string[],
  name: string,
  from: number,
): { head: number; end: number } | null {
  const head = lines.findIndex((l, i) => i >= from && l.trim().toLowerCase() === `## ${name}`);
  if (head === -1) return null;
  let end = lines.findIndex((l, i) => i > head && /^##\s/.test(l));
  if (end === -1) end = lines.length;
  return { head, end };
}

/** What a meeting note says about the meeting. */
export function parseMeeting(content: string): Meeting {
  const lines = content.split("\n");
  const front = frontmatter(lines);
  let date: string | null = null;
  let time: string | null = null;
  let people: string[] = [];
  for (const l of front.body) {
    const when = /^meeting:\s*(\d{4}-\d{2}-\d{2})(?:[ T](\d{2}:\d{2}))?/.exec(l);
    if (when) {
      date = when[1] ?? null;
      time = when[2] ?? null;
    }
    const who = /^with:\s*\[(.*)\]\s*$/.exec(l);
    if (who) {
      people = (who[1] ?? "")
        .split(",")
        .map((p) => p.trim())
        .filter((p) => p !== "");
    }
  }
  const heading = lines.slice(front.start).find((l) => /^#\s+\S/.test(l));
  const agendaAt = section(lines, "agenda", front.start);
  const agenda: AgendaItem[] = [];
  if (agendaAt) {
    for (const l of lines.slice(agendaAt.head + 1, agendaAt.end)) {
      const m = /^\s*[-*]\s+\[( |x|X)\]\s+(\S.*)$/.exec(l);
      if (m) agenda.push({ text: (m[2] ?? "").trim(), done: m[1] !== " " });
    }
  }
  return {
    title: heading ? heading.replace(/^#\s+/, "").trim() : "Meeting",
    date,
    time,
    people,
    agenda,
  };
}

/** The `### item` part of the Notes section: where it starts and where it ends. */
function itemAt(lines: string[], item: string): { head: number; end: number } | null {
  const notes = section(lines, "notes", 0);
  if (!notes) return null;
  const head = lines.findIndex(
    (l, i) => i > notes.head && i < notes.end && l.trim() === `### ${item}`,
  );
  if (head === -1) return null;
  let end = lines.findIndex((l, i) => i > head && i < notes.end && /^###\s/.test(l));
  if (end === -1) end = notes.end;
  return { head, end };
}

/** What was written under an agenda item in the Notes section ("" when nothing). */
export function itemNotes(content: string, item: string): string {
  const lines = content.split("\n");
  const at = itemAt(lines, item);
  if (!at) return "";
  return lines
    .slice(at.head + 1, at.end)
    .join("\n")
    .replace(/^\n+|\n+$/g, "");
}

/** The note with the text under an agenda item replaced (the part is made if it is not there). */
export function setItemNotes(content: string, item: string, text: string): string {
  const lines = content.split("\n");
  const body = text.replace(/\s+$/, "");
  const block = body === "" ? [""] : ["", ...body.split("\n"), ""];
  const at = itemAt(lines, item);
  if (at) {
    lines.splice(at.head + 1, at.end - at.head - 1, ...block);
    return lines.join("\n");
  }
  let notes = section(lines, "notes", 0);
  if (!notes) {
    while (lines.length > 0 && lines[lines.length - 1] === "") lines.pop();
    lines.push("", "## Notes", "");
    notes = section(lines, "notes", 0);
  }
  const end = notes?.end ?? lines.length;
  lines.splice(end, 0, `### ${item}`, ...block);
  return lines.join("\n");
}

/** The note with an agenda item ticked or unticked. */
export function markItem(content: string, item: string, done: boolean): string {
  const lines = content.split("\n");
  const agenda = section(lines, "agenda", frontmatter(lines).start);
  if (!agenda) return content;
  for (let i = agenda.head + 1; i < agenda.end; i++) {
    const m = /^(\s*[-*]\s+)\[( |x|X)\](\s+)(\S.*)$/.exec(lines[i] ?? "");
    if (m && (m[4] ?? "").trim() === item) {
      lines[i] = `${m[1] ?? ""}[${done ? "x" : " "}]${m[3] ?? ""}${m[4] ?? ""}`;
      break;
    }
  }
  return lines.join("\n");
}

/** The note with one more agenda item, at the end of the Agenda (and a part in Notes). */
export function addItem(content: string, item: string): string {
  const text = cleanItem(item);
  if (text === "") return content;
  const lines = content.split("\n");
  const agenda = section(lines, "agenda", frontmatter(lines).start);
  if (!agenda) return content;
  let last = agenda.end;
  while (last > agenda.head + 1 && (lines[last - 1] ?? "").trim() === "") last--;
  // An empty first line ("- [ ] ") made for an agenda nobody wrote is used up first.
  const empty = lines.findIndex(
    (l, i) => i > agenda.head && i < agenda.end && /^\s*[-*]\s+\[ \]\s*$/.test(l),
  );
  if (empty !== -1) lines.splice(empty, 1, `- [ ] ${text}`);
  else lines.splice(last, 0, `- [ ] ${text}`);
  return setItemNotes(lines.join("\n"), text, "");
}

/** The date and time as one point in time (a meeting without a time counts as the end of the day). */
export function meetingMoment(m: Pick<Meeting, "date" | "time">): number | null {
  if (m.date === null) return null;
  const [y, mo, d] = m.date.split("-").map(Number);
  const [h, mi] = (m.time ?? "23:59").split(":").map(Number);
  return new Date(y ?? 0, (mo ?? 1) - 1, d ?? 1, h ?? 0, mi ?? 0).getTime();
}

/** Today's and tomorrow's date as `YYYY-MM-DD`, from a point in time. */
export function todayAndTomorrow(now: Date): [string, string] {
  const iso = (d: Date): string =>
    `${String(d.getFullYear())}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  const next = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
  return [iso(now), iso(next)];
}

/** The ending that says an action line has been added to the tasks. */
const ADDED = " (in Tasks)";

export interface ActionLine {
  /** 0-based line in the note. */
  line: number;
  text: string;
  /** The agenda item (the `###` part) it was written under, or "". */
  item: string;
  /** Already added to the tasks. */
  added: boolean;
}

/** The lines marked `**Action:**` in the Notes section, and the agenda item each is under. */
export function findActions(content: string): ActionLine[] {
  const lines = content.split("\n");
  const notes = section(lines, "notes", 0);
  if (!notes) return [];
  const found: ActionLine[] = [];
  let item = "";
  for (let i = notes.head + 1; i < notes.end; i++) {
    const l = lines[i] ?? "";
    const head = /^###\s+(.*\S)\s*$/.exec(l);
    if (head) {
      item = head[1] ?? "";
      continue;
    }
    const m = /^\s*\*\*Action:\*\*\s*(\S.*)$/.exec(l);
    if (!m) continue;
    const raw = (m[1] ?? "").trim();
    const added = raw.endsWith(ADDED.trim());
    const text = (added ? raw.slice(0, raw.length - ADDED.trim().length) : raw).trim();
    if (text !== "") found.push({ line: i, text, item, added });
  }
  return found;
}

/** The note with these action lines marked as added to the tasks. */
export function markActionsAdded(content: string, lineNumbers: number[]): string {
  const lines = content.split("\n");
  for (const n of lineNumbers) {
    const l = lines[n] ?? "";
    if (/^\s*\*\*Action:\*\*\s*\S/.test(l) && !l.trimEnd().endsWith(ADDED.trim())) {
      lines[n] = `${l.trimEnd()}${ADDED}`;
    }
  }
  return lines.join("\n");
}

/** A date a number of days later (`YYYY-MM-DD`). */
export function addDays(date: string, days: number): string {
  const [y, m, d] = date.split("-").map(Number);
  const next = new Date(y ?? 0, (m ?? 1) - 1, (d ?? 1) + days);
  return `${String(next.getFullYear())}-${String(next.getMonth() + 1).padStart(2, "0")}-${String(next.getDate()).padStart(2, "0")}`;
}

/** What the meeting window starts with (all text, as it is typed there). */
export interface MeetingSeed {
  title: string;
  date: string;
  time: string;
  who: string;
  agenda: string;
}

/** What the window for the next meeting starts with, taken from a meeting that has been held. */
export function nextMeetingSeed(content: string): MeetingSeed {
  const m = parseMeeting(content);
  const left = m.agenda.filter((a) => !a.done).map((a) => a.text);
  const open = findActions(content)
    .filter((a) => !a.added)
    .map((a) => `Follow up: ${a.text}`);
  return {
    title: m.title,
    date: m.date === null ? "" : addDays(m.date, 7),
    time: m.time ?? "",
    who: m.people.join(", "),
    agenda: [...left, ...open].join("\n"),
  };
}
