import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
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
    expect(screen.getByTestId("about-version").textContent).toContain("Apache-2.0 licence");
    expect(screen.getByText(/plain Markdown files/)).toBeInTheDocument();
    expect(screen.getByText(/The idea\./)).toBeInTheDocument();
    expect(screen.getByText("Jesper Ahasverusen Kielsgaard")).toBeInTheDocument();
  });
});
