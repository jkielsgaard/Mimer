import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const open = vi.hoisted(() => vi.fn());
vi.mock("@/lib/openLink", () => ({ openLink: open }));

import { WhatsNewDialog } from "./WhatsNewDialog";
import { appVersion } from "@/lib/version";
import { minorOf } from "@/lib/whatsNew";
import { useUiStore } from "@/stores/uiStore";

describe("WhatsNewDialog", () => {
  beforeEach(() => {
    localStorage.clear();
    open.mockReset();
    useUiStore.setState({ whatsNewOpen: false });
  });

  it("comes by itself once when this version is new to the computer, and not again", async () => {
    localStorage.setItem("mimer.betaNoticeSeen", "1");
    const { unmount } = render(<WhatsNewDialog />);
    expect(
      await screen.findByRole("heading", { name: `What's new in Mimer ${minorOf(appVersion)}` }),
    ).toBeInTheDocument();
    expect(screen.getAllByRole("listitem").length).toBeGreaterThan(0);
    await userEvent.setup().click(screen.getByRole("button", { name: "Got it" }));
    expect(localStorage.getItem("mimer.whatsNewSeen")).toBe(minorOf(appVersion));
    expect(useUiStore.getState().whatsNewOpen).toBe(false);
    unmount();
    render(<WhatsNewDialog />);
    expect(useUiStore.getState().whatsNewOpen).toBe(false);
  });

  it("never comes on the first run, and remembers the version without showing it", () => {
    render(<WhatsNewDialog />);
    expect(useUiStore.getState().whatsNewOpen).toBe(false);
    expect(localStorage.getItem("mimer.whatsNewSeen")).toBe(minorOf(appVersion));
  });

  it("opens from the Help menu at any time, and All changes opens the changelog", async () => {
    localStorage.setItem("mimer.betaNoticeSeen", "1");
    localStorage.setItem("mimer.whatsNewSeen", minorOf(appVersion));
    render(<WhatsNewDialog />);
    expect(useUiStore.getState().whatsNewOpen).toBe(false);
    useUiStore.getState().setWhatsNewOpen(true);
    const user = userEvent.setup();
    await user.click(await screen.findByRole("button", { name: "All changes" }));
    expect(open).toHaveBeenCalledWith(
      "https://github.com/jkielsgaard/Mimer/blob/main/CHANGELOG.md",
    );
  });
});
