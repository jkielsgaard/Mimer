import { describe, expect, it } from "vitest";
import {
  addDays,
  addItem,
  buildMeetingNote,
  itemNotes,
  markItem,
  meetingMoment,
  nextMeetingSeed,
  parseMeeting,
  setItemNotes,
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
  it("writes the date and people as properties, the agenda as a checklist and a part per item", () => {
    expect(full).toBe(
      [
        "---",
        "tags: [meeting]",
        "meeting: 2026-10-27 14:00",
        "with: [Mette, Peter]",
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
        "### Budget",
        "",
        "### Hiring",
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
    });
  });

  it("reads a plain note without any properties", () => {
    const m = parseMeeting("# Lunch\n\nSome text\n");
    expect(m.title).toBe("Lunch");
    expect(m.date).toBeNull();
    expect(m.agenda).toEqual([]);
  });
});

describe("notes per agenda item", () => {
  it("reads and writes the text under one item and leaves the others alone", () => {
    expect(itemNotes(full, "Budget")).toBe("");
    const a = setItemNotes(full, "Hiring", "Peter: two people\n**Decision:** one in Q1");
    expect(itemNotes(a, "Hiring")).toBe("Peter: two people\n**Decision:** one in Q1");
    expect(itemNotes(a, "Budget")).toBe("");
    const b = setItemNotes(a, "Hiring", "changed");
    expect(itemNotes(b, "Hiring")).toBe("changed");
    expect(b.match(/### Hiring/g)).toHaveLength(1);
    expect(setItemNotes(b, "Hiring", "")).toBe(setItemNotes(full, "Hiring", ""));
  });

  it("makes the part when it is missing, and the Notes section when there is none", () => {
    expect(itemNotes(setItemNotes(full, "Release", "x"), "Release")).toBe("x");
    const bare = "# T\n\n## Agenda\n\n- [ ] One\n";
    const made = setItemNotes(bare, "One", "hello");
    expect(made).toContain("## Notes");
    expect(itemNotes(made, "One")).toBe("hello");
  });
});

describe("a meeting without an agenda", () => {
  it("writes under ## Notes without a second heading called Notes", () => {
    const made = setItemNotes("# Lunch\n\nsome text\n", "Notes", "Talked about food");
    expect(made).toContain("## Notes\n\nTalked about food");
    expect(made).not.toContain("### Notes");
    expect(itemNotes(made, "Notes")).toBe("Talked about food");
    // A part of an item that is added later does not end up in the general text.
    const more = setItemNotes(made, "Budget", "x");
    expect(itemNotes(more, "Notes")).toBe("Talked about food");
    expect(itemNotes(more, "Budget")).toBe("x");
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

  it("adds an item with its own part, and uses up the empty first line", () => {
    const more = addItem(full, "Next release");
    expect(parseMeeting(more).agenda.map((a) => a.text)).toEqual([
      "Budget",
      "Hiring",
      "Next release",
    ]);
    expect(more).toContain("### Next release");
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
    const content = setItemNotes(markItem(full, "Budget", true), "Hiring", "Talked about it.");
    expect(nextMeetingSeed(content)).toEqual({
      title: "Weekly with Mette",
      date: "2026-11-03",
      time: "14:00",
      who: "Mette, Peter",
      agenda: "Hiring",
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
