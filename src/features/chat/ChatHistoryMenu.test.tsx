import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ChatSummary } from "@/bindings/ChatSummary";

const api = vi.hoisted(() => ({
  listChats: vi.fn(),
  loadChat: vi.fn(),
  deleteChat: vi.fn(),
  deleteAllChats: vi.fn(),
}));
vi.mock("@/lib/api", () => ({ api, toApiError: (e: unknown) => ({ message: String(e) }) }));

import { ChatHistoryMenu } from "./ChatHistoryMenu";
import { useChatStore } from "@/stores/chatStore";

const chats: ChatSummary[] = [
  {
    id: "11111111-1111-4111-8111-111111111111",
    title: "Firewall rules",
    projectId: null,
    updatedAt: new Date().toISOString(),
    messageCount: 4,
  },
  {
    id: "22222222-2222-4222-8222-222222222222",
    title: "Meeting notes",
    projectId: null,
    updatedAt: new Date().toISOString(),
    messageCount: 2,
  },
];

async function openMenu(): Promise<void> {
  await userEvent.setup().click(screen.getByRole("button", { name: "Chat history" }));
}

describe("ChatHistoryMenu", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    api.listChats.mockResolvedValue([]);
    api.deleteChat.mockResolvedValue(undefined);
    api.deleteAllChats.mockResolvedValue(2);
    useChatStore.setState({ chats, chatId: null, streaming: false });
  });

  it("lists saved chats with their message counts", async () => {
    render(<ChatHistoryMenu />);
    await openMenu();
    expect(await screen.findByText("Firewall rules")).toBeInTheDocument();
    expect(screen.getByText(/4 messages/)).toBeInTheDocument();
  });

  it("opening a chat loads it from the backend", async () => {
    api.loadChat.mockResolvedValue({
      id: chats[1]?.id,
      title: "Meeting notes",
      projectId: null,
      createdAt: "",
      updatedAt: "",
      messages: [],
    });
    render(<ChatHistoryMenu />);
    await openMenu();
    await userEvent.setup().click(await screen.findByText("Meeting notes"));
    await waitFor(() => {
      expect(api.loadChat).toHaveBeenCalledWith(chats[1]?.id);
    });
  });

  it("the delete button removes only that chat", async () => {
    render(<ChatHistoryMenu />);
    await openMenu();
    const buttons = await screen.findAllByRole("button", { name: "Delete chat" });
    await userEvent.setup().click(buttons[0] as HTMLElement);
    await waitFor(() => {
      expect(api.deleteChat).toHaveBeenCalledWith(chats[0]?.id);
    });
  });

  it("delete all asks first, then deletes everything", async () => {
    render(<ChatHistoryMenu />);
    const user = userEvent.setup();
    await openMenu();
    await user.click(await screen.findByText("Delete all history…"));
    expect(api.deleteAllChats).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "Delete all" }));
    await waitFor(() => {
      expect(api.deleteAllChats).toHaveBeenCalledTimes(1);
    });
  });

  it("is disabled while the assistant is answering", () => {
    useChatStore.setState({ streaming: true });
    render(<ChatHistoryMenu />);
    expect(screen.getByRole("button", { name: "Chat history" })).toBeDisabled();
  });
});
