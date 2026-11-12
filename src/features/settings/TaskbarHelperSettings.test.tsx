import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { HelperStatus } from "@/bindings/HelperStatus";
import { makeSettings } from "@/test/settings";

const apiMock = vi.hoisted(() => ({ helperStatus: vi.fn() }));
vi.mock("@/lib/api", () => ({ api: apiMock }));

import { TaskbarHelperSettings } from "./TaskbarHelperSettings";
import { useSettingsStore } from "@/stores/settingsStore";

const works = { ok: true, problem: "" };
const windows: HelperStatus = { supported: true, running: true, quickNote: works, park: works };

describe("TaskbarHelperSettings", () => {
  const helper = makeSettings().helper;
  beforeEach(() => {
    vi.clearAllMocks();
    useSettingsStore.setState({ settings: makeSettings() });
  });

  it("is greyed out with the reason where the helper does not work", async () => {
    apiMock.helperStatus.mockResolvedValue({ ...windows, supported: false });
    render(<TaskbarHelperSettings helper={helper} onChange={vi.fn()} />);
    expect(await screen.findByText(/works on Windows only/)).toBeInTheDocument();
    expect(screen.getByRole("checkbox", { name: /Turn on the taskbar helper/ })).toBeDisabled();
    expect(screen.getByLabelText("Write something down")).toBeDisabled();
  });

  it("is greyed out too when Mimer cannot ask (outside the app)", async () => {
    apiMock.helperStatus.mockRejectedValue(new Error("no backend"));
    render(<TaskbarHelperSettings helper={helper} onChange={vi.fn()} />);
    expect(await screen.findByText(/works on Windows only/)).toBeInTheDocument();
  });

  it("is off until turned on, and the keys can only be changed while it is on", async () => {
    apiMock.helperStatus.mockResolvedValue(windows);
    const onChange = vi.fn();
    const { rerender } = render(<TaskbarHelperSettings helper={helper} onChange={onChange} />);
    const box = await screen.findByRole("checkbox", { name: /Turn on the taskbar helper/ });
    await waitFor(() => {
      expect(box).toBeEnabled();
    });
    expect(box).not.toBeChecked();
    expect(screen.getByLabelText("Write something down")).toBeDisabled();
    await userEvent.setup().click(box);
    expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({ enabled: true }));
    rerender(<TaskbarHelperSettings helper={{ ...helper, enabled: true }} onChange={onChange} />);
    expect(screen.getByLabelText("Write something down")).toBeEnabled();
  });

  it("takes the keys that are pressed in the box, and can go back to the standard keys", async () => {
    apiMock.helperStatus.mockResolvedValue(windows);
    const onChange = vi.fn();
    render(<TaskbarHelperSettings helper={{ ...helper, enabled: true }} onChange={onChange} />);
    const box = await screen.findByLabelText("Write something down");
    fireEvent.keyDown(box, { code: "KeyG", ctrlKey: true, altKey: true });
    expect(onChange).toHaveBeenLastCalledWith(
      expect.objectContaining({ quickNoteKey: "Ctrl+Alt+G" }),
    );
    fireEvent.keyDown(box, { code: "KeyG" });
    expect(screen.getByText(/Use Ctrl, Alt or Shift/)).toBeInTheDocument();
    const user = userEvent.setup();
    expect(screen.getByRole("button", { name: "Use Ctrl+Alt+N" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Use Ctrl+Alt+P" })).toBeDisabled();
    await user.click(screen.getByRole("checkbox", { name: /Keep Mimer running/ }));
    expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({ keepRunning: false }));
  });

  it("says how the saved keys went, in plain words", async () => {
    const saved = { ...helper, enabled: true };
    useSettingsStore.setState({ settings: { ...makeSettings(), helper: saved } });
    apiMock.helperStatus.mockResolvedValue({
      ...windows,
      park: { ok: false, problem: "Another program already uses these keys. Choose others." },
    });
    render(<TaskbarHelperSettings helper={saved} onChange={vi.fn()} />);
    expect(await screen.findByText("Works")).toBeInTheDocument();
    expect(screen.getByText(/Another program already uses these keys/)).toBeInTheDocument();
  });
});
