import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Project } from "@/bindings/Project";

const api = vi.hoisted(() => ({
  listChats: vi.fn(),
  listPrompts: vi.fn(),
  saveChat: vi.fn(),
  aiChat: vi.fn(),
  aiCancel: vi.fn(),
}));
vi.mock("@/lib/api", () => ({ api, toApiError: (e: unknown) => ({ message: String(e) }) }));
vi.mock("@/lib/flush", () => ({ flushPendingWrites: vi.fn().mockResolvedValue(undefined) }));

import { ChatPanel } from "./ChatPanel";
import { useChatStore } from "@/stores/chatStore";
import { useVaultStore } from "@/stores/vaultStore";

const files = ["Home.md", "Work/Plan.md", "Work/Sec/Keys.md", "Work/Sec/Policy.md", "Work/pic.png"];

const secProject: Project = {
  schemaVersion: 1,
  id: "p1",
  name: "Security",
  folder: "Work/Sec",
  instructions: "",
  providerId: null,
  localOnly: false,
  createdAt: "",
  updatedAt: "",
};

const box = (): HTMLElement => screen.getByLabelText("Message Mimer");

describe("ChatPanel: attaching notes with /", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    api.listChats.mockResolvedValue([]);
    api.listPrompts.mockResolvedValue([]);
    api.saveChat.mockImplementation((c: unknown) => Promise.resolve(c));
    api.aiChat.mockResolvedValue("task-1");
    useChatStore.getState().resetForVault();
    useVaultStore.setState({
      vault: null,
      files,
      tree: [],
      projects: [],
      activePath: null,
      selectedPath: null,
    });
  });

  it("typing / opens the note list and Enter attaches the first match as a chip", async () => {
    render(<ChatPanel />);
    const user = userEvent.setup();
    await user.type(box(), "merge /pla");
    expect(
      screen.getByRole("listbox", { name: "Notes and folders to attach" }),
    ).toBeInTheDocument();
    expect(screen.getAllByRole("option")).toHaveLength(1);
    await user.keyboard("{Enter}");
    expect(screen.getByRole("list", { name: "Attached notes and folders" })).toHaveTextContent(
      "Plan",
    );
    expect(screen.queryByRole("listbox")).toBeNull();
    expect(box()).toHaveValue("merge ");
    expect(useChatStore.getState().draftMentions).toEqual(["Work/Plan.md"]);
  });

  it("only offers Markdown notes and moves the highlight with the arrow keys", async () => {
    render(<ChatPanel />);
    const user = userEvent.setup();
    await user.type(box(), "/");
    const options = screen.getAllByRole("option");
    expect(options.map((o) => o.textContent)).not.toContain("pic");
    expect(options[0]).toHaveAttribute("aria-selected", "true");
    await user.keyboard("{ArrowDown}");
    expect(screen.getAllByRole("option")[1]).toHaveAttribute("aria-selected", "true");
  });

  it("Esc closes the list and keeps the typed text", async () => {
    render(<ChatPanel />);
    const user = userEvent.setup();
    await user.type(box(), "/pla");
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("listbox")).toBeNull();
    expect(box()).toHaveValue("/pla");
  });

  it("does not open for a date or a URL", async () => {
    render(<ChatPanel />);
    const user = userEvent.setup();
    await user.type(box(), "see 1/2 and https://x.dk/a");
    expect(screen.queryByRole("listbox")).toBeNull();
  });

  it("the paperclip types the slash and opens the list", async () => {
    render(<ChatPanel />);
    await userEvent.setup().click(screen.getByRole("button", { name: "Attach a note or folder" }));
    expect(box()).toHaveValue("/");
    expect(screen.getByRole("listbox")).toBeInTheDocument();
  });

  it("a chip can be removed", async () => {
    render(<ChatPanel />);
    const user = userEvent.setup();
    await user.type(box(), "/pla{Enter}");
    await user.click(screen.getByRole("button", { name: "Remove Plan" }));
    expect(useChatStore.getState().draftMentions).toEqual([]);
    expect(screen.queryByRole("list", { name: "Attached notes and folders" })).toBeNull();
  });

  it("inside a project only the project's notes are offered", async () => {
    useVaultStore.setState({ projects: [secProject], activePath: "Work/Sec/Keys.md" });
    render(<ChatPanel />);
    await userEvent.setup().type(box(), "/");
    const names = screen.getAllByRole("option").map((o) => o.textContent);
    expect(names.some((n) => n.includes("Keys"))).toBe(true);
    expect(names.some((n) => n.includes("Policy"))).toBe(true);
    expect(names.some((n) => n.includes("Home") || n.includes("Plan"))).toBe(false);
  });

  it("sends the attached notes with the message", async () => {
    render(<ChatPanel />);
    const user = userEvent.setup();
    await user.type(box(), "/pla{Enter}");
    await user.type(box(), "summarise{Enter}");
    await waitFor(() => {
      expect(api.aiChat).toHaveBeenCalled();
    });
    expect(api.aiChat.mock.calls[0]?.[0]).toMatchObject({ mentions: ["Work/Plan.md"] });
    expect(
      screen.queryByRole("list", { name: "Attached notes and folders" })?.textContent,
    ).toContain("Plan");
  });
});
