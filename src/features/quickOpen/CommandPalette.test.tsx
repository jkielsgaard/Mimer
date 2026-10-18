import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Skill } from "@/bindings/Skill";

const fix: Skill = {
  id: "builtin:fix-spelling",
  name: "Fix spelling and grammar",
  description: "Correct the text",
  kind: "rewrite",
  appliesTo: "both",
  instruction: "Fix it.",
  builtin: true,
};
const { apiMock, runMock, openMock } = vi.hoisted(() => ({
  apiMock: { listSkills: vi.fn() },
  runMock: vi.fn(),
  openMock: vi.fn(),
}));
vi.mock("@/lib/api", () => ({
  api: apiMock,
  toApiError: (e: unknown) => ({ message: String(e) }),
}));
vi.mock("@/lib/skills", async (orig) => ({
  ...(await orig<typeof import("@/lib/skills")>()),
  runSkillOn: runMock,
}));
vi.mock("@/lib/actions", () => ({
  newNoteInCurrentFolder: vi.fn(),
  openDailyNote: vi.fn(),
  openFile: openMock,
}));

import { CommandPalette } from "./CommandPalette";
import { useUiStore } from "@/stores/uiStore";
import { useVaultStore } from "@/stores/vaultStore";

describe("CommandPalette", () => {
  beforeEach(() => {
    runMock.mockReset();
    openMock.mockReset();
    apiMock.listSkills.mockReset().mockResolvedValue([fix]);
    useVaultStore.setState({
      files: ["Work/Firewall plan.md", "Home.md"],
      tree: [],
      activePath: "Home.md",
      selectedPath: null,
    });
    useUiStore.setState({ commandPalette: true });
  });

  it("lists the skills for the open note and runs one with Enter", async () => {
    render(<CommandPalette />);
    const user = userEvent.setup();
    expect(await screen.findByText("Skills · on “Home”")).toBeInTheDocument();
    expect(screen.getByRole("option", { name: /Fix spelling and grammar/ })).toBeInTheDocument();
    await user.keyboard("{Enter}");
    expect(runMock).toHaveBeenCalledWith(expect.objectContaining({ id: fix.id }), ["Home.md"]);
    expect(useUiStore.getState().commandPalette).toBe(false);
  });

  it("finds a note by name and opens it", async () => {
    render(<CommandPalette />);
    const user = userEvent.setup();
    await user.type(await screen.findByLabelText("Search notes, skills and actions"), "firew");
    await user.click(screen.getByRole("option", { name: /Firewall plan/ }));
    expect(openMock).toHaveBeenCalledWith("Work/Firewall plan.md");
  });

  it("opens from nothing but actions when no note is open", async () => {
    useVaultStore.setState({ activePath: null });
    render(<CommandPalette />);
    expect(await screen.findByText(/Open a note or select a folder/)).toBeInTheDocument();
    expect(screen.getByRole("option", { name: /New note/ })).toBeInTheDocument();
  });
});
