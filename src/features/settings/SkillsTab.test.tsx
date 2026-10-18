import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Skill } from "@/bindings/Skill";

const builtin: Skill = {
  id: "builtin:fix-spelling",
  name: "Fix spelling and grammar",
  description: "Only the wrong words are changed",
  kind: "fix",
  appliesTo: "both",
  instruction: "Fix spelling and grammar.",
  builtin: true,
};
const { apiMock } = vi.hoisted(() => ({
  apiMock: {
    listSkills: vi.fn(),
    saveSkill: vi.fn(),
    removeSkill: vi.fn(),
    previewSkill: vi.fn(),
  },
}));
vi.mock("@/lib/api", () => ({
  api: apiMock,
  toApiError: (e: unknown) => ({ message: String(e) }),
}));
vi.mock("@/components/DiffView", () => ({
  DiffView: ({ original, modified }: { original: string; modified: string }) => (
    <pre data-testid="diff">{`${original} => ${modified}`}</pre>
  ),
}));

import { SkillsTab } from "./SkillsTab";
import { nameFrom } from "./skillGoals";
import { useUiStore } from "@/stores/uiStore";
import { useVaultStore } from "@/stores/vaultStore";

describe("SkillsTab", () => {
  beforeEach(() => {
    apiMock.listSkills.mockReset().mockResolvedValue([builtin]);
    apiMock.saveSkill.mockReset();
    apiMock.removeSkill.mockReset();
    apiMock.previewSkill.mockReset();
    useVaultStore.setState({ files: ["Work/A.md"], activePath: "Work/A.md" });
    useUiStore.setState({ skillsFocus: null });
  });

  it("shows a built-in skill read-only, lets you try it, and copy it", async () => {
    apiMock.previewSkill.mockResolvedValue({
      before: "teh text",
      after: "the text",
      checks: [{ label: "Nothing left out", ok: true, detail: null }],
      note: null,
    });
    render(<SkillsTab />);
    const user = userEvent.setup();
    await user.click(await screen.findByText("Fix spelling and grammar"));
    expect(screen.getByTestId("skill-builtin-note")).toBeInTheDocument();
    expect(screen.getByText("Fix small mistakes")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Try it" }));
    expect(await screen.findByTestId("diff")).toHaveTextContent("teh text => the text");
    expect(apiMock.previewSkill).toHaveBeenCalledWith(
      expect.objectContaining({ id: "builtin:fix-spelling" }),
      "Work/A.md",
    );
    await user.click(screen.getByRole("button", { name: /Copy to a new skill/ }));
    expect(screen.getByLabelText(/Say it in your own words/)).toHaveValue(
      "Fix spelling and grammar.",
    );
  });

  it("makes a new skill in two steps: describe it, try it, save it", async () => {
    const saved: Skill = {
      id: "u1",
      name: "Translate my meeting notes to",
      description: "",
      kind: "rewrite",
      appliesTo: "both",
      instruction: "Translate my meeting notes to English. Keep the names.",
      builtin: false,
    };
    apiMock.saveSkill.mockResolvedValue(saved);
    apiMock.previewSkill.mockResolvedValue({
      before: "Møde med Acme",
      after: "Meeting with Acme",
      checks: [
        { label: "Names kept", ok: true, detail: null },
        { label: "Numbers and dates kept", ok: false, detail: "Changed or missing: 31" },
      ],
      note: null,
    });
    apiMock.listSkills.mockResolvedValueOnce([builtin]).mockResolvedValue([builtin, saved]);
    render(<SkillsTab />);
    const user = userEvent.setup();
    await user.click(await screen.findByRole("button", { name: /Add a skill/ }));
    const next = screen.getByRole("button", { name: "Next: try it on a note" });
    expect(next).toBeDisabled();
    await user.type(
      screen.getByLabelText(/Say it in your own words/),
      "Translate my meeting notes to English. Keep the names.",
    );
    await user.click(screen.getByRole("radio", { name: /Change the text in each note/ }));
    await user.click(next);

    expect(screen.getByText("Step 2 of 2")).toBeInTheDocument();
    expect(screen.getByLabelText("Name")).toHaveValue("Translate my meeting notes to English");
    await user.click(screen.getByRole("button", { name: "Try it" }));
    expect(await screen.findByTestId("diff")).toHaveTextContent("Meeting with Acme");
    expect(screen.getByText(/Changed or missing: 31/)).toBeInTheDocument();
    expect(screen.getByText(/only a test/)).toBeInTheDocument();
    expect(apiMock.saveSkill).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: "Save the skill" }));
    await waitFor(() => {
      expect(apiMock.saveSkill).toHaveBeenCalledWith(
        expect.objectContaining({
          kind: "rewrite",
          appliesTo: "both",
          instruction: "Translate my meeting notes to English. Keep the names.",
        }),
      );
    });
  });

  it("offers a sorting skill for folders unless you choose otherwise", async () => {
    apiMock.saveSkill.mockImplementation((s: Skill) => Promise.resolve({ ...s, id: "u2" }));
    render(<SkillsTab />);
    const user = userEvent.setup();
    await user.click(await screen.findByRole("button", { name: /Add a skill/ }));
    await user.type(screen.getByLabelText(/Say it in your own words/), "Sort by customer.");
    await user.click(screen.getByRole("radio", { name: /Move the notes into folders/ }));
    await user.click(screen.getByRole("button", { name: "Next: try it on a note" }));
    expect(screen.getByLabelText("Offer it when I right-click")).toHaveValue("folder");
    await user.click(screen.getByRole("button", { name: "Save the skill" }));
    await waitFor(() => {
      expect(apiMock.saveSkill).toHaveBeenCalledWith(
        expect.objectContaining({ kind: "sort", appliesTo: "folder" }),
      );
    });
  });

  it("removes one of your own skills after asking", async () => {
    const mine: Skill = { ...builtin, id: "u1", name: "Mine", builtin: false };
    apiMock.listSkills.mockResolvedValue([builtin, mine]);
    apiMock.removeSkill.mockResolvedValue(undefined);
    render(<SkillsTab />);
    const user = userEvent.setup();
    await user.click(await screen.findByText("Mine"));
    await user.click(screen.getByRole("button", { name: /Remove/ }));
    await user.click(await screen.findByRole("button", { name: "Remove" }));
    await waitFor(() => {
      expect(apiMock.removeSkill).toHaveBeenCalledWith("u1");
    });
  });

  it("groups the built-in skills and searches them", async () => {
    const sort: Skill = { ...builtin, id: "builtin:sort", name: "Sort into folders", kind: "sort" };
    const chat: Skill = {
      ...builtin,
      id: "builtin:explain",
      name: "Explain these notes",
      kind: "answer",
    };
    apiMock.listSkills.mockResolvedValue([builtin, sort, chat]);
    render(<SkillsTab />);
    const user = userEvent.setup();
    expect(
      await screen.findByRole("region", { name: "Fix small mistakes · built in" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("region", { name: "Move into folders · built in" }),
    ).toBeInTheDocument();
    await user.type(screen.getByLabelText("Search skills"), "explain");
    expect(screen.queryByText("Sort into folders")).toBeNull();
    expect(screen.getByText("Explain these notes")).toBeInTheDocument();
  });

  it("opens with the skill asked for, for example from a trial in the chat", async () => {
    useUiStore.setState({ skillsFocus: "builtin:fix-spelling" });
    render(<SkillsTab />);
    expect(await screen.findByTestId("skill-builtin-note")).toBeInTheDocument();
    expect(useUiStore.getState().skillsFocus).toBeNull();
  });
});

describe("nameFrom", () => {
  it("takes the first words of the first sentence, at most 40 characters", () => {
    expect(nameFrom("translate to English. Keep names.")).toBe("Translate to English");
    expect(nameFrom("")).toBe("");
    expect(nameFrom("one two three four five six seven eight nine ten eleven").length).toBeLessThan(
      41,
    );
  });
});
