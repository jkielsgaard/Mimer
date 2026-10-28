import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it } from "vitest";
import { useUiStore } from "@/stores/uiStore";
import { ActivityRail } from "./ActivityRail";

describe("ActivityRail", () => {
  beforeEach(() => {
    useUiStore.setState({
      leftTab: "files",
      leftCollapsed: false,
      settingsOpen: false,
      centerView: "notes",
    });
  });

  it("marks the open panel and switches to another", async () => {
    render(<ActivityRail />);
    const user = userEvent.setup();
    expect(screen.getByRole("tab", { name: "Files" })).toHaveAttribute("aria-selected", "true");
    await user.click(screen.getByRole("tab", { name: "Search" }));
    expect(useUiStore.getState().leftTab).toBe("search");
    expect(screen.getByRole("tab", { name: "Search" })).toHaveAttribute("aria-selected", "true");
  });

  it("hides the panel when its own icon is pressed and shows it again", async () => {
    render(<ActivityRail />);
    const user = userEvent.setup();
    await user.click(screen.getByRole("tab", { name: "Files" }));
    expect(useUiStore.getState().leftCollapsed).toBe(true);
    await user.click(screen.getByRole("tab", { name: "Search" }));
    expect(useUiStore.getState().leftCollapsed).toBe(false);
    expect(useUiStore.getState().leftTab).toBe("search");
  });

  it("opens the start page, and Files brings the notes back", async () => {
    render(<ActivityRail />);
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Start" }));
    expect(useUiStore.getState().centerView).toBe("start");
    expect(screen.getByRole("button", { name: "Start" })).toHaveAttribute("aria-pressed", "true");
    // The page is shown on its own: no panel is marked as open.
    expect(screen.getByRole("tab", { name: "Files" })).toHaveAttribute("aria-selected", "false");
    await user.click(screen.getByRole("tab", { name: "Files" }));
    expect(useUiStore.getState().centerView).toBe("notes");
    expect(useUiStore.getState().leftCollapsed).toBe(false);
  });

  it("leaves the start page when a side panel or search is asked for", () => {
    useUiStore.getState().openStart();
    useUiStore.getState().focusSearch("vpn");
    expect(useUiStore.getState().centerView).toBe("notes");
    expect(useUiStore.getState().leftTab).toBe("search");
    useUiStore.getState().openStart();
    useUiStore.getState().toggleRight();
    expect(useUiStore.getState().centerView).toBe("notes");
    expect(useUiStore.getState().rightCollapsed).toBe(false);
  });

  it("opens the Meetings area", async () => {
    render(<ActivityRail />);
    await userEvent.setup().click(screen.getByRole("tab", { name: "Meetings" }));
    expect(useUiStore.getState().leftTab).toBe("meetings");
    expect(useUiStore.getState().centerView).toBe("meetings");
  });

  it("opens the settings", async () => {
    render(<ActivityRail />);
    await userEvent.setup().click(screen.getByRole("button", { name: "Settings" }));
    expect(useUiStore.getState().settingsOpen).toBe(true);
  });

  it("brings the note back when Files is pressed while Tasks is in the middle", async () => {
    useUiStore.getState().openArea("tasks");
    render(<ActivityRail />);
    await userEvent.setup().click(screen.getByRole("tab", { name: "Files" }));
    expect(useUiStore.getState().leftTab).toBe("files");
    expect(useUiStore.getState().centerView).toBe("notes");
  });

  it("shows the files again when the middle goes back to the notes", () => {
    useUiStore.getState().openArea("ideas");
    useUiStore.getState().setCenterView("notes");
    expect(useUiStore.getState().leftTab).toBe("files");
    useUiStore.setState({ leftTab: "search" });
    useUiStore.getState().setCenterView("notes");
    expect(useUiStore.getState().leftTab).toBe("search");
  });
});
