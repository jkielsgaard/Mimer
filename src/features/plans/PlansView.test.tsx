import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { makeTask } from "@/test/taskFixtures";

const apiMock = vi.hoisted(() => ({
  taggedNotes: vi.fn(),
  readNote: vi.fn(),
  writeNote: vi.fn(),
  noteSetTag: vi.fn(),
}));
vi.mock("@/lib/api", () => ({
  api: apiMock,
  toApiError: (e: unknown) => ({ code: "Unknown", message: String(e) }),
}));
vi.mock("@/lib/flush", () => ({ flushPendingWrites: () => Promise.resolve() }));
vi.mock("@/lib/useAiBlocked", () => ({ useAiBlocked: () => null }));
vi.mock("@/lib/askAi", () => ({
  askAi: () => ({ promise: Promise.resolve("- Pick a date\n- Tell the staff"), cancel: vi.fn() }),
}));

import { LinkResolver } from "@/lib/links";
import { parsePlan } from "@/lib/planTree";
import { PlansView } from "./PlansView";
import { usePlanStore } from "@/stores/planStore";
import { useTaskStore } from "@/stores/taskStore";
import { useUiStore } from "@/stores/uiStore";
import { useVaultStore } from "@/stores/vaultStore";

const PATH = "Plans/Move.md";
const NOTE = `---
tags: [plan]
---
# Move the office

- Find the place [[Tasks/Find the place]]
  - Visit the offices
  - Ask Mette
- Network [[Network plan]]
- Moving day
  - Book the van
  - Tell the staff
`;

const epics = [
  { path: "Tasks/Find the place.md", title: "Find the place", source: null, description: "" },
];
const tasks = [
  makeTask({ path: "Tasks/Find the place.md", line: 3, title: "Visit the offices", done: true }),
  makeTask({ path: "Tasks/Find the place.md", line: 4, title: "Ask Mette" }),
];

describe("PlansView", () => {
  const epicFor = vi.fn();
  const addToNote = vi.fn();
  const createEpic = vi.fn();
  const open = vi.fn();
  const openEpic = vi.fn();

  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
    apiMock.writeNote.mockResolvedValue(undefined);
    apiMock.noteSetTag.mockResolvedValue([]);
    apiMock.taggedNotes.mockResolvedValue([{ path: PATH, content: NOTE }]);
    apiMock.readNote.mockImplementation(() => Promise.resolve({ path: PATH, content: NOTE }));
    epicFor.mockResolvedValue("Tasks/Move the office.md");
    addToNote.mockResolvedValue(undefined);
    createEpic.mockResolvedValue("Tasks/Find the place 2.md");
    useTaskStore.setState({
      tasks,
      epics,
      epicOrder: [],
      loaded: true,
      load: vi.fn().mockResolvedValue(undefined),
      epicFor,
      addToNote,
      createEpic,
      open,
      openEpic,
    });
    useVaultStore.setState({
      projects: [],
      files: [PATH, "Tasks/Find the place.md", "Notes/Network plan.md", "Notes/Other.md"],
      resolver: new LinkResolver([PATH, "Tasks/Find the place.md", "Notes/Network plan.md"]),
      openNote: vi.fn().mockResolvedValue(undefined),
      refreshTree: vi.fn().mockResolvedValue(undefined),
    });
    useUiStore.setState({ centerView: "plans" });
    usePlanStore.setState({
      plans: [],
      path: PATH,
      title: "Move the office",
      finished: false,
      nodes: parsePlan(NOTE).nodes,
      view: "outline",
      selected: null,
      dialog: null,
      guidedOpen: false,
      adding: null,
    });
  });

  it("asks you to choose or make a plan when none is open", async () => {
    usePlanStore.setState({ path: null, nodes: [] });
    render(<PlansView />);
    expect(screen.getByText("Break something big down.")).toBeInTheDocument();
    await userEvent.setup().click(screen.getByRole("button", { name: "New plan" }));
    expect(usePlanStore.getState().guidedOpen).toBe(true);
  });

  it("shows the ideas as an outline, with what each is tied to and a place to start", async () => {
    render(<PlansView />);
    expect(screen.getByText("Find the place")).toBeInTheDocument();
    // The epic shows how far it has come, the note it links to is a chip, and the epic opens.
    const epic = screen.getByRole("button", { name: "Epic · 1 of 2" });
    await userEvent.setup().click(epic);
    expect(openEpic).toHaveBeenCalledWith("Tasks/Find the place.md");
    expect(screen.getByRole("button", { name: /Note · Network plan/ })).toBeInTheDocument();
    // The smallest place to start is the first open task under an epic of the plan.
    const card = screen.getByText("A small place to start").parentElement as HTMLElement;
    expect(card).toHaveTextContent("Ask Mette");
    await userEvent.setup().click(screen.getByRole("button", { name: "Open the task" }));
    expect(open).toHaveBeenCalled();
  });

  it("folds a branch", async () => {
    render(<PlansView />);
    const user = userEvent.setup();
    expect(screen.getByText("Book the van")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Fold Moving day" }));
    expect(screen.queryByText("Book the van")).toBeNull();
  });

  it("adds an idea at the end, and writes it in the note without touching the rest", async () => {
    render(<PlansView />);
    const user = userEvent.setup();
    await user.type(
      screen.getByRole("textbox", { name: "+ Add an idea" }),
      "Order a new sign{Enter}",
    );
    await waitFor(() => {
      expect(apiMock.writeNote).toHaveBeenCalled();
    });
    const [where, text] = apiMock.writeNote.mock.calls[0] as [string, string];
    expect(where).toBe(PATH);
    expect(text).toContain("tags: [plan]");
    expect(text.trimEnd().endsWith("- Order a new sign")).toBe(true);
  });

  it("writes a tree down with Enter, Tab and Shift+Tab, and takes a pasted indented list", async () => {
    const written: Record<string, string> = {};
    apiMock.writeNote.mockImplementation((p: string, c: string) => {
      written[p] = c;
      return Promise.resolve(undefined);
    });
    apiMock.readNote.mockImplementation((p: string) =>
      Promise.resolve({ path: p, content: written[p] ?? NOTE }),
    );
    render(<PlansView />);
    const user = userEvent.setup();
    const field = screen.getByRole("textbox", { name: "+ Add an idea" });
    await user.type(field, "Alpha{Enter}{Tab}Beta{Enter}{Shift>}{Tab}{/Shift}Gamma{Enter}");
    await waitFor(() => {
      expect(written[PATH]).toContain("- Alpha\n  - Beta\n- Gamma");
    });
    await user.click(field);
    await user.paste("One\n  Two\n  Three\nFour");
    await waitFor(() => {
      expect(written[PATH]).toContain("- One\n  - Two\n  - Three\n- Four");
    });
  });

  it("keeps the epic of a plan in a project in the project's Epics folder", async () => {
    useVaultStore.setState({ projects: [{ id: "p1", name: "Plans", folder: "Plans" } as never] });
    render(<PlansView />);
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "More for Network" }));
    await user.click(await screen.findByRole("menuitem", { name: "Link or make a task…" }));
    await user.click(await screen.findByRole("button", { name: "Make a new task" }));
    await waitFor(() => {
      expect(epicFor).toHaveBeenCalledWith(PATH, "Plans/Epics");
    });
  });

  it("makes a task of an idea in the epic made for the plan", async () => {
    render(<PlansView />);
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "More for Network" }));
    await user.click(await screen.findByRole("menuitem", { name: "Link or make a task…" }));
    await user.click(await screen.findByRole("button", { name: "Make a new task" }));
    await waitFor(() => {
      expect(addToNote).toHaveBeenCalledWith("Tasks/Move the office.md", ["Network"]);
    });
    expect(epicFor).toHaveBeenCalledWith(PATH);
  });

  it("makes an epic from an idea: the ticked sub-ideas become its tasks, and the idea links to it", async () => {
    render(<PlansView />);
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "More for Moving day" }));
    await user.click(await screen.findByRole("menuitem", { name: "Link or make an epic…" }));
    const dialog = await screen.findByRole("dialog");
    expect(dialog).toHaveTextContent("Link or make an epic for “Moving day”");
    await user.click(within(dialog).getByRole("checkbox", { name: "Tell the staff" }));
    await user.click(within(dialog).getByRole("button", { name: "Make the epic" }));
    await waitFor(() => {
      expect(createEpic).toHaveBeenCalledWith("Moving day", false);
    });
    expect(addToNote).toHaveBeenCalledWith("Tasks/Find the place 2.md", ["Book the van"]);
    await waitFor(() => {
      expect(apiMock.writeNote).toHaveBeenCalled();
    });
    expect(apiMock.writeNote.mock.calls[0]?.[1]).toContain(
      "- Moving day [[Tasks/Find the place 2]]",
    );
  });

  it("links a note to an idea", async () => {
    render(<PlansView />);
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "More for Moving day" }));
    await user.click(await screen.findByRole("menuitem", { name: "Link or make a note…" }));
    const dialog = await screen.findByRole("dialog");
    await user.type(within(dialog).getByRole("textbox", { name: "Search for a note" }), "other");
    await user.click(within(dialog).getByRole("button", { name: /Other/ }));
    await waitFor(() => {
      expect(apiMock.writeNote).toHaveBeenCalled();
    });
    expect(apiMock.writeNote.mock.calls[0]?.[1]).toContain("- Moving day [[Notes/Other]]");
  });

  it("suggests parts with the AI, and adds only the ticked ones", async () => {
    render(<PlansView />);
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "More for Network" }));
    await user.click(await screen.findByRole("menuitem", { name: "Break it down…" }));
    const dialog = await screen.findByRole("dialog");
    expect(await within(dialog).findByText("Pick a date")).toBeInTheDocument();
    await user.click(within(dialog).getByRole("checkbox", { name: "Tell the staff" }));
    await user.click(within(dialog).getByRole("button", { name: "Add 1" }));
    await waitFor(() => {
      expect(apiMock.writeNote).toHaveBeenCalled();
    });
    expect(apiMock.writeNote.mock.calls[0]?.[1]).toContain(
      "- Network [[Network plan]]\n  - Pick a date\n",
    );
  });

  it("repeats the steps of a branch for several names: one epic, a task for each, the steps as its steps", async () => {
    const addStep = vi.fn().mockResolvedValue(undefined);
    const names = ["Copenhagen", "Aarhus"].map((title) => ({
      ...tasks[0],
      path: "Tasks/Move the office.md",
      title,
    })) as typeof tasks;
    useTaskStore.setState({ addStep, tasks: [...tasks, ...names] });
    render(<PlansView />);
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "More for Moving day" }));
    await user.click(await screen.findByRole("menuitem", { name: "Repeat these steps for…" }));
    const dialog = await screen.findByRole("dialog");
    await user.type(
      within(dialog).getByRole("textbox", { name: "Names" }),
      "Copenhagen{Enter}Aarhus",
    );
    await user.click(within(dialog).getByRole("button", { name: "Make 2 tasks" }));
    await waitFor(() => {
      expect(apiMock.writeNote).toHaveBeenCalled();
    });
    expect(createEpic).not.toHaveBeenCalled();
    expect(addToNote).toHaveBeenCalledWith("Tasks/Move the office.md", ["Copenhagen", "Aarhus"]);
    expect(addStep).toHaveBeenCalledTimes(4);
    const text = apiMock.writeNote.mock.calls[0]?.[1] as string;
    expect(text).toContain(
      "- Copenhagen [[Tasks/Move the office#Copenhagen]]\n  - Book the van\n  - Tell the staff\n",
    );
    expect(text).toContain("- Aarhus [[Tasks/Move the office#Aarhus]]\n");
  });

  it("finishes a plan and carries the open ideas over to a new one, which keeps a line about it", async () => {
    apiMock.taggedNotes.mockResolvedValue([]);
    const written: Record<string, string> = {};
    apiMock.writeNote.mockImplementation((p: string, c: string) => {
      written[p] = c;
      return Promise.resolve(undefined);
    });
    apiMock.readNote.mockImplementation((p: string) =>
      Promise.resolve({ path: p, content: written[p] ?? NOTE }),
    );
    render(<PlansView />);
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Finish…" }));
    const dialog = await screen.findByRole("dialog");
    // The idea whose epic is not finished and the ideas without one are offered; unticking one keeps it here.
    await user.click(within(dialog).getByRole("checkbox", { name: "Network" }));
    await user.click(within(dialog).getByRole("button", { name: "Finish and carry over" }));
    await waitFor(() => {
      expect(apiMock.noteSetTag).toHaveBeenCalledWith(PATH, "plan-finished", true);
    });
    const next = written["Plans/Move the office (continued).md"] ?? "";
    expect(next).toContain("- Find the place [[Tasks/Find the place]]");
    expect(next).toContain("- Moving day");
    expect(next).not.toContain("- Network");
    const old = written[PATH] ?? "";
    expect(old).toContain("- Network [[Network plan]]");
    expect(old).toContain("- Moved to [[Plans/Move the office (continued)]]");
    expect(old).not.toContain("- Moving day");
  });

  it("shows the same ideas as a map, and acts on the chosen box", async () => {
    usePlanStore.setState({ view: "map" });
    render(<PlansView />);
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Network" }));
    const panel = screen.getByRole("complementary", { name: "The chosen idea" });
    expect(panel).toHaveTextContent("Network");
    await user.click(within(panel).getByRole("button", { name: "Link or make a task…" }));
    expect(usePlanStore.getState().dialog?.kind).toBe("linktask");
  });

  it("starts the map with the plan as a box, takes a right-click, and changes the words of a box", async () => {
    usePlanStore.setState({ view: "map" });
    render(<PlansView />);
    const user = userEvent.setup();
    await user.dblClick(screen.getByRole("button", { name: /^Network/ }));
    expect(screen.getByRole("textbox", { name: "Words of Network" })).toBeInTheDocument();
    await user.keyboard("{Escape}");
    const root = screen.getAllByRole("button", { name: "Move the office" })[0];
    expect(root).toBeDefined();
    if (!root) return;
    await user.pointer({ keys: "[MouseRight]", target: root });
    await user.click(await screen.findByRole("menuitem", { name: "Add a sub-idea" }));
    expect(usePlanStore.getState().dialog).toEqual({ kind: "add", path: [] });
    usePlanStore.getState().setDialog(null);
  });

  it("switches between the outline and the map, and can be finished and opened again", async () => {
    render(<PlansView />);
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Map" }));
    expect(usePlanStore.getState().view).toBe("map");
    usePlanStore.setState({ finished: true });
    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Open it again" })).toBeInTheDocument();
    });
    expect(screen.getByText(/This plan is finished/)).toBeInTheDocument();
  });
});
