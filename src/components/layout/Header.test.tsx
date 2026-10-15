import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const open = vi.hoisted(() => vi.fn());
vi.mock("@/lib/openLink", () => ({ openLink: open }));
vi.mock("@/lib/api", () => ({ api: {}, toApiError: (e: unknown) => ({ message: String(e) }) }));
vi.mock("@/lib/window", () => ({ setWindowTitle: vi.fn().mockResolvedValue(undefined) }));

import { Header } from "./Header";
import { useUiStore } from "@/stores/uiStore";
import { useVaultStore } from "@/stores/vaultStore";

describe("Header", () => {
  beforeEach(() => {
    useUiStore.setState({ helpOpen: false, helpTopic: "start" });
    useVaultStore.setState({ vault: null, activePath: null });
  });

  it("has a visible help button that opens the how-to guide", async () => {
    render(<Header />);
    const button = screen.getByRole("button", { name: "How to use Mimer" });
    expect(button).toHaveAttribute("title", expect.stringContaining("F1"));
    await userEvent.setup().click(button);
    expect(useUiStore.getState().helpOpen).toBe(true);
  });

  it("the File menu also has the guide", async () => {
    render(<Header />);
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "File menu" }));
    await user.click(await screen.findByRole("menuitem", { name: /How to use Mimer/ }));
    expect(useUiStore.getState().helpOpen).toBe(true);
  });

  it("has a Report submenu with the bug, feature and AI-content reports", async () => {
    open.mockResolvedValue(undefined);
    render(<Header />);
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "File menu" }));
    await user.click(await screen.findByRole("menuitem", { name: /Report/ }));
    expect(await screen.findByRole("menuitem", { name: /Report a bug/ })).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: /Suggest a feature/ })).toBeInTheDocument();
    const ai = screen.getByRole("menuitem", { name: /Report inappropriate AI content/ });
    ai.focus();
    await user.keyboard("{Enter}");
    await vi.waitFor(() => {
      expect(open).toHaveBeenCalledWith(expect.stringContaining("Inappropriate%20AI%20content"));
    });
  });
});
