import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/api", () => ({ api: {}, toApiError: (e: unknown) => ({ message: String(e) }) }));

import { useChatStore } from "./chatStore";

describe("chat streaming", () => {
  beforeEach(() => {
    useChatStore.setState({
      streaming: true,
      messages: [
        {
          id: 1,
          role: "user",
          content: "hi",
          activity: [],
          proposalSetId: null,
          error: null,
          mentions: [],
        },
        {
          id: 2,
          role: "assistant",
          content: "",
          activity: [],
          proposalSetId: null,
          error: null,
          mentions: [],
        },
      ],
    });
  });

  it("appends text deltas to the assistant message", () => {
    const { applyEvent } = useChatStore.getState();
    applyEvent({ type: "textDelta", text: "Hel" });
    applyEvent({ type: "textDelta", text: "lo" });
    expect(useChatStore.getState().messages[1]?.content).toBe("Hello");
    expect(useChatStore.getState().streaming).toBe(true);
  });

  it("records tool activity and proposals", () => {
    const { applyEvent } = useChatStore.getState();
    applyEvent({
      type: "toolCall",
      name: "search_notes",
      summary: "Searched notes for 'firewall'",
    });
    applyEvent({ type: "proposalsReady", setId: "s1" });
    const m = useChatStore.getState().messages[1];
    expect(m?.activity).toEqual(["Searched notes for 'firewall'"]);
    expect(m?.proposalSetId).toBe("s1");
  });

  it("stops streaming on done and on error", () => {
    useChatStore.getState().applyEvent({ type: "done" });
    expect(useChatStore.getState().streaming).toBe(false);
    useChatStore.setState({ streaming: true });
    useChatStore
      .getState()
      .applyEvent({ type: "error", error: { code: "ProviderBlocked", message: "blocked" } });
    expect(useChatStore.getState().streaming).toBe(false);
    expect(useChatStore.getState().messages[1]?.error).toBe("blocked");
  });
});
