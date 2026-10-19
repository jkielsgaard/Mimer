import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { TabBar, dropIndex } from "./TabBar";
import { emptyLayout, openPath, useWorkspaceStore } from "@/stores/workspaceStore";

describe("TabBar", () => {
  beforeEach(() => {
    let layout = openPath(openPath(emptyLayout(), "Work/Plan.md"), "Home.md");
    layout = { ...layout, focused: "primary" };
    useWorkspaceStore.setState({ layout });
  });

  it("shows one tab per open note with its title", () => {
    render(<TabBar paneId="primary" />);
    const tabs = screen.getAllByRole("tab");
    expect(tabs.map((t) => t.textContent)).toEqual(expect.arrayContaining(["Plan", "Home"]));
    expect(tabs[1]).toHaveAttribute("aria-selected", "true");
  });

  it("clicking a tab activates it", () => {
    render(<TabBar paneId="primary" />);
    fireEvent.click(screen.getByRole("tab", { name: /Plan/ }));
    expect(useWorkspaceStore.getState().layout.panes[0]?.active).toBe("Work/Plan.md");
  });

  it("the close button closes the tab without activating it", () => {
    render(<TabBar paneId="primary" />);
    fireEvent.click(screen.getByLabelText("Close Plan"));
    expect(useWorkspaceStore.getState().layout.panes[0]?.tabs).toEqual(["Home.md"]);
  });

  it("middle click closes a tab", () => {
    render(<TabBar paneId="primary" />);
    fireEvent(
      screen.getByRole("tab", { name: /Plan/ }),
      new MouseEvent("auxclick", { bubbles: true, button: 1 }),
    );
    expect(useWorkspaceStore.getState().layout.panes[0]?.tabs).toEqual(["Home.md"]);
  });

  it("drop position maps to a tab index at the end of the bar", () => {
    expect(dropIndex(3, null)).toBe(3);
    expect(dropIndex(3, 1)).toBe(1);
    expect(dropIndex(3, 9)).toBe(3);
  });

  it("tells tabs with the same name apart by their folder", () => {
    let layout = openPath(openPath(emptyLayout(), "Acme/Meeting.md"), "Bygma/Meeting.md");
    layout = { ...layout, focused: "primary" };
    useWorkspaceStore.setState({ layout });
    render(<TabBar paneId="primary" />);
    const tabs = screen.getAllByRole("tab");
    expect(tabs.map((t) => t.textContent)).toEqual(["MeetingAcme", "MeetingBygma"]);
    expect(screen.getByLabelText("Close Meeting (Acme)")).toBeInTheDocument();
    expect(screen.getByLabelText("Close Meeting (Bygma)")).toBeInTheDocument();
  });
});
