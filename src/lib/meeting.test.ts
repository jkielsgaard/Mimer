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
