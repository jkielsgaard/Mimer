import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { TreeNode } from "@/bindings/TreeNode";
import { buildMeetingNote, markItem, setItemNotes } from "@/lib/meeting";

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
}));
vi.mock("@/lib/api", () => ({
  api: apiMock,
  toApiError: (e: unknown) => ({ code: "Unknown", message: String(e) }),
}));
vi.mock("@/lib/flush", () => ({ flushPendingWrites: () => Promise.resolve() }));
const actions = vi.hoisted(() => ({ openFile: vi.fn() }));
vi.mock("@/lib/actions", () => actions);
vi.mock("@/features/capture/CaptureBox", () => ({ CaptureBox: () => <div>capture box</div> }));

import { MeetingFocus } from "./MeetingFocus";
import { MeetingForm } from "./MeetingForm";
import { candidatesIn, comingMeetings, MeetingLine } from "./MeetingLine";
import { StartMeetingButton } from "./StartMeetingButton";
import { useUiStore } from "@/stores/uiStore";
import { useVaultStore } from "@/stores/vaultStore";

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
  it("opens on the first item with its notes, and writes what you type into the note", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    useUiStore.setState({ meetingFocus: PATH });
    render(<MeetingFocus />);
    const area = await screen.findByLabelText("Notes for Budget");
    expect(screen.getByText("with Mette, Peter")).toBeInTheDocument();
    fireEvent.change(area, { target: { value: "Budget is on track." } });
    await vi.advanceTimersByTimeAsync(700);
    const written = apiMock.writeNote.mock.calls.at(-1);
    expect(written?.[0]).toBe(PATH);
    expect(written?.[1]).toContain("### Budget\n\nBudget is on track.\n");
    expect(written?.[1]).toContain("### Hiring");
    vi.useRealTimers();
  });

  it("goes to the next item, ticking this one, and says when it was the last", async () => {
    useUiStore.setState({ meetingFocus: PATH });
    render(<MeetingFocus />);
    await screen.findByLabelText("Notes for Budget");
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Next item →" }));
    expect(await screen.findByLabelText("Notes for Hiring")).toBeInTheDocument();
    expect(screen.getByRole("checkbox", { name: "Mark as not done: Budget" })).toHaveAttribute(
      "aria-checked",
      "true",
    );
    await user.click(screen.getByRole("button", { name: "Next item →" }));
    expect(await screen.findByText("That was the last item.")).toBeInTheDocument();
  });

  it("adds an agenda item and goes to it, and leaves with Esc after saving", async () => {
    useUiStore.setState({ meetingFocus: PATH });
    render(<MeetingFocus />);
    await screen.findByLabelText("Notes for Budget");
    const user = userEvent.setup();
    await user.type(screen.getByLabelText("Add an item to the agenda"), "Release{Enter}");
    expect(await screen.findByLabelText("Notes for Release")).toBeInTheDocument();
    await user.keyboard("{Escape}");
    await waitFor(() => {
      expect(useUiStore.getState().meetingFocus).toBeNull();
    });
    expect(apiMock.writeNote.mock.calls.at(-1)?.[1]).toContain("- [ ] Release");
  });

  it("works for a meeting without an agenda", async () => {
    apiMock.readNote.mockResolvedValue({
      path: PATH,
      content: "# Lunch\n\nsome text\n",
      mtime: 0,
    });
    useUiStore.setState({ meetingFocus: PATH });
    render(<MeetingFocus />);
    expect(await screen.findByLabelText("Notes for Notes")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Next item →" })).toBeNull();
  });

  it("lists an item added to a meeting that had no agenda, and writes it in the note", async () => {
    apiMock.readNote.mockResolvedValue({ path: PATH, content: "# Lunch\n\nsome text\n", mtime: 0 });
    useUiStore.setState({ meetingFocus: PATH });
    render(<MeetingFocus />);
    await screen.findByLabelText("Notes for Notes");
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
  const f = (name: string, dir = "Meetings"): TreeNode => ({
    name,
    path: `${dir}/${name}`,
    isDir: false,
    children: [],
    modified: 0,
  });
  const tree: TreeNode[] = [
    {
      name: "Meetings",
      path: "Meetings",
      isDir: true,
      modified: 0,
      children: [
        f("2026-10-27 Weekly with Mette.md"),
        f("2026-10-28 Budget review.md"),
        f("2026-10-30 Later.md"),
        f("Untitled.md"),
      ],
    },
  ];

  it("picks only today's and tomorrow's notes in the meetings folder", () => {
    const now = new Date(2026, 9, 27, 9, 0);
    expect(candidatesIn(tree, "Meetings", now)).toEqual([
      "Meetings/2026-10-27 Weekly with Mette.md",
      "Meetings/2026-10-28 Budget review.md",
    ]);
    expect(candidatesIn(tree, "Nothing", now)).toEqual([]);
  });

  it("keeps a meeting for two hours after it started, in the order they happen", () => {
    const mk = (date: string, time: string | null, title: string) => ({
      path: title,
      meeting: { title, date, time, people: [], agenda: [] },
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

  it("shows one line with Start and +N, and nothing when there is no meeting", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true, now: new Date(2026, 9, 27, 9, 0) });
    useVaultStore.setState({ tree });
    apiMock.readNote.mockImplementation((path: string) =>
      Promise.resolve({
        path,
        mtime: 0,
        content: path.includes("Weekly")
          ? note
          : buildMeetingNote({
              title: "Budget review",
              date: "2026-10-28",
              time: "11:00",
              people: [],
              agenda: [],
            }),
      }),
    );
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    render(<MeetingLine />);
    const start = await screen.findByRole("button", { name: "Start Weekly with Mette" });
    expect(screen.queryByText("Budget review")).toBeNull();
    await user.click(screen.getByRole("button", { name: "1 more meetings" }));
    expect(screen.getByText("Budget review")).toBeInTheDocument();
    await user.click(start);
    expect(useUiStore.getState().meetingFocus).toBe("Meetings/2026-10-27 Weekly with Mette.md");
    vi.useRealTimers();
  });

  it("renders nothing without a meeting today or tomorrow", () => {
    useVaultStore.setState({ tree: [] });
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
      content: setItemNotes(markItem(note, "Budget", true), "Hiring", "Talked about it."),
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
