import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const apiMock = vi.hoisted(() => ({ readNote: vi.fn() }));
vi.mock("@/lib/api", () => ({ api: apiMock }));
const ask = vi.hoisted(() => ({ askAi: vi.fn() }));
vi.mock("@/lib/askAi", () => ask);
const clip = vi.hoisted(() => ({ copyText: vi.fn() }));
vi.mock("@/lib/clipboard", () => clip);

import { InShortDialog } from "./InShortDialog";
import { useTaskStore } from "@/stores/taskStore";
import { useUiStore } from "@/stores/uiStore";
import { useVaultStore } from "@/stores/vaultStore";

const answer = (text: string): void => {
  ask.askAi.mockReturnValue({ promise: Promise.resolve(text), cancel: vi.fn() });
};

describe("InShortDialog", () => {
  const addToNote = vi.fn().mockResolvedValue(undefined);
  const epicFor = vi.fn().mockResolvedValue("Tasks/Licence terms.md");

  beforeEach(() => {
    vi.clearAllMocks();
    addToNote.mockResolvedValue(undefined);
    epicFor.mockResolvedValue("Tasks/Licence terms.md");
    apiMock.readNote.mockResolvedValue({ content: "A long note." });
    useVaultStore.setState({ activePath: "IT/Licence terms.md" });
    useTaskStore.setState({ addToNote, epicFor });
    useUiStore.setState({ inShortOpen: true });
  });

  it("shows nothing until it is asked for", () => {
    useUiStore.setState({ inShortOpen: false });
    render(<InShortDialog />);
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("shows the points and the things to do, and adds only the ones that stay ticked", async () => {
    answer("POINTS\n- One licence per person.\nTODO\n- Order the renewal\n- Check the seats");
    render(<InShortDialog />);
    const user = userEvent.setup();
    expect(await screen.findByText("One licence per person.")).toBeInTheDocument();
    await user.click(screen.getByRole("checkbox", { name: "Check the seats" }));
    await user.click(screen.getByRole("button", { name: "Add 1 task to the epic" }));
    await waitFor(() => {
      expect(addToNote).toHaveBeenCalledWith("Tasks/Licence terms.md", ["Order the renewal"]);
    });
    expect(useUiStore.getState().inShortOpen).toBe(false);
  });

  it("copies the result as Markdown and writes nothing to the note", async () => {
    answer("POINTS\n- A point\nTODO\n- Do it");
    render(<InShortDialog />);
    await userEvent.setup().click(await screen.findByRole("button", { name: "Copy" }));
    expect(clip.copyText).toHaveBeenCalledWith("- A point\n\n- [ ] Do it\n");
    expect(addToNote).not.toHaveBeenCalled();
  });

  it("says what went wrong, and asks again with Try again", async () => {
    ask.askAi.mockReturnValueOnce({
      promise: Promise.reject(new Error("No AI is running.")),
      cancel: vi.fn(),
    });
    render(<InShortDialog />);
    expect(await screen.findByRole("alert")).toHaveTextContent("No AI is running.");
    answer("POINTS\n- Now it works");
    await userEvent.setup().click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByText("Now it works")).toBeInTheDocument();
  });
});
