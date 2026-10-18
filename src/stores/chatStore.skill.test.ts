import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Skill } from "@/bindings/Skill";

const { apiMock } = vi.hoisted(() => ({
  apiMock: {
    aiChat: vi.fn(),
    saveChat: vi.fn(),
    listChats: vi.fn(),
  },
}));
vi.mock("@/lib/api", () => ({
  api: apiMock,
  toApiError: (e: unknown) => ({ message: String(e) }),
}));
vi.mock("@/lib/flush", () => ({ flushPendingWrites: () => Promise.resolve() }));

import { useChatStore } from "./chatStore";

const skill: Skill = {
  id: "builtin:fix-spelling",
  name: "Fix spelling and grammar",
  description: "",
  kind: "rewrite",
  appliesTo: "both",
  instruction: "Fix it.",
  builtin: true,
};

describe("sending a skill", () => {
  beforeEach(() => {
    apiMock.aiChat.mockReset().mockResolvedValue("task-1");
    apiMock.saveChat.mockReset().mockResolvedValue({});
    apiMock.listChats.mockReset().mockResolvedValue([]);
    useChatStore.setState({
      messages: [],
      streaming: false,
      draftMentions: ["Work"],
      draftSkill: skill,
      chatId: null,
    });
  });

  it("runs without any typed text and sends the skill id", async () => {
    await useChatStore.getState().send("");
    expect(apiMock.aiChat).toHaveBeenCalledTimes(1);
    const request = apiMock.aiChat.mock.calls[0]?.[0] as {
      skill: string | null;
      skillInput: string | null;
      mentions: string[];
    };
    expect(request.skill).toBe("builtin:fix-spelling");
    expect(request.skillInput).toBeNull();
    expect(request.mentions).toEqual(["Work"]);
    const user = useChatStore.getState().messages[0];
    expect(user?.content).toBe("Skill: Fix spelling and grammar");
    expect(useChatStore.getState().draftSkill).toBeNull();
  });

  it("sends the typed text as extra instructions for the run", async () => {
    await useChatStore.getState().send("  keep British spelling ");
    const request = apiMock.aiChat.mock.calls[0]?.[0] as { skillInput: string | null };
    expect(request.skillInput).toBe("keep British spelling");
    expect(useChatStore.getState().messages[0]?.content).toContain("keep British spelling");
  });

  it("does nothing for an empty message without a skill", async () => {
    useChatStore.setState({ draftSkill: null });
    await useChatStore.getState().send("   ");
    expect(apiMock.aiChat).not.toHaveBeenCalled();
  });
});

describe("a skill run that starts with a trial", () => {
  beforeEach(() => {
    apiMock.aiChat.mockReset().mockResolvedValue("task-1");
    apiMock.saveChat.mockReset().mockResolvedValue({});
    useChatStore.setState({
      messages: [],
      streaming: false,
      draftMentions: ["Inbox"],
      draftSkill: skill,
      chatId: null,
    });
  });

  it("keeps the trial on the answer and continues with exactly the notes that are left", async () => {
    await useChatStore.getState().send("");
    const store = useChatStore.getState();
    store.applyEvent({
      type: "skillTrial",
      skillId: skill.id,
      skillName: skill.name,
      done: 3,
      total: 7,
      rest: [{ path: "Inbox/N4.md", base: "Inbox" }],
      folders: ["Vendors"],
      skillInput: "keep British spelling",
      anchor: "Inbox",
    });
    store.applyEvent({ type: "done" });
    const answer = useChatStore.getState().messages[1];
    expect(answer?.trial).toMatchObject({ done: 3, total: 7, continued: false });

    await useChatStore.getState().continueSkill(answer?.id ?? -1);
    expect(apiMock.aiChat).toHaveBeenCalledTimes(2);
    const request = apiMock.aiChat.mock.calls[1]?.[0] as {
      skill: string | null;
      mentions: string[];
      skillContinue: {
        targets: { path: string }[];
        folders: string[];
        skillInput: string | null;
        anchor: string | null;
      } | null;
    };
    expect(request.skill).toBe(skill.id);
    expect(request.mentions).toEqual([]);
    expect(request.skillContinue).toEqual({
      targets: [{ path: "Inbox/N4.md", base: "Inbox" }],
      folders: ["Vendors"],
      skillInput: "keep British spelling",
      anchor: "Inbox",
    });
    const msgs = useChatStore.getState().messages;
    expect(msgs[1]?.trial?.continued).toBe(true);
    expect(msgs[2]?.content).toBe("Continue: Fix spelling and grammar (1 more notes)");

    // A second press does nothing.
    useChatStore.setState({ streaming: false });
    await useChatStore.getState().continueSkill(answer?.id ?? -1);
    expect(apiMock.aiChat).toHaveBeenCalledTimes(2);
  });
});
