import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { buildMeetingNote } from "@/lib/meeting";
import { todayAndTomorrow } from "@/lib/meeting";

const apiMock = vi.hoisted(() => ({ taggedNotes: vi.fn() }));
vi.mock("@/lib/api", () => ({
  api: apiMock,
  toApiError: (e: unknown) => ({ code: "Unknown", message: String(e) }),
}));
vi.mock("@/lib/flush", () => ({ flushPendingWrites: () => Promise.resolve() }));

import { NextMeetingWidget } from "./widgets";

const [today, tomorrow] = todayAndTomorrow(new Date());
const meeting = (title: string, date: string, time: string) => ({
  path: `${title}.md`,
  mtime: 0,
  content: buildMeetingNote({ title, date, time, people: [], agenda: [] }),
});

describe("NextMeetingWidget", () => {
  beforeEach(() => {
    apiMock.taggedNotes.mockReset();
  });

  it("lists today's and tomorrow's meetings that are still to come, with Start", async () => {
    apiMock.taggedNotes.mockResolvedValue([
      meeting("Late today", today, "23:58"),
      meeting("Tomorrow one", tomorrow, "11:00"),
      meeting("Later", "2099-01-01", "09:00"),
    ]);
    render(<NextMeetingWidget />);
    expect(await screen.findByRole("button", { name: "Start Late today" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Start Tomorrow one" })).toBeInTheDocument();
    expect(screen.queryByText("Later")).toBeNull();
    expect(screen.getByRole("heading", { name: "Today" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Tomorrow" })).toBeInTheDocument();
  });

  it("says so when there is none", async () => {
    apiMock.taggedNotes.mockResolvedValue([]);
    render(<NextMeetingWidget />);
    expect(await screen.findByText("No meetings today or tomorrow.")).toBeInTheDocument();
  });
});
