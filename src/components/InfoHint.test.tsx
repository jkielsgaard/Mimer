import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { InfoHint } from "./InfoHint";
import { useUiStore } from "@/stores/uiStore";

describe("InfoHint", () => {
  beforeEach(() => {
    useUiStore.setState({ helpOpen: false, helpTopic: "start" });
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("has a name for screen readers and shows nothing until asked", () => {
    render(<InfoHint label="Local AI only" text="Nothing leaves your computer." />);
    expect(screen.getByRole("button", { name: "About: Local AI only" })).toBeInTheDocument();
    expect(screen.queryByRole("tooltip")).toBeNull();
  });

  it("shows the text when the mouse is over it and hides it when the mouse leaves", () => {
    vi.useFakeTimers();
    render(<InfoHint label="x" text="Nothing leaves your computer." />);
    const button = screen.getByRole("button", { name: "About: x" });
    fireEvent.mouseEnter(button);
    expect(screen.getByRole("tooltip")).toHaveTextContent("Nothing leaves your computer.");
    expect(button).toHaveAttribute("aria-describedby", screen.getByRole("tooltip").id);
    fireEvent.mouseLeave(button);
    act(() => {
      vi.advanceTimersByTime(300);
    });
    expect(screen.queryByRole("tooltip")).toBeNull();
  });

  it("works from the keyboard: focus shows it and Escape hides it", async () => {
    render(<InfoHint label="x" text="Help text." />);
    const user = userEvent.setup();
    await user.tab();
    expect(screen.getByRole("tooltip")).toBeInTheDocument();
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("tooltip")).toBeNull();
  });

  it("a click keeps it open, also after the mouse was over it, and clicking elsewhere hides it", async () => {
    render(<InfoHint label="x" text="Help text." />);
    const user = userEvent.setup();
    const button = screen.getByRole("button", { name: "About: x" });
    await user.click(button);
    expect(screen.getByRole("tooltip")).toBeInTheDocument();
    await user.click(button);
    expect(screen.getByRole("tooltip")).toBeInTheDocument();
    await user.click(document.body);
    await waitFor(() => {
      expect(screen.queryByRole("tooltip")).toBeNull();
    });
  });

  it("offers a link to the guide only when it has a topic, and the link opens that topic", async () => {
    const { rerender } = render(<InfoHint label="x" text="Help text." />);
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "About: x" }));
    expect(screen.queryByRole("button", { name: "Read more in the guide" })).toBeNull();

    rerender(<InfoHint label="x" text="Help text." topic="images" />);
    await user.click(screen.getByRole("button", { name: "About: x" }));
    await user.click(await screen.findByRole("button", { name: "Read more in the guide" }));
    expect(useUiStore.getState()).toMatchObject({ helpOpen: true, helpTopic: "images" });
    expect(screen.queryByRole("tooltip")).toBeNull();
  });
});
