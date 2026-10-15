import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Project } from "@/bindings/Project";

vi.mock("@/lib/api", () => ({ api: {}, toApiError: (e: unknown) => ({ message: String(e) }) }));

import { moveInto } from "./treeMoves";
import { useUiStore } from "@/stores/uiStore";
import { useVaultStore } from "@/stores/vaultStore";

const project: Project = {
  schemaVersion: 1,
  id: "p",
  name: "Docs",
  folder: "Docs",
  instructions: "",
  providerId: null,
  createdAt: "",
  updatedAt: "",
};

describe("moveInto and projects", () => {
  const renamePath = vi.fn().mockResolvedValue(true);

  beforeEach(() => {
    vi.clearAllMocks();
    renamePath.mockResolvedValue(true);
    useVaultStore.setState({ projects: [project], renamePath });
    useUiStore.setState({ notice: null });
  });

  it("a project cannot be moved into a folder, and a dialog says so", async () => {
    expect(await moveInto("Docs", "Work")).toBe(false);
    expect(renamePath).not.toHaveBeenCalled();
    const notice = useUiStore.getState().notice;
    expect(notice?.title).toBe("A project stays in the vault root");
    expect(notice?.details[0]).toContain("“Docs” is a project");
  });

  it("a note or a folder can be moved into a project", async () => {
    expect(await moveInto("Work/Plan.md", "Docs")).toBe(true);
    expect(renamePath).toHaveBeenCalledWith("Work/Plan.md", "Docs/Plan.md", undefined);
    expect(await moveInto("Work/Sub", "Docs")).toBe(true);
  });

  it("an ordinary folder can be moved anywhere", async () => {
    expect(await moveInto("Work/Sub", "Other")).toBe(true);
  });
});
