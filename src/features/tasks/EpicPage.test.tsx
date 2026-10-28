import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { makeTask } from "@/test/taskFixtures";

const apiMock = vi.hoisted(() => ({
  taskAdd: vi.fn(),
  listTasks: vi.fn(),
  listEpics: vi.fn(),
  deletePath: vi.fn(),
  epicSetDescription: vi.fn(),
}));
vi.mock("@/lib/api", () => ({
  api: apiMock,
  toApiError: (e: unknown) => ({ code: "Unknown", message: String(e) }),
}));
vi.mock("@/lib/flush", () => ({ flushPendingWrites: () => Promise.resolve() }));
const blocked = vi.hoisted(() => ({ reason: null as string | null }));
vi.mock("@/lib/useAiBlocked", () => ({ useAiBlocked: () => blocked.reason }));

import { EpicPage } from "./EpicPage";
import { LinkResolver } from "@/lib/links";
import { useTaskStore } from "@/stores/taskStore";
import { useUiStore } from "@/stores/uiStore";
import { useVaultStore } from "@/stores/vaultStore";

const epicNote = "Tasks/VPN guide.md";

describe("EpicPage", () => {
  beforeEach(() => {
    blocked.reason = null;
    for (const f of Object.values(apiMock)) f.mockReset();
    apiMock.listTasks.mockResolvedValue([]);
    apiMock.listEpics.mockResolvedValue([]);
    useTaskStore.setState({
      tasks: [
        makeTask({ path: epicNote, line: 3, title: "Write the steps" }),
        makeTask({ path: epicNote, line: 4, title: "Test on a Mac", done: true }),
      ],
      epics: [
        { path: epicNote, title: "VPN guide", source: "IT/VPN client guide", description: "" },
      ],
      epicPath: epicNote,
      selected: null,
    });
    useVaultStore.setState({
      resolver: new LinkResolver(["IT/VPN client guide.md", epicNote]),
      openNote: vi.fn().mockResolvedValue(undefined),
    });
    useUiStore.setState({ centerView: "epic", findTasksOpen: false, focusOpen: false });
  });

  it("shows the epic with its progress, the note it is kept in and where it came from", async () => {
    render(<EpicPage />);
    const user = userEvent.setup();
    expect(screen.getByRole("heading", { name: "VPN guide" })).toBeInTheDocument();
    expect(screen.getByText("1 of 2")).toBeInTheDocument();
    expect(screen.getByText("Write the steps")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /Go to the epic's note/ }));
    expect(useVaultStore.getState().openNote).toHaveBeenCalledWith(epicNote);
    await user.click(screen.getByRole("button", { name: /Came from: VPN client guide/ }));
    expect(useVaultStore.getState().openNote).toHaveBeenCalledWith("IT/VPN client guide.md");
  });

  it("saves the note of the epic when the box is left, and offers a way back from the note", async () => {
    apiMock.epicSetDescription.mockResolvedValue({
      path: epicNote,
      title: "VPN guide",
      source: "IT/VPN client guide",
      description: "About the guide",
    });
    render(<EpicPage />);
    const user = userEvent.setup();
    await user.type(screen.getByRole("textbox", { name: "Note" }), "About the guide");
    await user.click(document.body); // Tab indents in a note box, so click away
    await waitFor(() => {
      expect(apiMock.epicSetDescription).toHaveBeenCalledWith(epicNote, "About the guide");
    });
    await user.click(screen.getByRole("button", { name: /Go to the epic's note/ }));
    expect(useVaultStore.getState().openNote).toHaveBeenCalledWith(epicNote);
  });

  it("adds a task to this epic", async () => {
    apiMock.taskAdd.mockResolvedValue([makeTask({ path: epicNote })]);
    render(<EpicPage />);
    await userEvent
      .setup()
      .type(screen.getByLabelText("Add a task to this epic"), "Call Mette{Enter}");
    await waitFor(() => {
      expect(apiMock.taskAdd).toHaveBeenCalled();
    });
    expect(apiMock.taskAdd.mock.calls[0]?.[3]).toBe(epicNote);
  });

  it("asks the AI for steps from the note, only when pressed, and is off without an AI", async () => {
    render(<EpicPage />);
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: /Suggest steps from the note/ }));
    expect(useUiStore.getState().findTasksOpen).toBe(true);
    expect(useUiStore.getState().findTasksOpts).toEqual({ path: epicNote, mode: "steps" });
    useUiStore.setState({ findTasksOpen: false });
  });

  it("turns the AI button off with the reason, and everything else still works", () => {
    blocked.reason = "No AI is set up.";
    render(<EpicPage />);
    expect(screen.getByRole("button", { name: /Suggest steps from the note/ })).toBeDisabled();
    expect(screen.getByLabelText("Add a task to this epic")).toBeEnabled();
    expect(screen.getByRole("button", { name: "Focus" })).toBeEnabled();
  });

  it("deletes the epic note only after asking", async () => {
    const deletePath = vi.fn().mockResolvedValue(true);
    useVaultStore.setState({ deletePath });
    render(<EpicPage />);
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Delete" }));
    expect(deletePath).not.toHaveBeenCalled();
    await user.click(
      within(await screen.findByRole("dialog")).getByRole("button", { name: "Delete" }),
    );
    await waitFor(() => {
      expect(deletePath).toHaveBeenCalledWith(epicNote);
    });
  });

  it("does not offer to delete a note that only has tasks written in it", () => {
    useTaskStore.setState({ epics: [], epicPath: "Møder/Acme.md", tasks: [makeTask()] });
    render(<EpicPage />);
    expect(screen.queryByRole("button", { name: "Delete" })).toBeNull();
    expect(screen.getByRole("button", { name: /Go to the note/ })).toBeInTheDocument();
  });
});
