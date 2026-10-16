import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Settings } from "@/bindings/Settings";

const api = vi.hoisted(() => ({ getDefaultBaseInstruction: vi.fn() }));
vi.mock("@/lib/api", () => ({ api, toApiError: (e: unknown) => ({ message: String(e) }) }));

import { MimerInstructionSettings } from "./MimerInstructionSettings";
import { DEFAULT_BUILTIN } from "@/test/builtinDefaults";

const DEFAULT_TEXT = "You are Mimer, a notes AI.";

function settings(baseInstruction: string): Settings {
  return {
    schemaVersion: 1,
    recentVaults: [],
    lastVault: null,
    theme: "system",
    editor: { fontSize: 15, lineWidth: 760, spellcheck: true, recentNotes: 4 },
    git: { authorName: "M", authorEmail: "m@l", idleCommitMinutes: 5 },
    ai: {
      defaultProviderId: "p1",
      ravenProviderId: null,
      builtin: DEFAULT_BUILTIN,
      foundry: { model: "" },
      baseInstruction,
      allowOwnKnowledge: false,
      globalInstructions: "",
      embeddings: { enabled: false, providerId: "p1", model: "" },
      providers: [],
    },
  };
}

describe("MimerInstructionSettings", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    api.getDefaultBaseInstruction.mockResolvedValue(DEFAULT_TEXT);
  });

  it("shows the built-in default when nothing custom is stored", async () => {
    render(<MimerInstructionSettings draft={settings("")} onChange={vi.fn()} />);
    await waitFor(() => {
      expect(screen.getByLabelText("Mimer's base instruction")).toHaveValue(DEFAULT_TEXT);
    });
    expect(screen.getByRole("button", { name: "Reset to default" })).toBeDisabled();
  });

  it("stores the user's own text", async () => {
    const onChange = vi.fn();
    render(<MimerInstructionSettings draft={settings("Custom")} onChange={onChange} />);
    const box = screen.getByLabelText("Mimer's base instruction");
    expect(box).toHaveValue("Custom");
    await userEvent.setup().type(box, "!");
    expect(onChange).toHaveBeenLastCalledWith(
      expect.objectContaining({ ai: expect.objectContaining({ baseInstruction: "Custom!" }) }),
    );
  });

  it("stores nothing when the text equals the default, so future defaults still apply", async () => {
    const onChange = vi.fn();
    render(<MimerInstructionSettings draft={settings(`${DEFAULT_TEXT}x`)} onChange={onChange} />);
    await waitFor(() => {
      expect(api.getDefaultBaseInstruction).toHaveBeenCalled();
    });
    const box = screen.getByLabelText("Mimer's base instruction");
    await userEvent.setup().type(box, "{Backspace}");
    await waitFor(() => {
      expect(onChange).toHaveBeenLastCalledWith(
        expect.objectContaining({ ai: expect.objectContaining({ baseInstruction: "" }) }),
      );
    });
  });

  it("reset to default clears the custom text", async () => {
    const onChange = vi.fn();
    render(<MimerInstructionSettings draft={settings("Custom")} onChange={onChange} />);
    await userEvent.setup().click(screen.getByRole("button", { name: "Reset to default" }));
    expect(onChange).toHaveBeenLastCalledWith(
      expect.objectContaining({ ai: expect.objectContaining({ baseInstruction: "" }) }),
    );
  });
});
