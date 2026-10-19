import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Skill } from "@/bindings/Skill";

const mk = (id: string, name: string, appliesTo: Skill["appliesTo"]): Skill => ({
  id,
  name,
  description: "",
  kind: "rewrite",
  appliesTo,
  instruction: "Do.",
  builtin: true,
});
const { apiMock, runMock } = vi.hoisted(() => ({
  apiMock: { listSkills: vi.fn() },
  runMock: vi.fn(),
}));
vi.mock("@/lib/useAiBlocked", () => ({ useAiBlocked: () => null }));
vi.mock("@/lib/api", () => ({
  api: apiMock,
  toApiError: (e: unknown) => ({ message: String(e) }),
}));
vi.mock("@/lib/skills", async (orig) => ({
  ...(await orig<typeof import("@/lib/skills")>()),
  runSkillOn: runMock,
}));

import { ContextMenu, ContextMenuContent, ContextMenuTrigger } from "@/components/ui/context-menu";
import { SkillsSubmenu } from "./SkillsSubmenu";

function menu(targets: { path: string; isDir: boolean }[]) {
  render(
    <ContextMenu>
      <ContextMenuTrigger>
        <div>target</div>
      </ContextMenuTrigger>
      <ContextMenuContent>
        <SkillsSubmenu targets={targets} />
      </ContextMenuContent>
    </ContextMenu>,
  );
  fireEvent.contextMenu(screen.getByText("target"));
}

describe("SkillsSubmenu", () => {
  beforeEach(() => {
    runMock.mockReset();
    apiMock.listSkills
      .mockReset()
      .mockResolvedValue([
        mk("a", "For notes", "note"),
        mk("b", "For folders", "folder"),
        mk("c", "For both", "both"),
      ]);
  });

  it("lists only the skills that fit a note, and runs one on it", async () => {
    menu([{ path: "N/A.md", isDir: false }]);
    const user = userEvent.setup();
    await user.click(await screen.findByText("AI"));
    expect(await screen.findByText("For notes")).toBeInTheDocument();
    expect(screen.getByText("For both")).toBeInTheDocument();
    expect(screen.queryByText("For folders")).toBeNull();
    fireEvent.click(screen.getByText("For notes"));
    expect(runMock).toHaveBeenCalledWith(expect.objectContaining({ id: "a" }), ["N/A.md"]);
  });

  it("leaves out skills made in older versions", async () => {
    apiMock.listSkills.mockResolvedValue([
      mk("a", "For notes", "note"),
      { ...mk("u", "My old skill", "note"), builtin: false },
    ]);
    menu([{ path: "N/A.md", isDir: false }]);
    await userEvent.setup().click(await screen.findByText("AI"));
    expect(await screen.findByText("For notes")).toBeInTheDocument();
    expect(screen.queryByText("My old skill")).toBeNull();
  });

  it("lists the folder skills for a folder", async () => {
    menu([{ path: "N", isDir: true }]);
    const user = userEvent.setup();
    await user.click(await screen.findByText("AI"));
    expect(await screen.findByText("For folders")).toBeInTheDocument();
    expect(screen.queryByText("For notes")).toBeNull();
  });
});
