import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const open = vi.hoisted(() => vi.fn());
vi.mock("@/lib/openLink", () => ({ openLink: open }));

import userEvent from "@testing-library/user-event";
import { AboutDialog } from "./AboutDialog";
import { useUiStore } from "@/stores/uiStore";

describe("AboutDialog", () => {
  beforeEach(() => {
    useUiStore.setState({ aboutOpen: false });
  });

  it("is closed until it is opened", () => {
    render(<AboutDialog />);
    expect(screen.queryByText("About Mimer")).toBeNull();
  });

  it("shows the picture, the version, the idea and the developer", () => {
    useUiStore.setState({ aboutOpen: true });
    render(<AboutDialog />);
    expect(screen.getByText("About Mimer")).toBeInTheDocument();
    expect(screen.getByRole("img", { name: /Mimer/ })).toBeInTheDocument();
    expect(screen.getByTestId("about-version").textContent).toMatch(/Version \d+\.\d+\.\d+/);
    expect(screen.getByTestId("about-version").textContent).toContain("AGPL-3.0 licence");
    expect(screen.getByText(/plain Markdown files/)).toBeInTheDocument();
    expect(screen.getByText(/The idea\./)).toBeInTheDocument();
    expect(screen.getByText("Jesper Ahasverusen Kielsgaard")).toBeInTheDocument();
  });

  it("says which edition this is and links to the releases, without checking by itself", async () => {
    useUiStore.setState({ aboutOpen: true });
    render(<AboutDialog />);
    expect(screen.getByText(/never looks for updates by itself/i)).toBeInTheDocument();
    await userEvent.setup().click(screen.getByRole("button", { name: "Check for a new version" }));
    expect(open).toHaveBeenCalledWith("https://github.com/jkielsgaard/Mimer/releases");
  });
});
