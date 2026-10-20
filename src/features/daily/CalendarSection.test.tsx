import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const apiMock = vi.hoisted(() => ({ listDailyDates: vi.fn() }));
vi.mock("@/lib/api", () => ({
  api: apiMock,
  toApiError: (e: unknown) => ({ message: String(e) }),
}));

import { CalendarSection } from "./CalendarSection";
import { shortDate, todayIso } from "@/lib/taskLogic";
import { useVaultStore } from "@/stores/vaultStore";

describe("CalendarSection", () => {
  const today = todayIso();
  const openDailyNote = vi.fn();
  beforeEach(() => {
    localStorage.clear();
    openDailyNote.mockReset().mockResolvedValue("Daily/x.md");
    apiMock.listDailyDates.mockReset().mockResolvedValue([today]);
    useVaultStore.setState({ openDailyNote, files: [] });
  });

  it("shows the month, marks the days that have a note, and opens a day when it is clicked", async () => {
    render(<CalendarSection />);
    const user = userEvent.setup();
    const day = await screen.findByRole("gridcell", { name: `${shortDate(today)}, has a note` });
    expect(day).toHaveAttribute("aria-current", "date");
    await user.click(day);
    expect(openDailyNote).toHaveBeenCalledWith(today);
  });

  it("goes to the next month and back, and Today opens today's note", async () => {
    render(<CalendarSection />);
    const user = userEvent.setup();
    const title = screen.getByRole("grid").getAttribute("aria-label");
    await user.click(screen.getByRole("button", { name: "Next month" }));
    expect(screen.getByRole("grid").getAttribute("aria-label")).not.toBe(title);
    await user.click(screen.getByRole("button", { name: "Today" }));
    await waitFor(() => {
      expect(openDailyNote).toHaveBeenCalledWith(today);
    });
    expect(screen.getByRole("grid").getAttribute("aria-label")).toBe(title);
  });
});
