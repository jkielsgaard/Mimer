import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const api = vi.hoisted(() => ({
  listChats: vi.fn(),
  saveChat: vi.fn(),
  aiChat: vi.fn(),
  aiCancel: vi.fn(),
  testProvider: vi.fn(),
}));
vi.mock("@/lib/api", () => ({ api, toApiError: (e: unknown) => ({ message: String(e) }) }));
vi.mock("@/lib/flush", () => ({ flushPendingWrites: vi.fn().mockResolvedValue(undefined) }));

import { ChatPanel } from "./ChatPanel";
import { useChatStore } from "@/stores/chatStore";
import { useVaultStore } from "@/stores/vaultStore";

const box = (): HTMLElement => screen.getByLabelText("Message Mimer");

describe("ChatPanel: a plain chat", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    api.listChats.mockResolvedValue([]);
    api.saveChat.mockImplementation((c: unknown) => Promise.resolve(c));
    api.aiChat.mockResolvedValue("task-1");
    useChatStore.getState().resetForVault();
    useVaultStore.setState({
      vault: null,
      files: ["Home.md"],
      tree: [],
      projects: [],
      activePath: "Home.md",
      selectedPath: null,
    });
  });

  it("has a message box, the open-note switch, the paperclip and the chat buttons", () => {
    render(<ChatPanel />);
    expect(box()).toBeInTheDocument();
    expect(screen.getByRole("checkbox", { name: "Include the open note" })).toBeChecked();
    expect(screen.getByRole("button", { name: "New chat" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Attach a note or folder" })).toBeInTheDocument();
    for (const gone of [/Skills/, /Prompts/, /Wake/, /Change AI/]) {
      expect(screen.queryByRole("button", { name: gone })).toBeNull();
    }
    expect(screen.getByText(/It does not change anything here/)).toBeInTheDocument();
  });

  it("sends a message with Enter, with the open note and without a skill", async () => {
    render(<ChatPanel />);
    const user = userEvent.setup();
    await user.type(box(), "What did we decide?{Enter}");
    await waitFor(() => {
      expect(api.aiChat).toHaveBeenCalled();
    });
    const req = api.aiChat.mock.calls[0]?.[0] as {
      includeCurrentNote: boolean;
      notePath: string | null;
      skill: string | null;
    };
    expect(req.includeCurrentNote).toBe(true);
    expect(req.notePath).toBe("Home.md");
    expect(req.skill ?? null).toBeNull();
    expect(box()).toHaveValue("");
  });

  it("points at a note with /, and sends it with the message", async () => {
    useVaultStore.setState({ files: ["Home.md", "Work/Plan.md"] });
    render(<ChatPanel />);
    const user = userEvent.setup();
    await user.type(box(), "summarise /pla");
    expect(
      screen.getByRole("listbox", { name: "Notes and folders to attach" }),
    ).toBeInTheDocument();
    await user.keyboard("{Enter}");
    expect(screen.getByRole("list", { name: "Attached notes and folders" })).toHaveTextContent(
      "Plan",
    );
    expect(box()).toHaveValue("summarise ");
    await user.type(box(), "{Enter}");
    await waitFor(() => {
      expect(api.aiChat).toHaveBeenCalled();
    });
    const req = api.aiChat.mock.calls[0]?.[0] as { mentions: string[] };
    expect(req.mentions).toEqual(["Work/Plan.md"]);
  });

  it("the paperclip types the slash and opens the list, and a chip can be removed", async () => {
    useVaultStore.setState({ files: ["Home.md", "Work/Plan.md"] });
    render(<ChatPanel />);
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Attach a note or folder" }));
    expect(box()).toHaveValue("/");
    await user.keyboard("{Enter}");
    const chips = screen.getByRole("list", { name: "Attached notes and folders" });
    await user.click(within(chips).getByRole("button"));
    expect(screen.queryByRole("list", { name: "Attached notes and folders" })).toBeNull();
  });

  it("does not send an empty message", async () => {
    render(<ChatPanel />);
    const user = userEvent.setup();
    await user.type(box(), "   {Enter}");
    expect(api.aiChat).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Send" })).toBeDisabled();
  });
});
