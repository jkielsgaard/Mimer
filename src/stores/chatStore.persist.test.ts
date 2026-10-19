import { beforeEach, describe, expect, it, vi } from "vitest";
import { must } from "@/test/must";

const api = vi.hoisted(() => ({
  saveChat: vi.fn(),
  listChats: vi.fn(),
  loadChat: vi.fn(),
  deleteAllChats: vi.fn(),
  aiChat: vi.fn(),
  aiCancel: vi.fn(),
}));
vi.mock("@/lib/api", () => ({ api, toApiError: (e: unknown) => ({ message: String(e) }) }));
vi.mock("@/lib/flush", () => ({ flushPendingWrites: vi.fn().mockResolvedValue(undefined) }));

import { toStored, useChatStore } from "./chatStore";

describe("chat persistence", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    api.saveChat.mockImplementation((c: unknown) => Promise.resolve(c));
    api.listChats.mockResolvedValue([]);
    useChatStore.getState().resetForVault();
  });

  it("keeps one chat id across saves and drops empty assistant placeholders", () => {
    const msgs = [
      {
        id: 1,
        role: "user" as const,
        content: "hi",
        activity: [],
        proposalSetId: null,
        error: null,
        mentions: [],
      },
      {
        id: 2,
        role: "assistant" as const,
        content: "",
        activity: [],
        proposalSetId: null,
        error: null,
        mentions: [],
      },
    ];
    const stored = toStored(msgs, "3f6c1e2a-1111-4222-8333-444455556666", null);
    expect(stored?.messages.map((m) => m.role)).toEqual(["user"]);
    expect(toStored([must(msgs[1])], "x", null)).toBeNull();
  });

  it("saves the conversation with the same id after a reply", async () => {
    api.aiChat.mockResolvedValue("task");
    await useChatStore.getState().send("first question");
    useChatStore.getState().applyEvent({ type: "textDelta", text: "answer" });
    useChatStore.getState().applyEvent({ type: "done" });
    await vi.waitFor(() => expect(api.saveChat).toHaveBeenCalled());
    const ids = new Set(api.saveChat.mock.calls.map((c) => (c[0] as { id: string }).id));
    expect(ids.size).toBe(1);
    const last = api.saveChat.mock.calls.at(-1)?.[0] as { messages: { content: string }[] };
    expect(last.messages.map((m) => m.content)).toEqual(["first question", "answer"]);
  });

  it("opening a saved chat restores its messages and does nothing while streaming", async () => {
    api.loadChat.mockResolvedValue({
      schemaVersion: 1,
      id: "a",
      title: "t",
      projectId: null,
      createdAt: "",
      updatedAt: "",
      messages: [{ id: 7, role: "user", content: "old question", activity: [], error: null }],
    });
    await useChatStore.getState().openChat("a");
    expect(useChatStore.getState().messages[0]?.content).toBe("old question");
    expect(useChatStore.getState().chatId).toBe("a");
    useChatStore.setState({ streaming: true });
    await useChatStore.getState().openChat("b");
    expect(api.loadChat).toHaveBeenCalledTimes(1);
  });

  it("deleting all history clears the open conversation", async () => {
    useChatStore.setState({
      messages: [
        {
          id: 1,
          role: "user",
          content: "x",
          activity: [],
          proposalSetId: null,
          error: null,
          mentions: [],
        },
      ],
      chatId: "a",
    });
    api.deleteAllChats.mockResolvedValue(3);
    await useChatStore.getState().deleteAllChats();
    expect(useChatStore.getState().messages).toEqual([]);
    expect(useChatStore.getState().chatId).toBeNull();
  });

  it("opening an old chat without mentions and a new one with mentions", async () => {
    api.loadChat.mockResolvedValue({
      schemaVersion: 1,
      id: "a",
      title: "t",
      projectId: null,
      createdAt: "",
      updatedAt: "",
      messages: [
        {
          id: 7,
          role: "user",
          content: "merge",
          activity: [],
          error: null,
          mentions: ["Work/Plan.md"],
        },
      ],
    });
    await useChatStore.getState().openChat("a");
    expect(useChatStore.getState().messages[0]?.mentions).toEqual(["Work/Plan.md"]);
  });

  it("stores the attached notes of a message", () => {
    const stored = toStored(
      [
        {
          id: 1,
          role: "user",
          content: "merge these",
          activity: [],
          proposalSetId: null,
          error: null,
          mentions: ["Work/Plan.md", "Home.md"],
        },
      ],
      "3f6c1e2a-1111-4222-8333-444455556666",
      null,
    );
    expect(stored?.messages[0]?.mentions).toEqual(["Work/Plan.md", "Home.md"]);
  });
});

describe("attached notes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    api.saveChat.mockImplementation((c: unknown) => Promise.resolve(c));
    api.listChats.mockResolvedValue([]);
    api.aiChat.mockResolvedValue("task-1");
    useChatStore.getState().resetForVault();
  });

  it("adds each note once and stops at five", () => {
    const { addMention } = useChatStore.getState();
    addMention("a.md");
    addMention("a.md");
    for (const n of ["b.md", "c.md", "d.md", "e.md", "f.md"]) addMention(n);
    expect(useChatStore.getState().draftMentions).toEqual(["a.md", "b.md", "c.md", "d.md", "e.md"]);
  });

  it("removes a note from the draft", () => {
    const { addMention, removeMention } = useChatStore.getState();
    addMention("a.md");
    addMention("b.md");
    removeMention("a.md");
    expect(useChatStore.getState().draftMentions).toEqual(["b.md"]);
  });

  it("sends the attached notes with the message, keeps them on it and clears the draft", async () => {
    useChatStore.getState().addMention("Work/Plan.md");
    await useChatStore.getState().send("summarise");
    expect(api.aiChat.mock.calls[0]?.[0]).toMatchObject({ mentions: ["Work/Plan.md"] });
    const state = useChatStore.getState();
    expect(state.messages[0]?.mentions).toEqual(["Work/Plan.md"]);
    expect(state.draftMentions).toEqual([]);
  });

  it("new chat and vault change clear the draft", () => {
    useChatStore.getState().addMention("a.md");
    useChatStore.getState().newChat();
    expect(useChatStore.getState().draftMentions).toEqual([]);
    useChatStore.getState().addMention("a.md");
    useChatStore.getState().resetForVault();
    expect(useChatStore.getState().draftMentions).toEqual([]);
  });

  it("sends what Mimer did in earlier turns back with the history", async () => {
    useChatStore.setState({
      messages: [
        {
          id: 1,
          role: "user",
          content: "merge a and b",
          activity: [],
          proposalSetId: null,
          error: null,
          mentions: [],
        },
        {
          id: 2,
          role: "assistant",
          content: "Done.",
          activity: ["Proposed new note Work/All.md", "Proposed deleting Work/a.md"],
          proposalSetId: null,
          error: null,
          mentions: [],
        },
      ],
    });
    await useChatStore.getState().send("now delete the old ones");
    const sent = api.aiChat.mock.calls[0]?.[0] as {
      messages: { role: string; activity: string[] }[];
    };
    expect(sent.messages[1]?.activity).toEqual([
      "Proposed new note Work/All.md",
      "Proposed deleting Work/a.md",
    ]);
    expect(sent.messages[2]?.role).toBe("user");
  });
});
