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
 *     parts: [agenda, decisions, actions]
 *     ---
 *     # Weekly with Mette
 *
 *     ## Agenda
 *
 *     - [ ] Budget
 *
 *     ## Notes
 *
 *     ## Decisions
 *
 *     ## Actions
 *
 * The notes are one text for the whole meeting. The agenda, the decisions and the actions are
 * parts a meeting can have or leave out (`parts:`; a meeting without that property has all three).
 * These functions read and change that text. They do no file work.
 */

import { safeStorage } from "./safeStorage";

/** What a meeting has besides its notes: each is a `## ` section of the note. */
export interface MeetingParts {
  agenda: boolean;
  decisions: boolean;
  actions: boolean;
}

/** All three parts: a meeting made before the parts existed (no `parts:`). */
export const ALL_PARTS: MeetingParts = { agenda: true, decisions: true, actions: true };

/** No part: what a new meeting has until someone chooses one (they are options). */
export const NO_PARTS: MeetingParts = { agenda: false, decisions: false, actions: false };

const PART_KEYS = ["agenda", "decisions", "actions"] as const;
const PARTS_STORAGE = "mimer.meetingParts";

/** `[agenda, actions]`, the value of the `parts:` property. */
function partsValue(parts: MeetingParts): string {
  return `[${PART_KEYS.filter((k) => parts[k]).join(", ")}]`;
}

/** The parts the last new meeting on this computer was made with (none the first time). */
export function loadDefaultParts(): MeetingParts {
  try {
    const raw = safeStorage.getItem(PARTS_STORAGE);
    if (raw === null) return { ...NO_PARTS };
    const v = JSON.parse(raw) as Partial<Record<keyof MeetingParts, unknown>>;
    return {
      agenda: v.agenda === true,
      decisions: v.decisions === true,
      actions: v.actions === true,
    };
  } catch {
    return { ...NO_PARTS };
  }
}

/** Remembers the parts chosen for a new meeting, for the next one. */
export function saveDefaultParts(parts: MeetingParts): void {
  try {
    safeStorage.setItem(PARTS_STORAGE, JSON.stringify(parts));
  } catch {
    /* the choice is just not remembered */
  }
}

export interface MeetingInput {
  title: string;
  /** `YYYY-MM-DD`, or empty. */
  date: string;
  /** `HH:MM`, or empty. */
  time: string;
  people: string[];
  agenda: string[];
  /** Left out: all three parts. */
  parts?: MeetingParts;
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
  parts: MeetingParts;
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
  const parts = input.parts ?? ALL_PARTS;
  const front = ["tags: [meeting]"];
  if (input.date !== "") {
    front.push(`meeting: ${input.date}${input.time !== "" ? ` ${input.time}` : ""}`);
  }
  if (people.length > 0) front.push(`with: [${people.join(", ")}]`);
  front.push(`parts: ${partsValue(parts)}`);
  const lines = ["---", ...front, "---", `# ${title}`, ""];
  if (parts.agenda) {
    lines.push("## Agenda", "");
    lines.push(...(agenda.length > 0 ? agenda.map((a) => `- [ ] ${a}`) : ["- [ ] "]));
    lines.push("");
  }
  lines.push("## Notes", "");
  if (parts.decisions) lines.push("## Decisions", "");
  if (parts.actions) lines.push("## Actions", "");
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
  let parts: MeetingParts = { ...ALL_PARTS };
  for (const l of front.body) {
    const when = /^meeting:\s*(\d{4}-\d{2}-\d{2})(?:[ T](\d{2}:\d{2}))?/.exec(l);
    if (when) {
      date = when[1] ?? null;
      time = when[2] ?? null;
    }
    const chosen = /^parts:\s*\[(.*)\]\s*$/.exec(l);
    if (chosen) {
      const names = (chosen[1] ?? "").split(",").map((n) => n.trim().toLowerCase());
      parts = {
        agenda: names.includes("agenda"),
        decisions: names.includes("decisions"),
        actions: names.includes("actions"),
      };
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
    parts,
  };
}

/** What can be changed about a meeting after it was made. */
export interface MeetingWhen {
  /** `YYYY-MM-DD`, or "" for no date. */
  date: string;
  /** `HH:MM`, or "". */
  time: string;
  people: string[];
}

/** Sets (or, with null, removes) one property line; a value written as a block goes with its key. */
function setKey(body: string[], key: string, value: string | null): void {
  const at = body.findIndex((l) => new RegExp(`^${key}:`).test(l));
  if (at !== -1) {
    let end = at + 1;
    while (end < body.length && /^\s+\S/.test(body[end] ?? "")) end++;
    body.splice(at, end - at, ...(value === null ? [] : [`${key}: ${value}`]));
  } else if (value !== null) body.push(`${key}: ${value}`);
}

/**
 * The note with its `meeting:` and `with:` properties changed (a line is added when it was not
 * there, and taken away when it is now empty). Nothing else in the note changes.
 */
export function setMeetingWhen(content: string, when: MeetingWhen): string {
  const lines = content.split("\n");
  const front = frontmatter(lines);
  if (front.start === 0) return content;
  const close = front.start - 1;
  const body = lines.slice(1, close);
  const people = when.people.map(cleanName).filter((p) => p !== "");
  setKey(
    body,
    "meeting",
    when.date === "" ? null : `${when.date}${when.time !== "" ? ` ${when.time}` : ""}`,
  );
  setKey(body, "with", people.length > 0 ? `[${people.join(", ")}]` : null);
  return [lines[0] ?? "---", ...body, ...lines.slice(close)].join("\n");
}

/**
 * The note with its `parts:` property set. Only the property changes: a part that is switched off
 * keeps its section and what is written in it, it is just not shown.
 */
export function setMeetingParts(content: string, parts: MeetingParts): string {
  const lines = content.split("\n");
  const front = frontmatter(lines);
  if (front.start === 0) return content;
  const close = front.start - 1;
  const body = lines.slice(1, close);
  setKey(body, "parts", partsValue(parts));
  return [lines[0] ?? "---", ...body, ...lines.slice(close)].join("\n");
}

/** The order the sections come in when one has to be made. */
const SECTION_ORDER = ["agenda", "notes", "decisions", "actions"];

/** The note with a `## name` section, made in its place when there is none. */
function withSection(lines: string[], name: string): string[] {
  const start = frontmatter(lines).start;
  if (section(lines, name, start)) return lines;
  const out = [...lines];
  const later = SECTION_ORDER.slice(SECTION_ORDER.indexOf(name) + 1)
    .map((n) => section(out, n, start))
    .filter((x) => x !== null)
    .map((x) => x.head);
  if (later.length > 0) {
    out.splice(Math.min(...later), 0, `## ${name[0]?.toUpperCase() ?? ""}${name.slice(1)}`, "", "");
    return out;
  }
  while (out.length > 0 && out[out.length - 1] === "") out.pop();
  out.push("", `## ${name[0]?.toUpperCase() ?? ""}${name.slice(1)}`, "");
  return out;
}

/** The lines of a section, without the heading. */
function sectionBody(content: string, name: string): string[] {
  const lines = content.split("\n");
  const at = section(lines, name, frontmatter(lines).start);
  return at ? lines.slice(at.head + 1, at.end) : [];
}

/** Everything written under `## Notes`: one text for the whole meeting (also old `### item` parts). */
export function meetingNotesText(content: string): string {
  return sectionBody(content, "notes")
    .join("\n")
    .replace(/^\n+|\n+$/g, "");
}

/** The note with the text under `## Notes` replaced (the section is made if it is not there). */
export function setMeetingNotes(content: string, text: string): string {
  const lines = withSection(content.split("\n"), "notes");
  const at = section(lines, "notes", frontmatter(lines).start);
  if (!at) return content;
  const body = text.replace(/\s+$/, "");
  lines.splice(
    at.head + 1,
    at.end - at.head - 1,
    ...(body === "" ? [""] : ["", ...body.split("\n"), ""]),
  );
  return lines.join("\n");
}

/** A line added at the end of a section, which is made if it is not there. */
function appendLine(content: string, name: string, line: string): string {
  const lines = withSection(content.split("\n"), name);
  const at = section(lines, name, frontmatter(lines).start);
  if (!at) return content;
  let last = at.end;
  while (last > at.head + 1 && (lines[last - 1] ?? "").trim() === "") last--;
  // The blank line under the heading stays between the heading and the first line.
  const added = last === at.head + 1 ? ["", line] : [line];
  lines.splice(last, 0, ...added);
  const after = last + added.length;
  // A blank line before whatever comes next, and the file ends with a line break.
  if (after >= lines.length || (lines[after] ?? "").trim() !== "") lines.splice(after, 0, "");
  return lines.join("\n");
}

/** What was decided: the bullet lines under `## Decisions`. */
export function decisionsOf(content: string): string[] {
  return sectionBody(content, "decisions").flatMap((l) => {
    const m = /^\s*[-*]\s+(\S.*)$/.exec(l);
    return m ? [(m[1] ?? "").trim()] : [];
  });
}

/** The note with one more decision. */
export function addDecision(content: string, text: string): string {
  const t = cleanItem(text);
  return t === "" ? content : appendLine(content, "decisions", `- ${t}`);
}

/** The note without the first decision that reads `text`. */
export function removeDecision(content: string, text: string): string {
  const lines = content.split("\n");
  const at = section(lines, "decisions", frontmatter(lines).start);
  if (!at) return content;
  for (let i = at.head + 1; i < at.end; i++) {
    const m = /^\s*[-*]\s+(\S.*)$/.exec(lines[i] ?? "");
    if (m && (m[1] ?? "").trim() === text) {
      lines.splice(i, 1);
      break;
    }
  }
  return lines.join("\n");
}

/** An action as it is in the note: a task line under `## Actions`. */
export interface MeetingAction {
  /** The line's text as it is written (with `made:` and the like). */
  raw: string;
  /** The text to show. */
  text: string;
  done: boolean;
}

/** The task lines under `## Actions`. */
export function actionsOf(content: string): MeetingAction[] {
  return sectionBody(content, "actions").flatMap((l) => {
    const m = /^\s*[-*]\s+\[( |x|X)\]\s+(\S.*)$/.exec(l);
    if (!m) return [];
    const raw = (m[2] ?? "").trim();
    return [{ raw, text: raw.replace(/\s*\bmade:\S+/g, "").trim(), done: m[1] !== " " }];
  });
}

/** The note with one more action, a task under `## Actions` (`made` is the date it was made). */
export function addAction(content: string, text: string, made?: string): string {
  const t = cleanItem(text);
  if (t === "") return content;
  return appendLine(content, "actions", `- [ ] ${t}${made ? ` made:${made}` : ""}`);
}

/** The note with an action ticked or unticked. */
export function markAction(content: string, raw: string, done: boolean): string {
  const lines = content.split("\n");
  const at = section(lines, "actions", frontmatter(lines).start);
  if (!at) return content;
  for (let i = at.head + 1; i < at.end; i++) {
    const m = /^(\s*[-*]\s+)\[( |x|X)\](\s+)(\S.*)$/.exec(lines[i] ?? "");
    if (m && (m[4] ?? "").trim() === raw) {
      lines[i] = `${m[1] ?? ""}[${done ? "x" : " "}]${m[3] ?? ""}${m[4] ?? ""}`;
      break;
    }
  }
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

/**
 * A note that has no `## Agenda` yet, with one made that holds `item`: before `## Notes` when
 * there is one, else under the title (or at the top, below the properties, when there is none).
 */
function withAgenda(lines: string[], item: string): string {
  const out = [...lines];
  const block = ["## Agenda", "", `- [ ] ${item}`, ""];
  const start = frontmatter(out).start;
  const notes = section(out, "notes", start);
  let at: number;
  if (notes) {
    at = notes.head;
  } else {
    const title = out.findIndex((l, i) => i >= start && /^#\s+\S/.test(l));
    at = title === -1 ? start : title + 1;
    // Keep a blank line between the title (or the properties) and the new part.
    if (at > 0 && (out[at - 1] ?? "").trim() !== "" && title !== -1) block.unshift("");
  }
  out.splice(at, 0, ...block);
  return out.join("\n");
}

/** The note with one more agenda item, at the end of the Agenda. */
export function addItem(content: string, item: string): string {
  const text = cleanItem(item);
  if (text === "") return content;
  const lines = content.split("\n");
  const agenda = section(lines, "agenda", frontmatter(lines).start);
  if (!agenda) return withAgenda(lines, text);
  let last = agenda.end;
  while (last > agenda.head + 1 && (lines[last - 1] ?? "").trim() === "") last--;
  // An empty first line ("- [ ] ") made for an agenda nobody wrote is used up first.
  const empty = lines.findIndex(
    (l, i) => i > agenda.head && i < agenda.end && /^\s*[-*]\s+\[ \]\s*$/.test(l),
  );
  if (empty !== -1) lines.splice(empty, 1, `- [ ] ${text}`);
  else lines.splice(last, 0, `- [ ] ${text}`);
  return lines.join("\n");
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
  parts: MeetingParts;
}

/** What the window for the next meeting starts with, taken from a meeting that has been held. */
export function nextMeetingSeed(content: string): MeetingSeed {
  const m = parseMeeting(content);
  const left = m.agenda.filter((a) => !a.done).map((a) => a.text);
  return {
    title: m.title,
    date: m.date === null ? "" : addDays(m.date, 7),
    time: m.time ?? "",
    who: m.people.join(", "),
    agenda: left.join("\n"),
    parts: m.parts,
  };
}
