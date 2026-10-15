import { beforeEach, describe, expect, it, vi } from "vitest";

const api = vi.hoisted(() => ({ ravenChat: vi.fn(), aiCancel: vi.fn() }));
vi.mock("@/lib/api", () => ({ api, toApiError: (e: unknown) => ({ message: String(e) }) }));

import { useRavenStore } from "./ravenStore";

describe("ravenStore", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useRavenStore.setState({ messages: [], streaming: false, taskId: null, draft: "" });
    api.ravenChat.mockResolvedValue("task-1");
    api.aiCancel.mockResolvedValue(undefined);
  });

  it("sends only the messages: no notes, no paths, no mentions", async () => {
    await useRavenStore.getState().send("What is Yggdrasil?");
    const request = api.ravenChat.mock.calls[0]?.[0] as { messages: unknown[] } & Record<
      string,
      unknown
    >;
    expect(Object.keys(request)).toEqual(["messages"]);
    expect(request.messages).toEqual([{ role: "user", content: "What is Yggdrasil?" }]);
  });

  it("streams the answer into the last message and stops streaming when done", async () => {
    await useRavenStore.getState().send("Hello");
    const { applyEvent } = useRavenStore.getState();
    applyEvent({ type: "textDelta", text: "Hel" });
    applyEvent({ type: "textDelta", text: "lo!" });
    expect(useRavenStore.getState().streaming).toBe(true);
    applyEvent({ type: "done" });
    const s = useRavenStore.getState();
    expect(s.streaming).toBe(false);
    expect(s.messages.at(-1)?.content).toBe("Hello!");
  });

  it("shows an error on the answer and keeps the question", async () => {
    api.ravenChat.mockRejectedValue(new Error("Raven is off"));
    await useRavenStore.getState().send("Hi");
    const s = useRavenStore.getState();
    expect(s.streaming).toBe(false);
    expect(s.messages[0]?.content).toBe("Hi");
    expect(s.messages.at(-1)?.error).toContain("Raven is off");
  });

  it("includes earlier messages and clears the draft; New chat clears the conversation", async () => {
    useRavenStore.getState().setDraft("typed");
    await useRavenStore.getState().send("First");
    useRavenStore.getState().applyEvent({ type: "textDelta", text: "Answer" });
    useRavenStore.getState().applyEvent({ type: "done" });
    expect(useRavenStore.getState().draft).toBe("");
    await useRavenStore.getState().send("Second");
    const request = api.ravenChat.mock.calls[1]?.[0] as {
      messages: { role: string; content: string }[];
    };
    expect(request.messages.map((m) => m.content)).toEqual(["First", "Answer", "Second"]);
    useRavenStore.getState().newChat();
    expect(useRavenStore.getState().messages).toEqual([]);
  });
});
