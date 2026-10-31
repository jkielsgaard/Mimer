import { describe, expect, it } from "vitest";
import {
  defaultMeeting,
  groupMeetings,
  meetingDays,
  meetingNotes,
  meetingsOn,
  toMeetingNotes,
  whenLabel,
} from "./meetingList";

const note = (
  path: string,
  front: string,
  body = "# T\n",
): { path: string; content: string; mtime: number } => ({
  path,
  mtime: 0,
  content: `---\ntags: [meeting]\n${front}\n---\n${body}`,
});

const list = toMeetingNotes([
  note("a.md", "meeting: 2026-10-28 14:30", "# Budget review\n"),
  note("b.md", "meeting: 2026-10-28 10:00", "# Weekly with Mette\n"),
  note("c.md", "meeting: 2026-10-29", "# 1:1 with Peter\n"),
  note("d.md", "meeting: 2026-10-27 09:00", "# Sync with Acme\n"),
  note("e.md", "meeting: 2026-10-20", "# Older\n"),
  note("f.md", "", "# No date\n"),
]);

describe("groupMeetings", () => {
  const g = groupMeetings(list, "2026-10-28");
  it("sorts into today, upcoming, past and undated", () => {
    expect(g.today.map((m) => m.path)).toEqual(["b.md", "a.md"]);
    expect(g.upcoming.map((m) => m.path)).toEqual(["c.md"]);
    // The latest past meeting comes first.
    expect(g.past.map((m) => m.path)).toEqual(["d.md", "e.md"]);
    expect(g.undated.map((m) => m.path)).toEqual(["f.md"]);
  });
});

describe("days", () => {
  it("lists the days with a meeting and the meetings of a day in order", () => {
    expect([...meetingDays(list)].sort()).toEqual([
      "2026-10-20",
      "2026-10-27",
      "2026-10-28",
      "2026-10-29",
    ]);
    expect(meetingsOn(list, "2026-10-28").map((m) => m.path)).toEqual(["b.md", "a.md"]);
  });
});

describe("defaultMeeting", () => {
  const g = groupMeetings(list, "2026-10-28");
  it("takes the next meeting of today, then the first of today, upcoming and past", () => {
    expect(defaultMeeting(g, new Date(2026, 9, 28, 11, 0))?.path).toBe("a.md");
    expect(defaultMeeting(g, new Date(2026, 9, 28, 18, 0))?.path).toBe("b.md");
    expect(defaultMeeting({ ...g, today: [] }, new Date())?.path).toBe("c.md");
    expect(defaultMeeting({ ...g, today: [], upcoming: [] }, new Date())?.path).toBe("d.md");
    expect(
      defaultMeeting({ today: [], upcoming: [], past: [], undated: [] }, new Date()),
    ).toBeNull();
  });
});

describe("whenLabel", () => {
  it("says the time today, the date on other days and No date", () => {
    const [b, c, f] = [list[1], list[2], list[5]];
    expect(whenLabel(b?.meeting ?? ({} as never), "2026-10-28")).toBe("10:00");
    // Another day shows the date and, when the meeting has one, the time.
    expect(whenLabel(c?.meeting ?? ({} as never), "2026-10-28")).toBe("Thu 29 Oct");
    expect(whenLabel(list[3]?.meeting ?? ({} as never), "2026-10-28")).toBe("Tue 27 Oct 09:00");
    expect(whenLabel(list[3]?.meeting ?? ({} as never), "2026-10-28", "12")).toBe(
      "Tue 27 Oct 9:00 AM",
    );
    expect(whenLabel(f?.meeting ?? ({} as never), "2026-10-28")).toBe("No date");
  });
});

describe("meetingNotes", () => {
  it("returns the one text of the meeting, also an older meeting with a part per item", () => {
    const m = toMeetingNotes([
      note(
        "x.md",
        "meeting: 2026-10-28",
        "# X\n\n## Agenda\n\n- [ ] Budget\n- [ ] Hiring\n\n## Notes\n\n### Budget\n\nAgreed.\n\n### Hiring\n\n",
      ),
    ])[0];
    expect(meetingNotes(m as never)).toBe("### Budget\n\nAgreed.\n\n### Hiring");
  });
});
