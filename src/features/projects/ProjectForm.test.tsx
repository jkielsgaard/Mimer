import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { Settings } from "@/bindings/Settings";

vi.mock("@/lib/api", () => ({ api: {}, toApiError: (e: unknown) => ({ message: String(e) }) }));

import { ProjectForm } from "./ProjectForm";
import { useVaultStore } from "@/stores/vaultStore";
import { DEFAULT_BUILTIN } from "@/test/builtinDefaults";

const settings: Settings = {
  schemaVersion: 1,
  recentVaults: [],
  lastVault: null,
  theme: "system",
  editor: {
    fontSize: 15,
    lineWidth: 760,
    spellcheck: true,
    recentNotes: 4,
    aiSpelling: false,
    traceWork: false,
    ownWords: [],
  },
  git: { authorName: "M", authorEmail: "m@l", idleCommitMinutes: 5 },
  ai: {
    defaultProviderId: "lm",
    checkAnswers: false,
    cloudConsent: null,
    builtin: DEFAULT_BUILTIN,
    foundry: { model: "", tools: true },
    answerLanguage: "",
    globalInstructions: "",
    embeddings: { enabled: false, providerId: "lm", model: "" },
    providers: [
      {
        id: "lm",
        kind: "lmstudio",
        name: "LM Studio",
        baseUrl: "http://localhost:1234/v1",
        model: "",
        location: "local",
        supportsTools: true,
        contextTokens: 8000,
      },
      {
        id: "claude",
        kind: "anthropic",
        name: "Claude",
        baseUrl: "https://api.anthropic.com",
        model: "",
        location: "cloud",
        supportsTools: true,
        contextTokens: 8000,
      },
    ],
  },
};

describe("ProjectForm", () => {
  it("has a Local AI only choice (off) and offers local providers only", () => {
    render(<ProjectForm state={{ folder: "Work", project: null }} settings={settings} />);
    expect(screen.getByRole("checkbox", { name: /Local AI only/ })).not.toBeChecked();
    const options = screen.getByLabelText("AI provider").querySelectorAll("option");
    expect([...options].map((o) => o.textContent)).toEqual([
      "Use global default (LM Studio)",
      "LM Studio",
    ]);
  });

  it("has About this project and no Ask AI box for the text", () => {
    render(<ProjectForm state={{ folder: "Work", project: null }} settings={settings} />);
    expect(screen.getByLabelText("About this project")).toBeInTheDocument();
    expect(screen.queryByLabelText("Ask AI to change the instructions")).toBeNull();
  });

  it("falls back to the default when an old project points at a cloud provider", () => {
    render(
      <ProjectForm
        state={{
          folder: "Work",
          project: {
            schemaVersion: 1,
            id: "p",
            name: "Work",
            folder: "Work",
            instructions: "",
            providerId: "claude",
            localOnly: false,
            createdAt: "",
            updatedAt: "",
          },
        }}
        settings={settings}
      />,
    );
    expect(screen.getByRole<HTMLSelectElement>("combobox", { name: "AI provider" }).value).toBe(
      "__global__",
    );
  });

  it("a new project is a new folder in the vault root: a name already used there is refused", () => {
    useVaultStore.setState({
      tree: [{ name: "Test", path: "Test", isDir: true, children: [], modified: 0 }],
      projects: [],
    });
    render(<ProjectForm state={{ folder: "", project: null }} settings={settings} />);
    expect(screen.getByRole("heading", { name: "New project" })).toBeInTheDocument();
    expect(screen.getByText(/cannot be made from an existing folder/)).toBeInTheDocument();
    const box = screen.getByLabelText("Name");
    fireEvent.change(box, { target: { value: "test" } });
    expect(screen.getByRole("alert")).toHaveTextContent(
      "A folder called “Test” already exists in the vault root.",
    );
    expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();
    fireEvent.change(box, { target: { value: "Fresh" } });
    expect(screen.queryByRole("alert")).toBeNull();
    expect(screen.getByRole("button", { name: "Save" })).toBeEnabled();
  });
});
