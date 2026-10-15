import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { Settings } from "@/bindings/Settings";

vi.mock("@/lib/api", () => ({ api: {}, toApiError: (e: unknown) => ({ message: String(e) }) }));
vi.mock("@/stores/embeddingStore", () => ({
  useEmbeddingStore: (selector: (s: unknown) => unknown) =>
    selector({ status: null, start: vi.fn(), cancel: vi.fn() }),
}));

import { SemanticSearchSettings } from "./SemanticSearchSettings";

function settings(
  providerLocation: "local" | "cloud",
  kind: "lmstudio" | "anthropic" | "openai_compatible" = "lmstudio",
): Settings {
  return {
    schemaVersion: 1,
    recentVaults: [],
    lastVault: null,
    theme: "system",
    editor: { fontSize: 15, lineWidth: 760, spellcheck: true, recentNotes: 4 },
    git: { authorName: "M", authorEmail: "m@l", idleCommitMinutes: 5 },
    ai: {
      defaultProviderId: "p1",
      baseInstruction: "",
      allowOwnKnowledge: false,
      globalInstructions: "",
      embeddings: { enabled: true, providerId: "p1", model: "" },
      providers: [
        {
          id: "p1",
          kind,
          name: "Provider",
          baseUrl: "https://x",
          model: "",
          location: providerLocation,
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
}

describe("SemanticSearchSettings", () => {
  it("warns when the embedding provider is a cloud service", () => {
    render(
      <SemanticSearchSettings
        draft={settings("cloud", "openai_compatible")}
        onChange={vi.fn()}
        persist={vi.fn()}
      />,
    );
    expect(screen.getByRole("note")).toHaveTextContent(/sent to this provider/);
  });

  it("does not offer Anthropic, which has no embeddings endpoint", () => {
    render(
      <SemanticSearchSettings draft={settings("local")} onChange={vi.fn()} persist={vi.fn()} />,
    );
    expect(screen.queryByRole("option", { name: /Claude/ })).toBeNull();
  });

  it("toggling the checkbox updates the draft", async () => {
    const onChange = vi.fn();
    render(
      <SemanticSearchSettings draft={settings("local")} onChange={onChange} persist={vi.fn()} />,
    );
    await userEvent.setup().click(screen.getByLabelText("Enable semantic search"));
    const next = onChange.mock.calls[0]?.[0] as Settings | undefined;
    expect(next?.ai.embeddings.enabled).toBe(false);
  });
});
