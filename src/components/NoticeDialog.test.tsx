import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it } from "vitest";
import { ApiError } from "@/lib/api";
import { reportError, useUiStore } from "@/stores/uiStore";
import { NoticeDialog } from "./NoticeDialog";

describe("a name that is already taken", () => {
  beforeEach(() => {
    useUiStore.setState({ notice: null, toasts: [] });
  });

  it("is shown in a dialog that must be closed, not in a toast", async () => {
    render(<NoticeDialog />);
    reportError(new ApiError("AlreadyExists", "A folder called “Docs” already exists in “Work”."));
    const dialog = await screen.findByRole("alertdialog");
    expect(dialog).toHaveTextContent("That name is already taken");
    expect(dialog).toHaveTextContent("A folder called “Docs” already exists in “Work”.");
    expect(dialog).toHaveTextContent("Nothing was changed");
    expect(dialog).toHaveTextContent("Rename one of them");
    expect(useUiStore.getState().toasts).toHaveLength(0);
    await userEvent.setup().click(screen.getByRole("button", { name: "OK" }));
    expect(useUiStore.getState().notice).toBeNull();
  });

  it("collects several failures in one dialog, for example when many items are moved", async () => {
    render(<NoticeDialog />);
    reportError(new ApiError("AlreadyExists", "A note called “A” already exists in “Work”."));
    reportError(new ApiError("AlreadyExists", "A folder called “B” already exists in “Work”."));
    reportError(new ApiError("AlreadyExists", "A note called “A” already exists in “Work”."));
    const dialog = await screen.findByRole("alertdialog");
    expect(dialog).toHaveTextContent("A note called “A”");
    expect(dialog).toHaveTextContent("A folder called “B”");
    expect(dialog.querySelectorAll("p.font-medium")).toHaveLength(2);
  });

  it("leaves other errors as toasts", () => {
    reportError(new ApiError("Io", "Disk full"));
    expect(useUiStore.getState().notice).toBeNull();
    expect(useUiStore.getState().toasts[0]?.message).toBe("Disk full");
  });
});
