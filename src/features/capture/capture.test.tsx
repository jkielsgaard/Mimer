import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Idea } from "@/bindings/Idea";

const apiMock = vi.hoisted(() => ({
  listIdeas: vi.fn(),
  ideaAdd: vi.fn(),
  ideaEdit: vi.fn(),
  ideaDelete: vi.fn(),
  ideaSetStatus: vi.fn(),
  taskAdd: vi.fn(),
  createNote: vi.fn(),
  writeNote: vi.fn(),
}));
vi.mock("@/lib/api", () => ({
  api: apiMock,
  toApiError: (e: unknown) => ({ code: "Unknown", message: String(e) }),
}));
const askMock = vi.hoisted(() => ({ askAi: vi.fn() }));
vi.mock("@/lib/askAi", () => askMock);
vi.mock("@/lib/useAiBlocked", () => ({ useAiBlocked: () => null }));
vi.mock("@/lib/flush", () => ({ flushPendingWrites: () => Promise.resolve() }));

import { CaptureBox } from "./CaptureBox";
import { IdeasPanel } from "./IdeasPanel";
import { IdeasView } from "./IdeasView";
import { QuickCapture } from "./QuickCapture";
import { useIdeaStore } from "@/stores/ideaStore";
import { useUiStore } from "@/stores/uiStore";
import { useVaultStore } from "@/stores/vaultStore";

const idea = (patch: Partial<Idea>): Idea => ({
  line: 2,
  key: "k",
  date: "2026-10-19",
  text: "Use Mimer for the weekly status",
  tags: [],
  status: null,
  note: "",
  ...patch,
});

describe("CaptureBox", () => {
  beforeEach(() => {
    localStorage.clear();
    for (const f of Object.values(apiMock)) f.mockReset();
    apiMock.ideaAdd.mockResolvedValue([]);
    apiMock.taskAdd.mockResolvedValue([]);
    apiMock.createNote.mockResolvedValue("Quick/Cheat sheet.md");
    apiMock.writeNote.mockResolvedValue(undefined);
    useVaultStore.setState({
      vault: { name: "V", path: "/v", config: { quickNotesFolder: "Quick" } } as never,
      refreshTree: vi.fn().mockResolvedValue(undefined),
    });
  });

  it("writes an idea, a task and a note, and remembers the kind", async () => {
    const onSaved = vi.fn();
    const { unmount } = render(<CaptureBox onSaved={onSaved} />);
    const user = userEvent.setup();
    await user.type(screen.getByLabelText("Write an idea"), "An idea{Enter}");
    expect(apiMock.ideaAdd.mock.calls[0]?.[1]).toBe("An idea");
    expect(onSaved).toHaveBeenCalledWith("an idea");
    await user.click(screen.getByRole("button", { name: "Task" }));
    await user.type(screen.getByLabelText("Write a task"), "Call Mette{Enter}");
    expect(apiMock.taskAdd.mock.calls[0]?.[0]).toBe("Call Mette");
    await user.type(screen.getByLabelText("Write a task"), "Pay the bill fri{Enter}");
    expect(apiMock.taskAdd.mock.calls[1]?.[0]).toBe("Pay the bill fri");
    unmount();
    // The choice is remembered.
    render(<CaptureBox />);
    expect(screen.getByRole("button", { name: "Task" })).toHaveAttribute("aria-pressed", "true");
    await user.type(screen.getByLabelText("Write a task"), "Later task{Enter}");
    expect(apiMock.taskAdd.mock.calls[2]?.[0]).toBe("Later task");
    await user.click(screen.getByRole("button", { name: "Note" }));
    await user.type(screen.getByLabelText("Title of the note"), "Cheat sheet");
    await user.type(screen.getByLabelText("Write the note"), "VLAN 10 is the office");
    await user.click(screen.getByRole("button", { name: "Save the note" }));
    await waitFor(() => {
      expect(apiMock.writeNote).toHaveBeenCalled();
    });
    expect(apiMock.createNote.mock.calls[0]?.[0]).toBe("Quick");
    expect(apiMock.writeNote.mock.calls[0]?.[1]).toBe("# Cheat sheet\n\nVLAN 10 is the office\n");
  });

  it("lets a task and an idea have a small note", async () => {
    render(<CaptureBox initialKind="idea" />);
    const user = userEvent.setup();
    await user.type(screen.getByLabelText("Write an idea"), "An idea");
    await user.click(screen.getByRole("button", { name: "Add a note" }));
    await user.type(screen.getByLabelText("Note for the idea"), "Because of the VPN");
    await user.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => {
      expect(apiMock.ideaAdd).toHaveBeenCalled();
    });
    expect(apiMock.ideaAdd.mock.calls[0]?.[1]).toBe("An idea");
    expect(apiMock.ideaAdd.mock.calls[0]?.[2]).toBe("Because of the VPN");
    await user.click(screen.getByRole("button", { name: "Task" }));
    await user.type(screen.getByLabelText("Write a task"), "Call Mette");
    await user.type(screen.getByLabelText("Note for the task"), "About the licence");
    await user.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => {
      expect(apiMock.taskAdd).toHaveBeenCalled();
    });
    expect(apiMock.taskAdd.mock.calls[0]?.[1]).toBe("About the licence");
  });
});

describe("QuickCapture", () => {
  beforeEach(() => {
    localStorage.clear();
    for (const f of Object.values(apiMock)) f.mockReset();
    apiMock.ideaAdd.mockResolvedValue([]);
    useUiStore.setState({ captureKind: null, toasts: [] });
  });

  it("opens with the chosen kind and closes after saving", async () => {
    useUiStore.getState().openCapture("idea");
    render(<QuickCapture />);
    const user = userEvent.setup();
    await user.type(await screen.findByLabelText("Write an idea"), "From anywhere{Enter}");
    expect(apiMock.ideaAdd).toHaveBeenCalled();
    await waitFor(() => {
      expect(useUiStore.getState().captureKind).toBeNull();
    });
    expect(useUiStore.getState().toasts[0]?.message).toBe("Saved an idea.");
  });
});

describe("Ideas", () => {
  beforeEach(() => {
    localStorage.clear();
    for (const f of Object.values(apiMock)) f.mockReset();
    apiMock.listIdeas.mockResolvedValue([
      idea({ line: 4, text: "Newest idea", note: "Why it matters" }),
      idea({ line: 2, text: "Used idea", status: "used" }),
    ]);
    apiMock.ideaSetStatus.mockResolvedValue([]);
    apiMock.ideaEdit.mockResolvedValue([]);
    apiMock.taskAdd.mockResolvedValue([]);
    apiMock.createNote.mockResolvedValue("Quick/Newest idea.md");
    apiMock.writeNote.mockResolvedValue(undefined);
    useIdeaStore.setState({
      ideas: [],
      loaded: false,
      filter: "open",
      selectedLine: null,
    });
    useUiStore.setState({ centerView: "ideas" });
    useVaultStore.setState({
      vault: { name: "V", path: "/v", config: { quickNotesFolder: "Quick" } } as never,
      refreshTree: vi.fn().mockResolvedValue(undefined),
      openNote: vi.fn().mockResolvedValue(undefined),
    });
  });

  it("lists the open ideas in the panel, the used ones under their own filter, and opens one", async () => {
    render(<IdeasPanel />);
    const user = userEvent.setup();
    expect(await screen.findByText("Newest idea")).toBeInTheDocument();
    expect(screen.queryByText("Used idea")).toBeNull();
    await user.click(screen.getByRole("button", { name: /Used/ }));
    expect(screen.getByText("Used idea")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /Open/ }));
    await user.click(screen.getByText("Newest idea"));
    expect(useIdeaStore.getState().selectedLine).toBe(4);
    expect(useUiStore.getState().centerView).toBe("ideas");
  });

  it("has a New idea button instead of a box to write in, and it opens the new-idea page", async () => {
    useIdeaStore.setState({ selectedLine: 4 });
    useUiStore.setState({ centerView: "notes" });
    render(<IdeasPanel />);
    expect(screen.queryByLabelText("Write an idea here")).toBeNull();
    await userEvent.setup().click(await screen.findByRole("button", { name: /New idea/ }));
    expect(useIdeaStore.getState().selectedLine).toBeNull();
    expect(useUiStore.getState().centerView).toBe("ideas");
  });

  it("shows the picked idea with its note and saves a change when you leave the box", async () => {
    useIdeaStore.setState({ selectedLine: 4 });
    render(<IdeasView />);
    const user = userEvent.setup();
    expect(await screen.findByLabelText("The idea")).toHaveValue("Newest idea");
    const note = screen.getByLabelText("Note for the idea");
    expect(note).toHaveValue("Why it matters");
    await user.clear(note);
    await user.type(note, "A better reason");
    await user.tab();
    await waitFor(() => {
      expect(apiMock.ideaEdit).toHaveBeenCalledWith(4, "k", "Newest idea", "A better reason");
    });
  });

  it("asks for an idea when none is picked, and writes it with a note", async () => {
    apiMock.ideaAdd.mockImplementation(() => Promise.resolve(useIdeaStore.getState().ideas));
    render(<IdeasView />);
    const user = userEvent.setup();
    await user.type(await screen.findByLabelText("Write an idea"), "Fresh");
    await user.type(screen.getByLabelText("Note for the idea"), "Details");
    await user.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => {
      expect(apiMock.ideaAdd).toHaveBeenCalled();
    });
    expect(apiMock.ideaAdd.mock.calls[0]?.[1]).toBe("Fresh");
    expect(apiMock.ideaAdd.mock.calls[0]?.[2]).toBe("Details");
  });

  it("turns an idea into a task in the Inbox with its note, and marks it as used", async () => {
    useIdeaStore.setState({ selectedLine: 4 });
    render(<IdeasView />);
    const user = userEvent.setup();
    await user.click(await screen.findByRole("button", { name: "Make a task" }));
    await waitFor(() => {
      expect(apiMock.ideaSetStatus).toHaveBeenCalledWith(4, "k", "used");
    });
    expect(apiMock.taskAdd.mock.calls[0]?.[0]).toBe("Newest idea");
    expect(apiMock.taskAdd.mock.calls[0]?.[1]).toBe("Why it matters");
  });

  it("turns an idea into a note in Quick notes with its note, and opens it", async () => {
    useIdeaStore.setState({ selectedLine: 4 });
    render(<IdeasView />);
    const user = userEvent.setup();
    await user.click(await screen.findByRole("button", { name: "Make a note" }));
    await waitFor(() => {
      expect(apiMock.writeNote).toHaveBeenCalled();
    });
    expect(apiMock.writeNote.mock.calls[0]?.[1]).toBe(
      "# Newest idea\n\nNewest idea\n\nWhy it matters\n",
    );
    expect(useVaultStore.getState().openNote).toHaveBeenCalledWith("Quick/Newest idea.md");
    expect(apiMock.ideaSetStatus).toHaveBeenCalledWith(4, "k", "used");
  });

  it("deletes an idea only after asking once more", async () => {
    apiMock.ideaDelete.mockResolvedValue([]);
    useIdeaStore.setState({ selectedLine: 4 });
    render(<IdeasView />);
    const user = userEvent.setup();
    await user.click(await screen.findByRole("button", { name: "Delete" }));
    expect(apiMock.ideaDelete).not.toHaveBeenCalled();
    await user.click(
      within(await screen.findByRole("dialog")).getByRole("button", { name: "Delete" }),
    );
    await waitFor(() => {
      expect(apiMock.ideaDelete).toHaveBeenCalledWith(4, "k");
    });
    expect(useIdeaStore.getState().selectedLine).toBeNull();
  });

  it("turns the first steps of an idea into ONE task with steps, not one task each", async () => {
    askMock.askAi.mockReturnValue({
      promise: Promise.resolve("- Ask Lene\n- Draft the template\n- Try it"),
      cancel: vi.fn(),
    });
    useIdeaStore.setState({ selectedLine: 4 });
    render(<IdeasView />);
    const user = userEvent.setup();
    await user.click(await screen.findByRole("button", { name: /Suggest first steps/ }));
    await user.click(await screen.findByRole("button", { name: "Make a task with 3 steps" }));
    await waitFor(() => {
      expect(apiMock.taskAdd).toHaveBeenCalledTimes(1);
    });
    expect(apiMock.taskAdd.mock.calls[0]?.[0]).toBe("Newest idea");
    expect(apiMock.taskAdd.mock.calls[0]?.[2]).toEqual([
      "Ask Lene",
      "Draft the template",
      "Try it",
    ]);
  });

  it("archives an idea and brings it back", async () => {
    useIdeaStore.setState({ selectedLine: 4 });
    render(<IdeasView />);
    const user = userEvent.setup();
    await user.click(await screen.findByRole("button", { name: "Archive" }));
    expect(apiMock.ideaSetStatus).toHaveBeenCalledWith(4, "k", "archived");
  });
});
