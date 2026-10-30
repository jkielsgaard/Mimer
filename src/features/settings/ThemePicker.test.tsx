import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ThemePicker } from "./ThemePicker";

describe("ThemePicker", () => {
  afterEach(() => {
    delete document.documentElement.dataset.theme;
    document.documentElement.classList.remove("dark");
  });

  it("shows eight themes, marks the chosen one, and applies a pick at once", async () => {
    window.matchMedia = vi.fn().mockReturnValue({ matches: false }) as never;
    const onChange = vi.fn();
    render(<ThemePicker value="light" onChange={onChange} />);
    expect(screen.getAllByRole("radio")).toHaveLength(8);
    expect(screen.getByRole("radio", { name: "Light" })).toHaveAttribute("aria-checked", "true");
    await userEvent.setup().click(screen.getByRole("radio", { name: "Midnight" }));
    expect(onChange).toHaveBeenCalledWith("midnight");
    expect(document.documentElement.dataset.theme).toBe("midnight");
    expect(document.documentElement.classList.contains("dark")).toBe(true);
  });

  it("follows the computer when asked, and goes back to the theme shown when not", async () => {
    window.matchMedia = vi.fn().mockReturnValue({ matches: true }) as never;
    const onChange = vi.fn();
    const { rerender } = render(<ThemePicker value="paper" onChange={onChange} />);
    const user = userEvent.setup();
    await user.click(screen.getByRole("checkbox", { name: /Follow my computer/ }));
    expect(onChange).toHaveBeenLastCalledWith("system");
    rerender(<ThemePicker value="system" onChange={onChange} />);
    expect(screen.getByRole("checkbox", { name: /Follow my computer/ })).toBeChecked();
    await user.click(screen.getByRole("checkbox", { name: /Follow my computer/ }));
    // The theme on screen (Dark, because the computer is dark) becomes the choice.
    expect(onChange).toHaveBeenLastCalledWith("dark");
  });
});
