import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/api", () => ({ api: {}, toApiError: (e: unknown) => ({ message: String(e) }) }));

import { useUiStore } from "@/stores/uiStore";
import { TasksMenu } from "./TasksMenu";
import { TASKS } from "./tasks";

describe("TasksMenu", () => {
  beforeEach(() => {
    useUiStore.setState({ researchOpen: false, importAnswerOpen: false });
  });

  it("offers ten tasks and inserts the chosen prompt into the message box", async () => {
    expect(TASKS).toHaveLength(10);
    expect(new Set(TASKS.map((t) => t.id)).size).toBe(10);
    const onInsert = vi.fn();
    render(<TasksMenu onInsert={onInsert} />);
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Tasks for Mimer" }));
    await user.click(await screen.findByText("Merge notes"));
    expect(onInsert).toHaveBeenCalledWith(expect.stringContaining("Merge the attached notes"));
  });

  it("opens the research prompt and import dialogs", async () => {
    render(<TasksMenu onInsert={vi.fn()} />);
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Tasks for Mimer" }));
    await user.click(await screen.findByText("Write a research prompt…"));
    expect(useUiStore.getState().researchOpen).toBe(true);
    await user.click(screen.getByRole("button", { name: "Tasks for Mimer" }));
    await user.click(await screen.findByText("Import an answer from a cloud AI…"));
    expect(useUiStore.getState().importAnswerOpen).toBe(true);
  });
});
