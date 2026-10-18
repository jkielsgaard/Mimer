import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Skill } from "@/bindings/Skill";

const skills: Skill[] = [
  {
    id: "builtin:fix-spelling",
    name: "Fix spelling and grammar",
    description: "Correct the text",
    kind: "rewrite",
    appliesTo: "both",
    instruction: "Fix it.",
    builtin: true,
  },
  {
    id: "u1",
    name: "My skill",
    description: "Mine",
    kind: "sort",
    appliesTo: "folder",
    instruction: "Sort.",
    builtin: false,
  },
];
const { apiMock } = vi.hoisted(() => ({ apiMock: { listSkills: vi.fn() } }));
vi.mock("@/lib/api", () => ({
  api: apiMock,
  toApiError: (e: unknown) => ({ message: String(e) }),
}));

import { useChatStore } from "@/stores/chatStore";
import { useUiStore } from "@/stores/uiStore";
import { SkillsMenu } from "./SkillsMenu";

describe("SkillsMenu", () => {
  beforeEach(() => {
    apiMock.listSkills.mockResolvedValue(skills);
    useUiStore.setState({ researchOpen: false, importAnswerOpen: false, settingsOpen: false });
    useChatStore.setState({ draftSkill: null });
  });

  it("lists the skills and chooses one for the next message", async () => {
    const onChosen = vi.fn();
    render(<SkillsMenu onChosen={onChosen} />);
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Skills for Mimer" }));
    expect(await screen.findByText("My skill")).toBeInTheDocument();
    await user.click(screen.getByText("Fix spelling and grammar"));
    expect(useChatStore.getState().draftSkill?.id).toBe("builtin:fix-spelling");
    expect(onChosen).toHaveBeenCalled();
  });

  it("opens the Skills settings, the research prompt and the import dialog", async () => {
    render(<SkillsMenu />);
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Skills for Mimer" }));
    await user.click(await screen.findByText("Manage skills…"));
    expect(useUiStore.getState().settingsOpen).toBe(true);
    expect(useUiStore.getState().settingsTab).toBe("skills");
    await user.click(screen.getByRole("button", { name: "Skills for Mimer" }));
    await user.click(await screen.findByText("Write a research prompt…"));
    expect(useUiStore.getState().researchOpen).toBe(true);
    await user.click(screen.getByRole("button", { name: "Skills for Mimer" }));
    await user.click(await screen.findByText("Import an answer from a cloud AI…"));
    expect(useUiStore.getState().importAnswerOpen).toBe(true);
  });
});
