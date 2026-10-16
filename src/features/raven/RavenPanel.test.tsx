import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Settings } from "@/bindings/Settings";

const api = vi.hoisted(() => ({
  ravenChat: vi.fn(),
  aiCancel: vi.fn(),
  createNote: vi.fn(),
  writeNote: vi.fn(),
}));
vi.mock("@/lib/api", () => ({ api, toApiError: (e: unknown) => ({ message: String(e) }) }));

import { RavenPanel } from "./RavenPanel";
import { useRavenStore } from "@/stores/ravenStore";
import { useSettingsStore } from "@/stores/settingsStore";
import { useVaultStore } from "@/stores/vaultStore";
import { DEFAULT_BUILTIN } from "@/test/builtinDefaults";

function settings(): Settings {
  return {
    schemaVersion: 1,
    recentVaults: [],
    lastVault: null,
    theme: "system",
    editor: { fontSize: 15, lineWidth: 760, spellcheck: true, recentNotes: 4 },
    git: { authorName: "M", authorEmail: "m@l", idleCommitMinutes: 5 },
    ai: {
      defaultProviderId: "lm",
      ravenProviderId: "claude",
      builtin: DEFAULT_BUILTIN,
      foundry: { model: "" },
      baseInstruction: "",
      allowOwnKnowledge: false,
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
          model: "claude-x",
          location: "cloud",
          supportsTools: false,
          contextTokens: 100000,
        },
      ],
    },
  };
}

describe("RavenPanel", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    useRavenStore.setState({ messages: [], streaming: false, taskId: null, draft: "" });
    useSettingsStore.setState({ settings: settings() });
    useVaultStore.setState({ files: [], tree: [], activePath: null, selectedPath: null });
    api.ravenChat.mockResolvedValue("task-1");
  });

  it("says at the top that it is cloud AI without access to notes, and names the provider", () => {
    render(<RavenPanel />);
    expect(screen.getByTestId("privacy-note")).toHaveTextContent(
      "Cloud AI · no access to your notes",
    );
    expect(screen.getByTestId("privacy-note")).toHaveTextContent("sent to Claude");
  });

  it("shows the first-use notice once and blocks sending until it is accepted", async () => {
    const user = userEvent.setup();
    const { unmount } = render(<RavenPanel />);
    expect(screen.getByTestId("raven-notice")).toBeInTheDocument();
    expect(screen.getByLabelText("Message Raven")).toBeDisabled();
    await user.click(screen.getByRole("button", { name: "I understand" }));
    expect(screen.queryByTestId("raven-notice")).toBeNull();
    expect(screen.getByLabelText("Message Raven")).toBeEnabled();
    unmount();
    render(<RavenPanel />);
    expect(screen.queryByTestId("raven-notice")).toBeNull();
  });

  it("has no note attachment, mention picker or include-current-note switch", () => {
    localStorage.setItem("mimer.raven.noticeSeen", "1");
    render(<RavenPanel />);
    expect(screen.queryByLabelText(/attach/i)).toBeNull();
    expect(screen.queryByText(/include current note/i)).toBeNull();
  });

  it("sends the typed message with Enter and nothing else", async () => {
    localStorage.setItem("mimer.raven.noticeSeen", "1");
    render(<RavenPanel />);
    await userEvent.setup().type(screen.getByLabelText("Message Raven"), "Who is Odin?{Enter}");
    expect(api.ravenChat).toHaveBeenCalledTimes(1);
    const request = api.ravenChat.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(Object.keys(request)).toEqual(["messages"]);
  });

  it("saves an answer as a note marked needs review", async () => {
    localStorage.setItem("mimer.raven.noticeSeen", "1");
    api.createNote.mockResolvedValue("Ravens.md");
    api.writeNote.mockResolvedValue(undefined);
    const refreshTree = vi.fn().mockResolvedValue(undefined);
    const openNote = vi.fn().mockResolvedValue(undefined);
    useVaultStore.setState({ refreshTree, openNote });
    useRavenStore.setState({
      messages: [
        { id: 1, role: "user", content: "Tell me about ravens", error: null },
        { id: 2, role: "assistant", content: "## Ravens\nHugin and Munin.", error: null },
      ],
    });
    const user = userEvent.setup();
    render(<RavenPanel />);
    await user.click(screen.getByRole("button", { name: /Save as note/ }));
    await user.click(screen.getAllByRole("button", { name: "Save as note" }).at(-1) as HTMLElement);
    await waitFor(() => {
      expect(api.writeNote).toHaveBeenCalled();
    });
    const content = api.writeNote.mock.calls[0]?.[1] as string;
    expect(content).toContain("source: raven");
    expect(content).toContain("status: needs review");
    expect(content).toContain("title: Ravens");
  });
});
