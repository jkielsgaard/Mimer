import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/api", () => ({ api: {}, toApiError: (e: unknown) => ({ message: String(e) }) }));

import { Bubble } from "./Bubble";
import { type ChatMessage, useChatStore } from "@/stores/chatStore";
import { useUiStore } from "@/stores/uiStore";

const message = (continued: boolean): ChatMessage => ({
  id: 7,
  role: "assistant",
  content: "**Sort**: tried on the first 3 of 52 notes.",
  activity: [],
  proposalSetId: null,
  error: null,
  mentions: [],
  trial: {
    skillId: "u1",
    skillName: "Sort",
    done: 3,
    total: 52,
    rest: Array.from({ length: 49 }, (_, i) => ({ path: `Inbox/N${String(i)}.md`, base: "Inbox" })),
    folders: [],
    skillInput: null,
    anchor: null,
    continued,
  },
});

describe("Bubble: a skill trial", () => {
  const continueSkill = vi.fn();
  beforeEach(() => {
    continueSkill.mockReset();
    useChatStore.setState({ streaming: false, continueSkill });
    useUiStore.setState({ settingsOpen: false });
  });

  it("offers to do the rest, and says how to stop", async () => {
    render(<Bubble m={message(false)} />);
    const user = userEvent.setup();
    expect(screen.getByText("First 3 of 52 notes done")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Looks good, do the other 49" }));
    expect(continueSkill).toHaveBeenCalledWith(7);
    expect(screen.getByText(/reject them in the review and stop here/)).toBeInTheDocument();
    expect(useUiStore.getState().settingsOpen).toBe(false);
  });

  it("says the rest is being done once it was continued", () => {
    render(<Bubble m={message(true)} />);
    expect(screen.queryByRole("button", { name: /do the other/ })).toBeNull();
    expect(screen.getByText(/doing the other 49 notes/)).toBeInTheDocument();
  });
});
