import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ImageUsage } from "@/bindings/ImageUsage";

const api = vi.hoisted(() => ({ imageUsage: vi.fn() }));
const actions = vi.hoisted(() => ({
  openFile: vi.fn(),
  assetUrlFor: (p: string) => `asset://${p}`,
}));
vi.mock("@/lib/api", () => ({ api, toApiError: (e: unknown) => ({ message: String(e) }) }));
vi.mock("@/lib/actions", () => actions);
const insertPicture = vi.hoisted(() => vi.fn());
vi.mock("@/lib/insertPicture", () => ({ insertPictureIntoNote: insertPicture }));

import { ImagesPanel } from "./ImagesPanel";
import { useVaultStore } from "@/stores/vaultStore";
import { useUiStore } from "@/stores/uiStore";

const images: ImageUsage[] = [
  { path: "attachments/chart.png", sizeKb: 120, usedIn: ["Work/Plan.md", "Home.md"] },
  { path: "attachments/old.png", sizeKb: 40, usedIn: [] },
];

describe("ImagesPanel", () => {
  const deletePath = vi.fn().mockResolvedValue(true);

  beforeEach(() => {
    vi.clearAllMocks();
    api.imageUsage.mockResolvedValue(images);
    useVaultStore.setState({ deletePath, indexNonce: 0 });
  });

  it("lists the pictures with size and the notes that use them", async () => {
    render(<ImagesPanel />);
    expect(await screen.findByText("chart.png")).toBeInTheDocument();
    expect(screen.getByText(/2 images · 1 not used/)).toBeInTheDocument();
    expect(screen.getByText(/120 KB · used in 2 notes/)).toBeInTheDocument();
    expect(screen.getByText(/40 KB · not used/)).toBeInTheDocument();
    await userEvent.setup().click(screen.getByRole("button", { name: "Plan" }));
    expect(actions.openFile).toHaveBeenCalledWith("Work/Plan.md");
  });

  it("enlarges a picture when its thumbnail or name is clicked", async () => {
    render(<ImagesPanel />);
    const user = userEvent.setup();
    await user.click(await screen.findByRole("button", { name: "Enlarge chart.png" }));
    expect(useUiStore.getState().imagePreview).toEqual({
      src: "asset://attachments/chart.png",
      name: "chart.png",
      path: "attachments/chart.png",
    });
    await user.click(screen.getByRole("button", { name: "old.png" }));
    expect(useUiStore.getState().imagePreview?.path).toBe("attachments/old.png");
  });

  it("inserts a picture into the open note with one click", async () => {
    render(<ImagesPanel />);
    const buttons = await screen.findAllByRole("button", { name: /Insert in note/ });
    await userEvent.setup().click(buttons[0] as HTMLElement);
    expect(insertPicture).toHaveBeenCalledWith("attachments/chart.png");
  });

  it("can show only the unused pictures", async () => {
    render(<ImagesPanel />);
    await screen.findByText("chart.png");
    await userEvent.setup().click(screen.getByLabelText("Unused only"));
    expect(screen.queryByText("chart.png")).toBeNull();
    expect(screen.getByText("old.png")).toBeInTheDocument();
  });

  it("asks before moving a picture to the trash, and names the notes that use it", async () => {
    render(<ImagesPanel />);
    await screen.findByText("chart.png");
    const user = userEvent.setup();
    await user.click(screen.getAllByRole("button", { name: /Move to trash/ })[0] as HTMLElement);
    expect(await screen.findByText(/shown in Plan, Home/)).toBeInTheDocument();
    expect(deletePath).not.toHaveBeenCalled();
    await user.click(
      screen.getAllByRole("button", { name: "Move to trash" }).at(-1) as HTMLElement,
    );
    await waitFor(() => {
      expect(deletePath).toHaveBeenCalledWith("attachments/chart.png");
    });
  });

  it("says what to do when the vault has no pictures", async () => {
    api.imageUsage.mockResolvedValue([]);
    render(<ImagesPanel />);
    expect(await screen.findByText(/No images yet/)).toBeInTheDocument();
  });
});
