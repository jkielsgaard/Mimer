import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it } from "vitest";
import { useUiStore } from "@/stores/uiStore";
import { ActivityRail } from "./ActivityRail";

describe("ActivityRail", () => {
  beforeEach(() => {
    useUiStore.setState({ leftTab: "files", leftCollapsed: false, settingsOpen: false });
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
