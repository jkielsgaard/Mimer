import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const api = vi.hoisted(() => ({
  buildResearchPrompt: vi.fn(),
  createNote: vi.fn(),
  writeNote: vi.fn(),
}));
vi.mock("@/lib/api", () => ({ api, toApiError: (e: unknown) => ({ message: String(e) }) }));

import { useUiStore } from "@/stores/uiStore";
import { useVaultStore } from "@/stores/vaultStore";
import { ImportAnswerDialog } from "./ImportAnswerDialog";
import { ResearchDialog } from "./ResearchDialog";

describe("ResearchDialog", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useUiStore.setState({ researchOpen: true, importAnswerOpen: false });
    api.buildResearchPrompt.mockResolvedValue("THE PROMPT");
  });

  it("needs a topic, then shows the prompt Mimer built", async () => {
    render(<ResearchDialog />);
    const user = userEvent.setup();
    const write = screen.getByRole("button", { name: "Write the prompt" });
    expect(write).toBeDisabled();
    await user.type(screen.getByPlaceholderText(/Zero trust/), "Zero trust");
    await user.click(write);
    expect(api.buildResearchPrompt).toHaveBeenCalledWith(
      expect.objectContaining({ topic: "Zero trust", kind: "documentation", depth: "detailed" }),
    );
    expect(await screen.findByLabelText("The research prompt")).toHaveValue("THE PROMPT");
  });
});

describe("ImportAnswerDialog", () => {
  const answer = `---\ntitle: Zero trust\nstatus: verified\n---\n# Zero trust\n\n## Summary\n${"Text. ".repeat(50)}\n\n## Sources\n- [NIST](https://nist.gov) - x\n`;

  beforeEach(() => {
    vi.clearAllMocks();
    useUiStore.setState({ researchOpen: false, importAnswerOpen: true });
    useVaultStore.setState({
      files: ["Research/Zero trust.md"],
      selectedPath: "Research",
      activePath: null,
      refreshTree: vi.fn().mockResolvedValue(undefined),
      openNote: vi.fn().mockResolvedValue(undefined),
    });
    api.createNote.mockResolvedValue("Research/Zero trust 2.md");
    api.writeNote.mockResolvedValue(undefined);
  });

  it("saves the pasted answer as a new note marked needs review, never over an existing one", async () => {
    render(<ImportAnswerDialog />);
    const user = userEvent.setup();
    expect(screen.getByRole("button", { name: "Save as note" })).toBeDisabled();
    await user.click(screen.getByLabelText("The answer"));
    await user.paste(answer);
    expect(screen.getByLabelText("Note title")).toHaveValue("Zero trust");
    await user.click(screen.getByRole("button", { name: "Save as note" }));
    expect(api.createNote).toHaveBeenCalledWith("Research", "Zero trust 2");
    const written = api.writeNote.mock.calls[0]?.[1] as string;
    expect(written).toContain("status: needs review");
    expect(written).not.toContain("verified");
  });
});
