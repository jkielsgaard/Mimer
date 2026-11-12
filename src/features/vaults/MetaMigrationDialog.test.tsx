import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const apiMock = vi.hoisted(() => ({
  metaMigrationStatus: vi.fn(),
  metaMigrate: vi.fn(),
  taggedNotes: vi.fn(),
}));
vi.mock("@/lib/api", () => ({
  api: apiMock,
  toApiError: (e: unknown) => ({ code: "Unknown", message: String(e) }),
}));

import { MetaMigrationDialog } from "./MetaMigrationDialog";
import { useTaskStore } from "@/stores/taskStore";
import { useVaultStore } from "@/stores/vaultStore";

describe("MetaMigrationDialog", () => {
  const load = vi.fn().mockResolvedValue(undefined);
  const refreshTree = vi.fn().mockResolvedValue(undefined);

  beforeEach(() => {
    vi.clearAllMocks();
    apiMock.taggedNotes.mockResolvedValue([]);
    useTaskStore.setState({ load });
    useVaultStore.setState({
      vault: { path: "/v/Notes" } as never,
      refreshTree,
    });
  });

  it("says nothing when there is nothing to move", async () => {
    apiMock.metaMigrationStatus.mockResolvedValue({ pinned: 0, tasks: 0 });
    render(<MetaMigrationDialog />);
    await waitFor(() => {
      expect(apiMock.metaMigrationStatus).toHaveBeenCalled();
    });
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("asks first, says what happens, and moves nothing until the person says yes", async () => {
    apiMock.metaMigrationStatus.mockResolvedValue({ pinned: 2, tasks: 1 });
    render(<MetaMigrationDialog />);
    const dialog = await screen.findByRole("dialog");
    expect(dialog).toHaveTextContent("2 pinned notes and 1 task that wait");
    expect(dialog).toHaveTextContent("the next version of Mimer only reads the new place");
    expect(apiMock.metaMigrate).not.toHaveBeenCalled();
    await userEvent.setup().click(screen.getByRole("button", { name: "Not now" }));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(apiMock.metaMigrate).not.toHaveBeenCalled();
  });

  it("moves them when the person confirms, and reads the lists again", async () => {
    apiMock.metaMigrationStatus.mockResolvedValue({ pinned: 1, tasks: 0 });
    apiMock.metaMigrate.mockResolvedValue({ pinned: 1, tasks: 0 });
    render(<MetaMigrationDialog />);
    await userEvent.setup().click(await screen.findByRole("button", { name: "Move them now" }));
    await waitFor(() => {
      expect(apiMock.metaMigrate).toHaveBeenCalledTimes(1);
    });
    await waitFor(() => {
      expect(screen.queryByRole("dialog")).toBeNull();
    });
    expect(load).toHaveBeenCalled();
    expect(refreshTree).toHaveBeenCalled();
  });
});
