import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const api = vi.hoisted(() => ({
  saveChat: vi.fn(),
  listChats: vi.fn(),
  aiChat: vi.fn(),
  aiCancel: vi.fn(),
}));
vi.mock("@/lib/api", () => ({ api, toApiError: (e: unknown) => ({ message: String(e) }) }));
vi.mock("@/lib/flush", () => ({ flushPendingWrites: vi.fn().mockResolvedValue(undefined) }));

import { countWords, toStored, useChatStore } from "./chatStore";

const last = () => useChatStore.getState().messages.at(-1);

describe("chat progress", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-13T10:00:00Z"));
    vi.clearAllMocks();
    api.saveChat.mockImplementation((c: unknown) => Promise.resolve(c));
    api.listChats.mockResolvedValue([]);
    api.aiChat.mockResolvedValue("task-1");
    useChatStore.getState().resetForVault();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("starts as connecting when a message is sent", async () => {
    await useChatStore.getState().send("hello");
    expect(last()?.progress).toMatchObject({ phase: "connecting", step: null, words: 0 });
    expect(last()?.progress?.startedAt).toBe(Date.now());
  });

  it("follows the events of a turn with tools", async () => {
    await useChatStore.getState().send("split this note");
    const { applyEvent } = useChatStore.getState();

    vi.advanceTimersByTime(2000);
    applyEvent({ type: "step", step: 1, max: 15 });
    expect(last()?.progress).toMatchObject({ phase: "waiting", step: 1, max: 15 });

    applyEvent({ type: "toolStart", name: "read_note", detail: "Reading Work/Plan.md" });
    expect(last()?.progress).toMatchObject({ phase: "tool", detail: "Reading Work/Plan.md" });

    applyEvent({ type: "toolCall", name: "read_note", summary: "Read Work/Plan.md" });
    expect(last()?.progress).toMatchObject({ phase: "waiting", detail: "" });
    expect(last()?.activity).toEqual(["Read Work/Plan.md"]);

    applyEvent({ type: "step", step: 2, max: 15 });
    applyEvent({ type: "textDelta", text: "Here are three" });
    expect(last()?.progress).toMatchObject({ phase: "writing", step: 2, words: 3 });
    applyEvent({ type: "textDelta", text: " notes." });
    expect(last()?.progress?.words).toBe(4);
  });

  it("every event refreshes the stall clock but keeps the start time", async () => {
    await useChatStore.getState().send("hi");
    const started = last()?.progress?.startedAt;
    vi.advanceTimersByTime(20_000);
    useChatStore.getState().applyEvent({ type: "step", step: 1, max: 15 });
    expect(last()?.progress?.startedAt).toBe(started);
    expect(last()?.progress?.lastEventAt).toBe(Date.now());
  });

  it("is cleared when the turn is done, fails or is stopped", async () => {
    await useChatStore.getState().send("hi");
    useChatStore.getState().applyEvent({ type: "done" });
    expect(last()?.progress).toBeUndefined();

    await useChatStore.getState().send("again");
    useChatStore
      .getState()
      .applyEvent({ type: "error", error: { code: "Provider", message: "refused" } });
    expect(last()?.progress).toBeUndefined();
    expect(last()?.error).toBe("refused");

    await useChatStore.getState().send("third");
    expect(last()?.progress).toBeDefined();
    await useChatStore.getState().stop();
    expect(last()?.progress).toBeUndefined();
    expect(useChatStore.getState().streaming).toBe(false);
  });

  it("is never saved with the chat", async () => {
    await useChatStore.getState().send("hi");
    const stored = toStored(
      useChatStore.getState().messages,
      "3f6c1e2a-1111-4222-8333-444455556666",
      null,
    );
    expect(JSON.stringify(stored)).not.toContain("progress");
  });
});

describe("countWords", () => {
  it("counts words and ignores extra whitespace", () => {
    expect(countWords("")).toBe(0);
    expect(countWords("   ")).toBe(0);
    expect(countWords("one two\nthree  four")).toBe(4);
  });
});
