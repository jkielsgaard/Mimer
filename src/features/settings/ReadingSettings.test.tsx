import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { makeSettings } from "@/test/settings";
import { useSettingsStore } from "@/stores/settingsStore";
import { ReadingSettings } from "./ReadingSettings";

const root = document.documentElement;

describe("ReadingSettings", () => {
  afterEach(() => {
    root.removeAttribute("style");
    root.removeAttribute("data-follow-line");
  });

  it("shows a choice at once and hands the new settings on", async () => {
    const onChange = vi.fn();
    const editor = makeSettings().editor;
    render(<ReadingSettings editor={editor} onChange={onChange} />);
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Roomy" }));
    expect(root.style.getPropertyValue("--read-line-height")).toBe("1.9");
    expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({ lineSpacing: "roomy" }));
    await user.click(screen.getByRole("checkbox", { name: /Follow the line/ }));
    expect(root.hasAttribute("data-follow-line")).toBe(true);
    expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({ followLine: true }));
  });

  it("puts the saved choices back when it is closed without saving, and has a way back to the defaults", async () => {
    useSettingsStore.setState({ settings: makeSettings() });
    const onChange = vi.fn();
    const editor = { ...makeSettings().editor, textFont: "mono" };
    const { unmount } = render(<ReadingSettings editor={editor} onChange={onChange} />);
    await userEvent.setup().click(screen.getByRole("button", { name: "Back to the defaults" }));
    expect(onChange).toHaveBeenLastCalledWith(
      expect.objectContaining({ textFont: "system", lineSpacing: "normal", followLine: false }),
    );
    root.style.setProperty("--read-font", "monospace");
    unmount();
    expect(root.style.getPropertyValue("--read-font")).toContain("system-ui");
  });
});
