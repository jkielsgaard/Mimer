import { describe, expect, it } from "vitest";
import {
  ALL_PARTS,
  NO_PARTS,
  actionsOf,
  addAction,
  addDays,
  addDecision,
  addItem,
  buildMeetingNote,
  decisionsOf,
  loadDefaultParts,
  markAction,
  markItem,
  meetingMoment,
  meetingNotesText,
  nextMeetingSeed,
  parseMeeting,
  removeDecision,
  saveDefaultParts,
  setMeetingNotes,
  setMeetingParts,
  setMeetingWhen,
  todayAndTomorrow,
} from "./meeting";

const full = buildMeetingNote({
  title: "Weekly with Mette",
  date: "2026-10-27",
  time: "14:00",
  people: ["Mette", "Peter"],
  agenda: ["Budget", "Hiring"],
});

describe("buildMeetingNote", () => {
  it("writes the date, people and parts as properties, the agenda as a checklist and a section per part", () => {
    expect(full).toBe(
      [
        "---",
        "tags: [meeting]",
        "meeting: 2026-10-27 14:00",
        "with: [Mette, Peter]",
        "parts: [agenda, decisions, actions]",
        "---",
        "# Weekly with Mette",
        "",
        "## Agenda",
        "",
        "- [ ] Budget",
        "- [ ] Hiring",
        "",
        "## Notes",
        "",
        "## Decisions",
        "",
        "## Actions",
        "",
      ].join("\n"),
    );
  });

  it("is a usable note with nothing filled in, and keeps odd characters out of the properties", () => {
    const text = buildMeetingNote({ title: "", date: "", time: "", people: [], agenda: [] });
    expect(text).toContain("# Meeting");
    expect(text).not.toContain("meeting:");
    expect(text).not.toContain("with:");
    expect(parseMeeting(text).agenda).toEqual([]);
    const odd = buildMeetingNote({
      title: "x",
      date: "2026-10-27",
      time: "",
      people: ["Mette, Peter", "[Lars]: #1"],
      agenda: [],
    });
    expect(parseMeeting(odd).people).toEqual(["Mette Peter", "Lars 1"]);
    expect(parseMeeting(odd).time).toBeNull();
  });
});

describe("parseMeeting", () => {
  it("reads the title, when, who and the agenda", () => {
    const m = parseMeeting(markItem(full, "Budget", true));
    expect(m).toEqual({
      title: "Weekly with Mette",
      date: "2026-10-27",
      time: "14:00",
      people: ["Mette", "Peter"],
      agenda: [
        { text: "Budget", done: true },
        { text: "Hiring", done: false },
      ],
      parts: ALL_PARTS,
    });
  });

  it("gives an old meeting without parts all three, and reads the parts that are chosen", () => {
    expect(parseMeeting("---\ntags: [meeting]\n---\n# Old\n").parts).toEqual(ALL_PARTS);
    const some = buildMeetingNote({
      title: "T",
      date: "",
      time: "",
      people: [],
      agenda: ["Ignored"],
      parts: { agenda: false, decisions: true, actions: false },
    });
    expect(parseMeeting(some).parts).toEqual({ agenda: false, decisions: true, actions: false });
    expect(some).toContain("parts: [decisions]");
    expect(some).not.toContain("## Agenda");
    expect(some).not.toContain("Ignored");
    expect(some).toContain("## Decisions");
    expect(some).not.toContain("## Actions");
    expect(parseMeeting(some).agenda).toEqual([]);
  });

  it("reads a plain note without any properties", () => {
    const m = parseMeeting("# Lunch\n\nSome text\n");
    expect(m.title).toBe("Lunch");
    expect(m.date).toBeNull();
    expect(m.agenda).toEqual([]);
  });
});

describe("the notes of the whole meeting", () => {
  it("reads and writes one text under ## Notes and leaves the other sections alone", () => {
    expect(meetingNotesText(full)).toBe("");
    const a = setMeetingNotes(full, "Budget: two people\nPeter: one in Q1");
    expect(meetingNotesText(a)).toBe("Budget: two people\nPeter: one in Q1");
    expect(a).toContain("## Decisions");
    expect(a).toContain("- [ ] Budget");
    const b = setMeetingNotes(a, "changed");
    expect(meetingNotesText(b)).toBe("changed");
    expect(b.match(/## Notes/g)).toHaveLength(1);
    expect(setMeetingNotes(b, "")).toBe(full);
  });

  it("keeps the ### parts of an older meeting as text, and makes the section when there is none", () => {
    const old = "# T\n\n## Agenda\n\n- [ ] One\n\n## Notes\n\n### One\n\nhello\n";
    expect(meetingNotesText(old)).toBe("### One\n\nhello");
    const made = setMeetingNotes("# T\n\n## Agenda\n\n- [ ] One\n", "hello");
    expect(made).toContain("## Notes");
    expect(meetingNotesText(made)).toBe("hello");
  });
});

describe("decisions", () => {
  it("adds, reads and removes decisions, and makes the section when it is missing", () => {
    const a = addDecision(addDecision(full, "Rollout starts Monday"), "Order 20 licences");
    expect(decisionsOf(a)).toEqual(["Rollout starts Monday", "Order 20 licences"]);
    expect(a.indexOf("## Decisions")).toBeLessThan(a.indexOf("## Actions"));
    expect(decisionsOf(removeDecision(a, "Rollout starts Monday"))).toEqual(["Order 20 licences"]);
    expect(addDecision(full, "  ")).toBe(full);
    const bare = addDecision("# T\n\n## Notes\n\nx\n", "One");
    expect(decisionsOf(bare)).toEqual(["One"]);
    expect(bare.endsWith("\n")).toBe(true);
  });
});

describe("actions", () => {
  it("adds a task under ## Actions with its made date, ticks it and reads it back", () => {
    const a = addAction(full, "Order licences", "2026-10-31");
    expect(a).toContain("## Actions\n\n- [ ] Order licences made:2026-10-31");
    const [one] = actionsOf(a);
    expect(one).toEqual({
      raw: "Order licences made:2026-10-31",
      text: "Order licences",
      done: false,
    });
    const ticked = markAction(a, one?.raw ?? "", true);
    expect(actionsOf(ticked)[0]?.done).toBe(true);
    expect(markAction(ticked, one?.raw ?? "", false)).toBe(a);
    const two = addAction(a, "Write the guide");
    expect(actionsOf(two).map((x) => x.text)).toEqual(["Order licences", "Write the guide"]);
    expect(addAction(full, "")).toBe(full);
  });

  it("is not mixed up with the decisions or the agenda", () => {
    const a = addAction(addDecision(full, "D"), "A");
    expect(decisionsOf(a)).toEqual(["D"]);
    expect(actionsOf(a).map((x) => x.text)).toEqual(["A"]);
    expect(parseMeeting(a).agenda.map((x) => x.text)).toEqual(["Budget", "Hiring"]);
  });
});

describe("the parts of a meeting", () => {
  it("setMeetingParts changes only the property and keeps what is written in a part that is off", () => {
    const a = setMeetingNotes(addAction(full, "A"), "text");
    const off = setMeetingParts(a, { agenda: true, decisions: true, actions: false });
    expect(parseMeeting(off).parts).toEqual({ agenda: true, decisions: true, actions: false });
    expect(off).toContain("- [ ] A");
    expect(setMeetingParts(off, ALL_PARTS)).toBe(a);
    const old = setMeetingParts("---\ntags: [meeting]\n---\n# Old\n", {
      agenda: false,
      decisions: false,
      actions: false,
    });
    expect(old).toContain("parts: []");
    expect(parseMeeting(old).parts).toEqual({ agenda: false, decisions: false, actions: false });
  });

  it("remembers the parts of the last new meeting on this computer", () => {
    window.localStorage.removeItem("mimer.meetingParts");
    expect(loadDefaultParts()).toEqual(NO_PARTS);
    saveDefaultParts({ agenda: false, decisions: true, actions: true });
    expect(loadDefaultParts()).toEqual({ agenda: false, decisions: true, actions: true });
    window.localStorage.removeItem("mimer.meetingParts");
  });
});

describe("adding an item to a meeting without an agenda", () => {
  it("makes the Agenda before the Notes, so the item is listed", () => {
    const made = addItem("# Lunch\n\n## Notes\n\nsome text\n", "Food");
    expect(made).toContain("## Agenda\n\n- [ ] Food");
    expect(made.indexOf("## Agenda")).toBeLessThan(made.indexOf("## Notes"));
    expect(parseMeeting(made).agenda).toEqual([{ text: "Food", done: false }]);
    // What was written under Notes stays.
    expect(made).toContain("some text");
  });

  it("makes it under the title when the note has nothing else, and below the properties", () => {
    expect(parseMeeting(addItem("# Lunch\n\nsome text\n", "Food")).agenda).toHaveLength(1);
    const withFront = addItem("---\ntags: [meeting]\n---\n# Lunch\n", "Food");
    expect(withFront.startsWith("---\ntags: [meeting]\n---\n# Lunch\n")).toBe(true);
    expect(parseMeeting(withFront).agenda).toHaveLength(1);
    expect(parseMeeting(addItem("just text\n", "Food")).agenda).toHaveLength(1);
  });
});

describe("the agenda", () => {
  it("ticks and unticks an item", () => {
    const ticked = markItem(full, "Budget", true);
    expect(ticked).toContain("- [x] Budget");
    expect(ticked).toContain("- [ ] Hiring");
    expect(markItem(ticked, "Budget", false)).toBe(full);
  });

  it("adds an item, and uses up the empty first line", () => {
    const more = addItem(full, "Next release");
    expect(parseMeeting(more).agenda.map((a) => a.text)).toEqual([
      "Budget",
      "Hiring",
      "Next release",
    ]);
    expect(more).not.toContain("### Next release");
    const empty = buildMeetingNote({ title: "T", date: "", time: "", people: [], agenda: [] });
    expect(parseMeeting(addItem(empty, "First")).agenda).toEqual([{ text: "First", done: false }]);
    expect(addItem(full, "   ")).toBe(full);
  });
});

describe("time", () => {
  it("turns a date and time into a moment, and a missing time into the end of the day", () => {
    const at = meetingMoment({ date: "2026-10-27", time: "14:00" });
    const late = meetingMoment({ date: "2026-10-27", time: null });
    expect(at).not.toBeNull();
    expect(late).toBeGreaterThan(at ?? 0);
    expect(meetingMoment({ date: null, time: null })).toBeNull();
  });

  it("finds today and tomorrow, also at the end of a month", () => {
    expect(todayAndTomorrow(new Date(2026, 9, 31, 23, 0))).toEqual(["2026-10-31", "2026-11-01"]);
  });
});

describe("the next meeting", () => {
  it("adds days across a month end", () => {
    expect(addDays("2026-10-27", 7)).toBe("2026-11-03");
    expect(addDays("2026-12-28", 7)).toBe("2027-01-04");
  });

  it("starts from the same title, people and time, a week later, with what is left over", () => {
    const content = setMeetingNotes(markItem(full, "Budget", true), "Talked about it.");
    expect(nextMeetingSeed(content)).toEqual({
      title: "Weekly with Mette",
      date: "2026-11-03",
      time: "14:00",
      who: "Mette, Peter",
      agenda: "Hiring",
      parts: ALL_PARTS,
    });
    const plain = nextMeetingSeed("# Lunch\n");
    expect(plain.date).toBe("");
    expect(plain.agenda).toBe("");
  });
});

describe("setMeetingWhen", () => {
  const note = buildMeetingNote({
    title: "Weekly",
    date: "2026-10-28",
    time: "10:00",
    people: ["Mette"],
    agenda: ["Budget"],
  });

  it("changes the day, the time and the people and nothing else", () => {
    const changed = setMeetingWhen(note, {
      date: "2026-10-30",
      time: "14:30",
      people: ["Peter", "Mette"],
    });
    expect(changed).toBe(
      note
        .replace("meeting: 2026-10-28 10:00", "meeting: 2026-10-30 14:30")
        .replace("with: [Mette]", "with: [Peter, Mette]"),
    );
    expect(parseMeeting(changed).time).toBe("14:30");
  });

  it("takes the lines away when they are emptied, and adds them when they were not there", () => {
    const bare = setMeetingWhen(note, { date: "", time: "", people: [] });
    expect(bare).not.toContain("meeting:");
    expect(bare).not.toContain("with:");
    expect(bare).toContain("tags: [meeting]");
    const again = setMeetingWhen(bare, { date: "2026-11-02", time: "", people: ["Ann"] });
    expect(parseMeeting(again).date).toBe("2026-11-02");
    expect(parseMeeting(again).people).toEqual(["Ann"]);
  });

  it("replaces a value written as a block list, so the properties stay valid", () => {
    const block =
      "---\ntags: [meeting]\nwith:\n  - Mette\n  - Peter\nmeeting: 2026-10-28\n---\n# W\n";
    expect(setMeetingWhen(block, { date: "2026-10-28", time: "", people: ["Ann"] })).toBe(
      "---\ntags: [meeting]\nwith: [Ann]\nmeeting: 2026-10-28\n---\n# W\n",
    );
    expect(setMeetingWhen(block, { date: "2026-10-28", time: "", people: [] })).toBe(
      "---\ntags: [meeting]\nmeeting: 2026-10-28\n---\n# W\n",
    );
  });

  it("leaves a note without properties alone", () => {
    expect(setMeetingWhen("# Just a note\n", { date: "2026-10-30", time: "", people: [] })).toBe(
      "# Just a note\n",
    );
  });
});
