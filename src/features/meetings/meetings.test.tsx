import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ALL_PARTS, buildMeetingNote, markItem, setMeetingNotes } from "@/lib/meeting";

const apiMock = vi.hoisted(() => ({
  readNote: vi.fn(),
  writeNote: vi.fn(),
  createNote: vi.fn(),
  getTree: vi.fn(),
  listTasks: vi.fn(),
  listEpics: vi.fn(),
  getEpicOrder: vi.fn(),
  epicForNote: vi.fn(),
  taskAdd: vi.fn(),
  noteTags: vi.fn(),
  taggedNotes: vi.fn(),
}));
vi.mock("@/lib/api", () => ({
  api: apiMock,
  toApiError: (e: unknown) => ({ code: "Unknown", message: String(e) }),
}));
vi.mock("@/lib/flush", () => ({ flushPendingWrites: () => Promise.resolve() }));
const actions = vi.hoisted(() => ({ openFile: vi.fn() }));
vi.mock("@/lib/actions", () => actions);
vi.mock("@/features/capture/CapturePicker", () => ({
  CapturePicker: () => <div>capture box</div>,
}));

import { MeetingFocus } from "./MeetingFocus";
import { MeetingForm } from "./MeetingForm";
import { comingMeetings, MeetingLine } from "./MeetingLine";
import { StartMeetingButton } from "./StartMeetingButton";
import { useUiStore } from "@/stores/uiStore";
import { useVaultStore } from "@/stores/vaultStore";
import { fieldView, typeInField } from "@/test/markdownField";

const PATH = "Meetings/2026-10-27 Weekly with Mette.md";
const note = buildMeetingNote({
  title: "Weekly with Mette",
  date: "2026-10-27",
  time: "14:00",
  people: ["Mette", "Peter"],
  agenda: ["Budget", "Hiring"],
});

function vault(): void {
  useVaultStore.setState({
    vault: {
      name: "V",
      path: "/v",
      config: {
        schemaVersion: 1,
        attachmentsFolder: "attachments",
        newNoteFolder: "",
        dailyNotesFolder: "",
        dailyNoteFormat: "",
        dailyTemplate: "",
        meetingsFolder: "Meetings",
        quickNotesFolder: "Quick notes",
        imageLinkStyle: "markdown",
      },
    },
  });
}

beforeEach(() => {
  for (const f of Object.values(apiMock)) f.mockReset();
  apiMock.taggedNotes.mockResolvedValue([]);
  actions.openFile.mockReset();
  apiMock.writeNote.mockResolvedValue(undefined);
  apiMock.getTree.mockResolvedValue([]);
  apiMock.listTasks.mockResolvedValue([]);
  apiMock.listEpics.mockResolvedValue([
    { path: "Tasks/Launch.md", title: "Launch", source: null, description: "" },
  ]);
  apiMock.getEpicOrder.mockResolvedValue([]);
  apiMock.epicForNote.mockResolvedValue({
    path: "Tasks/Weekly.md",
    title: "Weekly with Mette",
    source: PATH,
    description: "",
  });
  apiMock.taskAdd.mockResolvedValue([]);
  apiMock.readNote.mockResolvedValue({ path: PATH, content: note, mtime: 0 });
  useUiStore.setState({ meetingFocus: null, meetingFormOpen: false });
  vault();
});

describe("MeetingFocus", () => {
  it("opens with the agenda, the notes of the whole meeting, decisions and actions, and writes what you type", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    useUiStore.setState({ meetingFocus: PATH });
    render(<MeetingFocus />);
    await screen.findByLabelText("Notes for the meeting");
    expect(screen.getByText("with Mette, Peter")).toBeInTheDocument();
    expect(screen.getByRole("navigation", { name: "Agenda" })).toBeInTheDocument();
    expect(screen.getByLabelText("Add a decision")).toBeInTheDocument();
    expect(screen.getByLabelText("Add an action")).toBeInTheDocument();
    typeInField("Notes for the meeting", "Budget is on track.");
    await vi.advanceTimersByTimeAsync(700);
    const written = apiMock.writeNote.mock.calls.at(-1);
    expect(written?.[0]).toBe(PATH);
    expect(written?.[1]).toContain("## Notes\n\nBudget is on track.\n");
    expect(written?.[1]).toContain("- [ ] Hiring");
    vi.useRealTimers();
  });

  it("keeps the notes when you go to another agenda item: it is only marked Now", async () => {
    useUiStore.setState({ meetingFocus: PATH });
    render(<MeetingFocus />);
    await screen.findByLabelText("Notes for the meeting");
    typeInField("Notes for the meeting", "Written under Budget.");
    const user = userEvent.setup();
    expect(screen.getByRole("button", { name: "Budget" })).toHaveAttribute("aria-current", "step");
    await user.click(screen.getByRole("button", { name: "Hiring" }));
    expect(screen.getByRole("button", { name: "Hiring" })).toHaveAttribute("aria-current", "step");
    expect(screen.getByRole("button", { name: "Budget" })).not.toHaveAttribute("aria-current");
    expect(fieldView("Notes for the meeting").state.doc.toString()).toBe("Written under Budget.");
    await user.click(screen.getByRole("checkbox", { name: "Mark as done: Budget" }));
    expect(screen.getByRole("checkbox", { name: "Mark as not done: Budget" })).toHaveAttribute(
      "aria-checked",
      "true",
    );
  });

  it("adds an agenda item and marks it Now, and leaves with Esc after saving", async () => {
    useUiStore.setState({ meetingFocus: PATH });
    render(<MeetingFocus />);
    await screen.findByLabelText("Notes for the meeting");
    const user = userEvent.setup();
    await user.type(screen.getByLabelText("Add an item to the agenda"), "Release{Enter}");
    expect(await screen.findByRole("button", { name: "Release" })).toHaveAttribute(
      "aria-current",
      "step",
    );
    await user.keyboard("{Escape}");
    await waitFor(() => {
      expect(useUiStore.getState().meetingFocus).toBeNull();
    });
    const saved = apiMock.writeNote.mock.calls.at(-1)?.[1] as string;
    expect(saved).toContain("- [ ] Release");
    expect(saved).not.toContain("### Release");
  });

  it("adds and removes decisions", async () => {
    useUiStore.setState({ meetingFocus: PATH });
    render(<MeetingFocus />);
    await screen.findByLabelText("Notes for the meeting");
    const user = userEvent.setup();
    await user.type(screen.getByLabelText("Add a decision"), "Rollout starts Monday{Enter}");
    expect(await screen.findByText("Rollout starts Monday")).toBeInTheDocument();
    await user.type(screen.getByLabelText("Add a decision"), "Buy licences{Enter}");
    await user.click(
      screen.getByRole("button", { name: "Remove the decision: Rollout starts Monday" }),
    );
    expect(screen.queryByText("Rollout starts Monday")).toBeNull();
    await user.keyboard("{Escape}");
    await waitFor(() => {
      expect(useUiStore.getState().meetingFocus).toBeNull();
    });
    const saved = apiMock.writeNote.mock.calls.at(-1)?.[1] as string;
    expect(saved).toContain("## Decisions\n\n- Buy licences");
    expect(saved).not.toContain("Rollout starts Monday");
  });

  it("adds an action as a task with its made date, and ticks it", async () => {
    useUiStore.setState({ meetingFocus: PATH });
    render(<MeetingFocus />);
    await screen.findByLabelText("Notes for the meeting");
    const user = userEvent.setup();
    await user.type(screen.getByLabelText("Add an action"), "Order licences{Enter}");
    await user.click(await screen.findByRole("checkbox", { name: "Mark as done: Order licences" }));
    await user.keyboard("{Escape}");
    await waitFor(() => {
      expect(useUiStore.getState().meetingFocus).toBeNull();
    });
    const saved = apiMock.writeNote.mock.calls.at(-1)?.[1] as string;
    expect(saved).toMatch(/## Actions\n\n- \[x\] Order licences made:\d{4}-\d{2}-\d{2}/);
  });

  it("turns a part on during the meeting, and the note gets its section", async () => {
    apiMock.readNote.mockResolvedValue({
      path: PATH,
      content: buildMeetingNote({
        title: "Lunch",
        date: "",
        time: "",
        people: [],
        agenda: [],
        parts: { agenda: false, decisions: false, actions: false },
      }),
      mtime: 0,
    });
    useUiStore.setState({ meetingFocus: PATH });
    render(<MeetingFocus />);
    await screen.findByLabelText("Notes for the meeting");
    expect(screen.queryByRole("navigation", { name: "Agenda" })).toBeNull();
    const user = userEvent.setup();
    await user.click(screen.getByRole("checkbox", { name: "Agenda" }));
    expect(screen.getByRole("navigation", { name: "Agenda" })).toBeInTheDocument();
    await user.type(screen.getByLabelText("Add an item to the agenda"), "First{Enter}");
    await user.click(screen.getByRole("checkbox", { name: "Actions" }));
    expect(screen.getByLabelText("Add an action")).toBeInTheDocument();
    await user.keyboard("{Escape}");
    await waitFor(() => {
      expect(useUiStore.getState().meetingFocus).toBeNull();
    });
    const saved = apiMock.writeNote.mock.calls.at(-1)?.[1] as string;
    expect(saved).toContain("parts: [agenda, actions]");
    expect(saved).toContain("- [ ] First");
  });

  it("shows only the parts the meeting has: no agenda gives the notes the whole width", async () => {
    apiMock.readNote.mockResolvedValue({
      path: PATH,
      content: buildMeetingNote({
        title: "Lunch",
        date: "",
        time: "",
        people: [],
        agenda: [],
        parts: { agenda: false, decisions: false, actions: true },
      }),
      mtime: 0,
    });
    useUiStore.setState({ meetingFocus: PATH });
    render(<MeetingFocus />);
    await screen.findByLabelText("Notes for the meeting");
    expect(screen.queryByRole("navigation", { name: "Agenda" })).toBeNull();
    expect(screen.queryByLabelText("Add a decision")).toBeNull();
    expect(screen.getByLabelText("Add an action")).toBeInTheDocument();
  });

  it("works for an old note without properties: all three parts, and an agenda item can be added", async () => {
    apiMock.readNote.mockResolvedValue({ path: PATH, content: "# Lunch\n\nsome text\n", mtime: 0 });
    useUiStore.setState({ meetingFocus: PATH });
    render(<MeetingFocus />);
    await screen.findByLabelText("Notes for the meeting");
    const user = userEvent.setup();
    await user.type(screen.getByLabelText("Add an item to the agenda"), "Food{Enter}");
    // The item is in the agenda list now, and the "No agenda" text is gone.
    expect(await screen.findByRole("button", { name: "Food" })).toBeInTheDocument();
    expect(screen.queryByText(/No agenda/)).toBeNull();
    await user.keyboard("{Escape}");
    await waitFor(() => {
      expect(useUiStore.getState().meetingFocus).toBeNull();
    });
    expect(apiMock.writeNote.mock.calls.at(-1)?.[1]).toContain("## Agenda\n\n- [ ] Food");
  });
});

describe("MeetingForm", () => {
  it("makes the note in the meetings folder, and starts the meeting when asked", async () => {
    apiMock.createNote.mockResolvedValue(PATH);
    useUiStore.setState({ meetingFormOpen: true });
    render(<MeetingForm />);
    const user = userEvent.setup();
    await user.type(await screen.findByLabelText("Title"), "Weekly with Mette");
    fireEvent.change(screen.getByLabelText("Day"), { target: { value: "2026-10-27" } });
    fireEvent.change(screen.getByLabelText("Time"), { target: { value: "14:00" } });
    await user.type(screen.getByLabelText("With"), "Mette, Peter");
    // The agenda box is there only when the Agenda option is ticked.
    expect(screen.queryByLabelText("Agenda, one item per line")).toBeNull();
    await user.click(screen.getByRole("checkbox", { name: "Agenda" }));
    await user.type(screen.getByLabelText("Agenda, one item per line"), "Budget{Enter}Hiring");
    await user.click(screen.getByRole("button", { name: "Create and start" }));
    await waitFor(() => {
      expect(useUiStore.getState().meetingFocus).toBe(PATH);
    });
    expect(apiMock.createNote).toHaveBeenCalledWith("Meetings", "2026-10-27 Weekly with Mette");
    // A save left over from the test before may arrive first; the form's own write is the one with the agenda.
    const text =
      apiMock.writeNote.mock.calls
        .map((c) => c[1] as string)
        .find((t) => t.includes("- [ ] Hiring")) ?? "";
    expect(text).toContain("meeting: 2026-10-27 14:00");
    expect(text).toContain("with: [Mette, Peter]");
    expect(text).toContain("- [ ] Hiring");
    expect(useUiStore.getState().meetingFormOpen).toBe(false);
  });

  it("has no part ticked the first time, a ticked part is written in the note and its section made, and the choice is remembered", async () => {
    window.localStorage.removeItem("mimer.meetingParts");
    apiMock.createNote.mockResolvedValue("Meetings/p.md");
    useUiStore.setState({ meetingFormOpen: true });
    const { unmount } = render(<MeetingForm />);
    const user = userEvent.setup();
    const decisions = await screen.findByRole("checkbox", { name: "Decisions" });
    for (const name of ["Agenda", "Decisions", "Actions"]) {
      expect(screen.getByRole("checkbox", { name })).not.toBeChecked();
    }
    expect(screen.queryByLabelText("Agenda, one item per line")).toBeNull();
    await user.click(decisions);
    await user.click(screen.getByRole("button", { name: "Create" }));
    await waitFor(() => {
      expect(apiMock.writeNote).toHaveBeenCalled();
    });
    const text = apiMock.writeNote.mock.calls.at(-1)?.[1] as string;
    expect(text).toContain("parts: [decisions]");
    expect(text).toContain("## Decisions");
    expect(text).not.toContain("## Agenda");
    expect(text).not.toContain("## Actions");
    unmount();
    // The next new meeting starts from the same choice.
    useUiStore.setState({ meetingFormOpen: false });
    useUiStore.setState({ meetingFormOpen: true });
    render(<MeetingForm />);
    expect(await screen.findByRole("checkbox", { name: "Decisions" })).toBeChecked();
    expect(screen.getByRole("checkbox", { name: "Agenda" })).not.toBeChecked();
    window.localStorage.removeItem("mimer.meetingParts");
  });

  it("Create keeps you where you are, and everything can be left empty", async () => {
    apiMock.createNote.mockResolvedValue("Meetings/x.md");
    useUiStore.setState({ meetingFormOpen: true });
    render(<MeetingForm />);
    await userEvent.setup().click(await screen.findByRole("button", { name: "Create" }));
    await waitFor(() => {
      expect(apiMock.writeNote).toHaveBeenCalled();
    });
    expect(useUiStore.getState().meetingFocus).toBeNull();
    expect(apiMock.createNote.mock.calls[0]?.[1]).toMatch(/^\d{4}-\d{2}-\d{2} Meeting$/);
  });
});

describe("the next meeting in Landing", () => {
  it("keeps a meeting for two hours after it started, in the order they happen", () => {
    const mk = (date: string, time: string | null, title: string) => ({
      path: title,
      meeting: { title, date, time, people: [], agenda: [], parts: ALL_PARTS },
    });
    const list = [
      mk("2026-10-28", "09:00", "Tomorrow"),
      mk("2026-10-27", "14:00", "Today"),
      mk("2026-10-27", "08:00", "Over"),
      mk("2026-10-27", null, "No time"),
    ];
    const titles = (h: number) =>
      comingMeetings(list, new Date(2026, 9, 27, h, 0)).map((p) => p.path);
    // At 09:00 the 08:00 meeting started an hour ago and is still on the line.
    expect(titles(9)).toEqual(["Over", "Today", "No time", "Tomorrow"]);
    // At 11:00 it started more than two hours ago and is gone.
    expect(titles(11)).toEqual(["Today", "No time", "Tomorrow"]);
  });

  it("shows one line with Start and +N, from the notes tagged as meetings", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true, now: new Date(2026, 9, 27, 9, 0) });
    apiMock.taggedNotes.mockResolvedValue([
      { path: "Work/Weekly.md", mtime: 0, content: note },
      {
        path: "Work/Budget.md",
        mtime: 0,
        content: buildMeetingNote({
          title: "Budget review",
          date: "2026-10-28",
          time: "11:00",
          people: [],
          agenda: [],
        }),
      },
      {
        path: "Work/Later.md",
        mtime: 0,
        content: buildMeetingNote({
          title: "Later",
          date: "2026-10-30",
          time: "11:00",
          people: [],
          agenda: [],
        }),
      },
    ]);
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    render(<MeetingLine />);
    const start = await screen.findByRole("button", { name: "Start Weekly with Mette" });
    expect(screen.queryByText("Budget review")).toBeNull();
    expect(screen.queryByText("Later")).toBeNull();
    await user.click(screen.getByRole("button", { name: "1 more meetings" }));
    expect(screen.getByText("Budget review")).toBeInTheDocument();
    await user.click(start);
    expect(useUiStore.getState().meetingFocus).toBe("Work/Weekly.md");
    vi.useRealTimers();
  });

  it("renders nothing without a meeting today or tomorrow", () => {
    apiMock.taggedNotes.mockResolvedValue([]);
    const { container } = render(<MeetingLine />);
    expect(container).toBeEmptyDOMElement();
  });
});

describe("StartMeetingButton", () => {
  it("is shown above a note tagged as a meeting, wherever it is", async () => {
    apiMock.noteTags.mockResolvedValue(["meeting"]);
    render(<StartMeetingButton path="Work/Weekly.md" />);
    expect(await screen.findByRole("button", { name: /Start meeting/ })).toBeInTheDocument();
    apiMock.noteTags.mockReset();
  });

  it("is shown above a note tagged as a meeting only, also in the meetings folder", async () => {
    apiMock.noteTags.mockResolvedValue([]);
    const { rerender } = render(<StartMeetingButton path={PATH} />);
    expect(screen.queryByRole("button", { name: /Start meeting/ })).toBeNull();
    apiMock.noteTags.mockResolvedValue(["meeting"]);
    rerender(<StartMeetingButton path="Work/Weekly.md" />);
    await userEvent.setup().click(await screen.findByRole("button", { name: /Start meeting/ }));
    expect(useUiStore.getState().meetingFocus).toBe("Work/Weekly.md");
  });

  it("is shown above a note tagged as a meeting, wherever it is", async () => {
    apiMock.noteTags.mockResolvedValue(["meeting"]);
    render(<StartMeetingButton path="Work/Weekly.md" />);
    expect(await screen.findByRole("button", { name: /Start meeting/ })).toBeInTheDocument();
    apiMock.noteTags.mockReset();
  });
});

describe("after the meeting", () => {
  it("opens the meeting window filled in for the next meeting, with what was not reached", async () => {
    apiMock.readNote.mockResolvedValue({
      path: PATH,
      content: setMeetingNotes(markItem(note, "Budget", true), "Talked about it."),
      mtime: 0,
    });
    apiMock.noteTags.mockResolvedValue(["meeting"]);
    render(<StartMeetingButton path={PATH} />);
    const user = userEvent.setup();
    await user.click(await screen.findByRole("button", { name: /Prepare next meeting/ }));
    await waitFor(() => {
      expect(useUiStore.getState().meetingFormOpen).toBe(true);
    });
    expect(useUiStore.getState().meetingSeed).toEqual({
      title: "Weekly with Mette",
      date: "2026-11-03",
      time: "14:00",
      who: "Mette, Peter",
      agenda: "Hiring",
      parts: ALL_PARTS,
    });
    render(<MeetingForm />);
    expect(await screen.findByLabelText("Title")).toHaveValue("Weekly with Mette");
    expect(screen.getByLabelText("Day")).toHaveValue("2026-11-03");
    expect(screen.getByLabelText("With")).toHaveValue("Mette, Peter");
    expect(screen.getByLabelText("Agenda, one item per line")).toHaveValue("Hiring");
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(useUiStore.getState().meetingSeed).toBeNull();
  });
});
