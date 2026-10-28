import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { makeTask } from "@/test/taskFixtures";
import { todayIso } from "@/lib/taskLogic";

const apiMock = vi.hoisted(() => ({
  taggedNotes: vi.fn(),
  listDailyDates: vi.fn(() => Promise.resolve([])),
  listTasks: vi.fn(),
  listEpics: vi.fn(() => Promise.resolve([])),
  getEpicOrder: vi.fn(() => Promise.resolve([])),
  readNote: vi.fn(),
  writeNote: vi.fn(() => Promise.resolve()),
}));
vi.mock("@/lib/api", () => ({
  api: apiMock,
  toApiError: (e: unknown) => ({ code: "Unknown", message: String(e) }),
}));
vi.mock("@/lib/flush", () => ({ flushPendingWrites: () => Promise.resolve() }));

import { MeetingsPanel } from "./MeetingsPanel";
import { MeetingsView } from "./MeetingsView";
import { useMeetingStore } from "@/stores/meetingStore";
import { useTaskStore } from "@/stores/taskStore";
import { useUiStore } from "@/stores/uiStore";
import { useVaultStore } from "@/stores/vaultStore";

const today = todayIso();
const note = (path: string, front: string, body: string) => ({
  path,
  mtime: 0,
  content: `---\ntags: [meeting]\n${front}\n---\n${body}`,
});

describe("The Meetings area", () => {
  beforeEach(() => {
    apiMock.taggedNotes
      .mockReset()
      .mockResolvedValue([
        note(
          "Møder/Weekly.md",
          `meeting: ${today} 10:00\nwith: [Mette, Peter]`,
          "# Weekly with Mette\n\n## Agenda\n\n- [x] Budget\n- [ ] Hiring\n\n## Notes\n\n### Budget\n\nKeep the numbers.\n",
        ),
        note("Møder/Old.md", "meeting: 2020-01-01", "# Old meeting\n"),
      ]);
    apiMock.listTasks
      .mockReset()
      .mockResolvedValue([makeTask({ path: "Møder/Weekly.md", title: "Send the offer" })]);
    useMeetingStore.setState({ meetings: [], loaded: false, selected: null, day: null });
    useTaskStore.setState({
      tasks: [makeTask({ path: "Møder/Weekly.md", title: "Send the offer" })],
      epics: [],
      loaded: true,
    });
    useUiStore.setState({ centerView: "meetings", meetingFormOpen: false, meetingFocus: null });
  });

  it("lists today's and past meetings, and shows the chosen one in the middle", async () => {
    render(
      <>
        <MeetingsPanel />
        <MeetingsView />
      </>,
    );
    expect(await screen.findByRole("button", { name: /Weekly with Mette/ })).toHaveTextContent(
      "10:00",
    );
    expect(screen.getByRole("heading", { name: "Past" })).toBeInTheDocument();
    // The meeting of today is shown first, with its agenda, its tasks and what was written.
    expect(await screen.findByRole("heading", { name: "Weekly with Mette" })).toBeInTheDocument();
    expect(screen.getByText(/with Mette, Peter/)).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Agenda · 1 of 2 done" })).toBeInTheDocument();
    expect(screen.getByText("Send the offer")).toBeInTheDocument();
    expect(screen.getByText("Keep the numbers.")).toBeInTheDocument();
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: /Old meeting/ }));
    expect(await screen.findByRole("heading", { name: "Old meeting" })).toBeInTheDocument();
  });

  it("starts the meeting from the middle", async () => {
    render(<MeetingsView />);
    await userEvent.setup().click(await screen.findByRole("button", { name: /Start meeting/ }));
    expect(useUiStore.getState().meetingFocus).toBe("Møder/Weekly.md");
  });

  it("deletes a meeting after asking, and reads the list again", async () => {
    const deletePath = vi.fn().mockResolvedValue(true);
    useVaultStore.setState({ deletePath });
    render(<MeetingsView />);
    const user = userEvent.setup();
    await user.click(await screen.findByRole("button", { name: /^Delete$/ }));
    expect(deletePath).not.toHaveBeenCalled();
    const buttons = await screen.findAllByRole("button", { name: "Delete", hidden: true });
    await user.click(buttons[buttons.length - 1] as HTMLElement);
    await waitFor(() => {
      expect(deletePath).toHaveBeenCalledWith("Møder/Weekly.md");
    });
    await waitFor(() => {
      expect(apiMock.taggedNotes.mock.calls.length).toBeGreaterThan(1);
    });
  });

  it("ticks an agenda item in the note itself", async () => {
    apiMock.readNote.mockResolvedValue({
      path: "Møder/Weekly.md",
      mtime: 0,
      content: "# W\n\n## Agenda\n\n- [x] Budget\n- [ ] Hiring\n\n## Notes\n",
    });
    render(<MeetingsView />);
    await userEvent.setup().click(await screen.findByRole("checkbox", { name: "Done: Hiring" }));
    await waitFor(() => {
      expect(apiMock.writeNote).toHaveBeenCalledWith(
        "Møder/Weekly.md",
        expect.stringContaining("- [x] Hiring"),
      );
    });
  });

  it("opens the window for a new meeting", async () => {
    render(<MeetingsPanel />);
    await userEvent.setup().click(await screen.findByRole("button", { name: /New/ }));
    expect(useUiStore.getState().meetingFormOpen).toBe(true);
  });

  it("changes the day and time of a meeting, writing 12-hour times as 24-hour in the note", async () => {
    apiMock.readNote.mockResolvedValue({
      path: "Møder/Weekly.md",
      mtime: 0,
      content: `---\ntags: [meeting]\nmeeting: ${today} 10:00\n---\n# W\n`,
    });
    useUiStore.setState({ timeFormat: "12" });
    render(<MeetingsView />);
    const user = userEvent.setup();
    await user.click(await screen.findByRole("button", { name: /Change…/ }));
    const time = await screen.findByLabelText("Time");
    expect(time).toHaveValue("10:00 AM");
    await user.clear(time);
    await user.type(time, "2:30 pm");
    await user.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => {
      expect(apiMock.writeNote).toHaveBeenCalledWith(
        "Møder/Weekly.md",
        expect.stringContaining(`meeting: ${today} 14:30`),
      );
    });
    useUiStore.setState({ timeFormat: "system" });
  });

  it("does not save a time that cannot be read", async () => {
    render(<MeetingsView />);
    const user = userEvent.setup();
    await user.click(await screen.findByRole("button", { name: /Change…/ }));
    const time = await screen.findByLabelText("Time");
    await user.clear(time);
    await user.type(time, "25:00");
    expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();
    expect(time).toHaveAttribute("aria-invalid", "true");
  });

  it("explains how to make a meeting when there is none", async () => {
    apiMock.taggedNotes.mockResolvedValue([]);
    render(<MeetingsView />);
    expect(await screen.findByText("No meetings yet.")).toBeInTheDocument();
  });
});
