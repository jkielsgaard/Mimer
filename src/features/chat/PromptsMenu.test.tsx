import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SavedPrompt } from "@/bindings/SavedPrompt";

const api = vi.hoisted(() => ({
  listPrompts: vi.fn(),
  addPrompt: vi.fn(),
  removePrompt: vi.fn(),
}));
vi.mock("@/lib/api", () => ({ api, toApiError: (e: unknown) => ({ message: String(e) }) }));

import { PromptsMenu } from "./PromptsMenu";

const saved: SavedPrompt[] = [
  { id: "p1", title: "Summarise", text: "Summarise this note in three bullets.", createdAt: "" },
  { id: "p2", title: "Tone", text: "Rewrite in a friendlier tone.", createdAt: "" },
];

async function openMenu(): Promise<void> {
  await userEvent.setup().click(screen.getByRole("button", { name: "Saved prompts" }));
}

describe("PromptsMenu", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    api.listPrompts.mockResolvedValue(saved);
    api.addPrompt.mockImplementation((title: string, text: string) =>
      Promise.resolve({ id: "new", title, text, createdAt: "" }),
    );
    api.removePrompt.mockResolvedValue(undefined);
  });

  it("inserts the chosen prompt into the message box", async () => {
    const onInsert = vi.fn();
    render(<PromptsMenu draft="" onInsert={onInsert} />);
    await openMenu();
    await userEvent.setup().click(await screen.findByText("Tone"));
    expect(onInsert).toHaveBeenCalledWith("Rewrite in a friendlier tone.");
  });

  it("shows a hint when there are no saved prompts", async () => {
    api.listPrompts.mockResolvedValue([]);
    render(<PromptsMenu draft="" onInsert={vi.fn()} />);
    await openMenu();
    expect(await screen.findByText("No saved prompts")).toBeInTheDocument();
  });

  it("saves the current text under the title the user types", async () => {
    render(<PromptsMenu draft="Check the grammar." onInsert={vi.fn()} />);
    const user = userEvent.setup();
    await openMenu();
    await user.click(await screen.findByText(/Save current text as prompt/));
    await user.type(screen.getByLabelText("Title"), "Grammar");
    await user.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => {
      expect(api.addPrompt).toHaveBeenCalledWith("Grammar", "Check the grammar.");
    });
  });

  it("removes a prompt with its delete button", async () => {
    render(<PromptsMenu draft="" onInsert={vi.fn()} />);
    const user = userEvent.setup();
    await openMenu();
    const removeButtons = await screen.findAllByRole("button", { name: "Remove prompt" });
    await user.click(removeButtons[0] as HTMLElement);

    await waitFor(() => {
      expect(api.removePrompt).toHaveBeenCalledWith("p1");
    });
  });
});
