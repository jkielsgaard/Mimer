import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it } from "vitest";
import { useUiStore } from "@/stores/uiStore";
import { BetaNoticeDialog } from "./BetaNoticeDialog";

describe("BetaNoticeDialog", () => {
  beforeEach(() => {
    localStorage.removeItem("mimer.betaNoticeSeen");
    useUiStore.setState({ betaNoticeOpen: false, helpOpen: false });
  });

  it("comes the first time, says the AI is beta, and is gone once it is read", async () => {
    const user = userEvent.setup();
    const { unmount } = render(<BetaNoticeDialog />);
    expect(await screen.findByText("The AI is still being built")).toBeInTheDocument();
    expect(screen.getByText(/first version of Mimer/)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Got it" }));
    expect(screen.queryByText("The AI is still being built")).toBeNull();
    unmount();
    render(<BetaNoticeDialog />);
    expect(screen.queryByText("The AI is still being built")).toBeNull();
  });

  it("can be opened again from Help, and Read more opens the guide", async () => {
    localStorage.setItem("mimer.betaNoticeSeen", "1");
    const user = userEvent.setup();
    render(<BetaNoticeDialog />);
    expect(screen.queryByText("The AI is still being built")).toBeNull();
    useUiStore.getState().setBetaNoticeOpen(true);
    await user.click(await screen.findByRole("button", { name: "Read more" }));
    expect(useUiStore.getState().helpOpen).toBe(true);
  });
});
