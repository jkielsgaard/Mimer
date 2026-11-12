import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const apiMock = vi.hoisted(() => ({
  taggedNotes: vi.fn(),
  readNote: vi.fn(),
  writeNote: vi.fn(),
  noteSetTag: vi.fn(),
  createProject: vi.fn(),
}));
vi.mock("@/lib/api", () => ({
  api: apiMock,
  toApiError: (e: unknown) => ({ code: "Unknown", message: String(e) }),
}));
vi.mock("@/lib/flush", () => ({ flushPendingWrites: () => Promise.resolve() }));
vi.mock("@/lib/useAiBlocked", () => ({ useAiBlocked: () => null }));
vi.mock("@/lib/askAi", () => ({ askAi: vi.fn() }));

import { GuidedDialog } from "./GuidedDialog";
import { PlanDialogs } from "./PlanDialogs";
import { PlansPanel } from "./PlansPanel";
import { usePlanStore } from "@/stores/planStore";
import { useTaskStore } from "@/stores/taskStore";
import { useUiStore } from "@/stores/uiStore";
import { useVaultStore } from "@/stores/vaultStore";

describe("GuidedDialog", () => {
  const written: Record<string, string> = {};
  const epicFor = vi.fn().mockResolvedValue("Tasks/Move.md");
  const addToNote = vi.fn().mockResolvedValue(undefined);

  beforeEach(() => {
    vi.clearAllMocks();
    for (const k of Object.keys(written)) Reflect.deleteProperty(written, k);
    apiMock.taggedNotes.mockResolvedValue([]);
    apiMock.writeNote.mockImplementation((p: string, c: string) => {
      written[p] = c;
      return Promise.resolve(undefined);
    });
    apiMock.readNote.mockImplementation((p: string) =>
      Promise.resolve({ path: p, content: written[p] ?? "" }),
    );
    epicFor.mockResolvedValue("Tasks/Move.md");
    apiMock.createProject.mockImplementation((name: string) => Promise.resolve({ folder: name }));
    useTaskStore.setState({
      epicFor,
      addToNote,
      load: vi.fn().mockResolvedValue(undefined),
      epics: [],
      tasks: [],
    });
    useVaultStore.setState({
      files: [],
      resolver: useVaultStore.getState().resolver,
      refreshTree: vi.fn().mockResolvedValue(undefined),
      refreshProjects: vi.fn().mockResolvedValue(undefined),
    });
    usePlanStore.setState({ path: null, nodes: [], dialog: null, guidedOpen: true });
  });

  it("makes the plan in Plans, without a project, when the box is unticked", async () => {
    render(<GuidedDialog hidden={false} />);
    const user = userEvent.setup();
    await user.type(screen.getByRole("textbox"), "Move the office");
    await user.click(screen.getByRole("checkbox", { name: /Make a project for it/ }));
    await user.click(screen.getByRole("button", { name: "Just make the plan" }));
    await waitFor(() => {
      expect(usePlanStore.getState().path).toBe("Plans/Move the office.md");
    });
    expect(apiMock.createProject).not.toHaveBeenCalled();
  });

  it("makes a project with the name of the plan, and the plan in its folder", async () => {
    render(<GuidedDialog hidden={false} />);
    const user = userEvent.setup();
    await user.type(screen.getByRole("textbox"), "Move the office");
    await user.click(screen.getByRole("button", { name: "Just make the plan" }));
    await waitFor(() => {
      expect(usePlanStore.getState().path).toBe("Move the office/Move the office.md");
    });
    expect(apiMock.createProject).toHaveBeenCalledWith("Move the office", "", null);
  });

  it("can make just the plan from its name, without the steps", async () => {
    render(<GuidedDialog hidden={false} />);
    const user = userEvent.setup();
    await user.type(screen.getByRole("textbox"), "Move the office");
    await user.click(screen.getByRole("button", { name: "Just make the plan" }));
    await waitFor(() => {
      expect(usePlanStore.getState().path).toBe("Move the office/Move the office.md");
    });
    expect(usePlanStore.getState().guidedOpen).toBe(false);
  });

  it("makes a plan from a name, takes parts and smaller parts, and makes the smallest a task", async () => {
    render(<GuidedDialog hidden={false} />);
    const user = userEvent.setup();
    // 1. What is it?
    await user.type(screen.getByRole("textbox"), "Move the office");
    await user.click(screen.getByRole("button", { name: "Next: the parts" }));
    await waitFor(() => {
      expect(usePlanStore.getState().path).toBe("Move the office/Move the office.md");
    });
    expect(written["Move the office/Move the office.md"]).toContain("tags: [plan]");
    // 2. The parts, and a part broken into a smaller one.
    await user.type(
      await screen.findByRole("textbox", { name: "Add a part" }),
      "Find a place{Enter}",
    );
    await screen.findByText("1 parts").catch(() => undefined);
    await user.click(await screen.findByRole("button", { name: "Break it down" }));
    await user.type(
      screen.getByRole("textbox", { name: "A smaller part of Find a place" }),
      "Visit the offices{Enter}",
    );
    await waitFor(() => {
      expect(written["Move the office/Move the office.md"]).toContain(
        "- Find a place\n  - Visit the offices",
      );
    });
    // 3. Where to start: only the smallest parts are offered.
    await user.click(screen.getByRole("button", { name: "Next: where to start" }));
    const list = screen.getByRole("list", { name: "Where to start" });
    expect(within(list).getAllByRole("radio")).toHaveLength(1);
    await user.click(within(list).getByRole("radio", { name: "Visit the offices" }));
    await user.click(screen.getByRole("button", { name: "Make it a task now" }));
    await waitFor(() => {
      expect(addToNote).toHaveBeenCalledWith("Tasks/Move.md", ["Visit the offices"]);
    });
    expect(usePlanStore.getState().guidedOpen).toBe(false);
  });

  it("can be left after the first step, and the plan is kept", async () => {
    render(<GuidedDialog hidden={false} />);
    const user = userEvent.setup();
    await user.type(screen.getByRole("textbox"), "Learn the new client");
    await user.click(screen.getByRole("button", { name: "Next: the parts" }));
    await user.click(await screen.findByRole("button", { name: "Save and come back later" }));
    expect(usePlanStore.getState().guidedOpen).toBe(false);
    expect(written["Learn the new client/Learn the new client.md"]).toBeDefined();
  });
});

describe("ImportProject", () => {
  const written: Record<string, string> = {};
  beforeEach(() => {
    vi.clearAllMocks();
    for (const k of Object.keys(written)) Reflect.deleteProperty(written, k);
    apiMock.taggedNotes.mockResolvedValue([]);
    apiMock.writeNote.mockImplementation((p: string, c: string) => {
      written[p] = c;
      return Promise.resolve(undefined);
    });
    apiMock.readNote.mockImplementation((p: string) =>
      Promise.resolve({ path: p, content: written[p] ?? "" }),
    );
    useVaultStore.setState({
      files: ["Move/Notes/Contract.md", "Move/Vans.md"],
      projects: [{ id: "p1", name: "Move", folder: "Move" } as never],
      refreshTree: vi.fn().mockResolvedValue(undefined),
    });
    usePlanStore.setState({
      plans: [],
      path: null,
      nodes: [],
      dialog: { kind: "import", folder: "Move" },
    });
  });

  it("makes a plan note in the project folder, with the notes as ideas, and changes nothing else", async () => {
    render(<PlanDialogs />);
    const user = userEvent.setup();
    await user.click(await screen.findByRole("button", { name: "Make the plan" }));
    await waitFor(() => {
      expect(usePlanStore.getState().path).toBe("Move/Move.md");
    });
    expect(written["Move/Move.md"]).toContain("tags: [plan]");
    expect(written["Move/Move.md"]).toContain("- Notes\n  - Contract [[Move/Notes/Contract]]");
    expect(written["Move/Move.md"]).toContain("- Vans [[Move/Vans]]");
    expect(Object.keys(written)).toEqual(["Move/Move.md"]);
    expect(apiMock.createProject).not.toHaveBeenCalled();
  });

  it("takes only the plan note when the notes are not wanted", async () => {
    render(<PlanDialogs />);
    const user = userEvent.setup();
    await user.click(
      await screen.findByRole("checkbox", { name: /Start the plan with the notes/ }),
    );
    await user.click(screen.getByRole("button", { name: "Make the plan" }));
    await waitFor(() => {
      expect(written["Move/Move.md"]).toBeDefined();
    });
    expect(written["Move/Move.md"]).not.toContain("Contract");
  });
});

describe("PlansPanel", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    apiMock.taggedNotes.mockResolvedValue([
      { path: "Plans/Move.md", content: "---\ntags: [plan]\n---\n# Move\n\n- a\n- b\n" },
      {
        path: "Plans/Old.md",
        content: "---\ntags: [plan, plan-finished]\n---\n# Old one\n\n- x\n",
      },
    ]);
    apiMock.readNote.mockResolvedValue({ path: "Plans/Move.md", content: "# Move\n\n- a\n" });
    useUiStore.setState({ centerView: "start" });
    usePlanStore.setState({ plans: [], loaded: false, path: null, guidedOpen: false });
  });

  it("lists the plans that go on and the finished ones apart, and opens one", async () => {
    render(<PlansPanel />);
    const user = userEvent.setup();
    expect(await screen.findByRole("button", { name: /^Move/ })).toHaveTextContent("2");
    expect(screen.getByText("Finished · 1")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Old one/ })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /^Move/ }));
    await waitFor(() => {
      expect(useUiStore.getState().centerView).toBe("plans");
    });
    expect(usePlanStore.getState().path).toBe("Plans/Move.md");
  });

  it("starts a new plan from the + button", async () => {
    render(<PlansPanel />);
    await userEvent.setup().click(screen.getByRole("button", { name: "New plan" }));
    expect(usePlanStore.getState().guidedOpen).toBe(true);
  });
});
