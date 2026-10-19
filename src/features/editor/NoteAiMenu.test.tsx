import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const blocked = vi.hoisted(() => ({ reason: null as string | null }));
vi.mock("@/lib/useAiBlocked", () => ({ useAiBlocked: () => blocked.reason }));
const apiMock = vi.hoisted(() => ({ listSkills: vi.fn() }));
vi.mock("@/lib/api", () => ({ api: apiMock, toApiError: (e: unknown) => e }));
const skills = vi.hoisted(() => ({ runSkillOn: vi.fn(), skillFits: () => true }));
vi.mock("@/lib/skills", () => skills);

import { useUiStore } from "@/stores/uiStore";
import { NoteAiMenu } from "./NoteAiMenu";

const builtin = (id: string) => ({
  id: `builtin:${id}`,
  name: id,
  description: "",
  kind: "rewrite",
  appliesTo: "note",
  instruction: "",
  builtin: true,
});

describe("NoteAiMenu", () => {
  beforeEach(() => {
    blocked.reason = null;
    skills.runSkillOn.mockReset();
    apiMock.listSkills.mockResolvedValue([
      builtin("summary-at-top"),
      builtin("fix-spelling"),
      { ...builtin("mine"), id: "u1", name: "My own skill", builtin: false },
    ]);
    useUiStore.setState({ rightTab: "outline", rightCollapsed: true });
  });

  it("runs a fixed skill on the note, and leaves out skills made in older versions", async () => {
    render(<NoteAiMenu path="Guide.md" />);
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: /AI/ }));
    await user.click(await screen.findByText("Short summary at the top"));
    expect(skills.runSkillOn).toHaveBeenCalledWith(
      expect.objectContaining({ id: "builtin:summary-at-top" }),
      ["Guide.md"],
    );
    expect(screen.queryByText("My own skill")).toBeNull();
  });

  it("says why without an AI, and still opens the related notes", async () => {
    blocked.reason = "No AI is set up.";
    render(<NoteAiMenu path="Guide.md" />);
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: /AI/ }));
    expect(await screen.findByRole("note")).toHaveTextContent("No AI is set up.");
    expect(screen.getByRole("menuitem", { name: /Short summary at the top/ })).toHaveAttribute(
      "data-disabled",
    );
    await user.click(screen.getByRole("menuitem", { name: /Link related notes/ }));
    expect(useUiStore.getState().rightTab).toBe("links");
    expect(useUiStore.getState().rightCollapsed).toBe(false);
  });
});
