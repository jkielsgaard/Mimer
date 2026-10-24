import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Settings } from "@/bindings/Settings";
import { DEFAULT_BUILTIN } from "@/test/builtinDefaults";

const settings: Settings = {
  schemaVersion: 1,
  recentVaults: ["/home/me/Notes"],
  lastVault: null,
  theme: "light",
  editor: {
    fontSize: 15,
    lineWidth: 760,
    spellcheck: true,
    recentNotes: 4,
    aiSpelling: false,
    traceWork: false,
    ownWords: [],
  },
  git: { authorName: "Mimer", authorEmail: "mdvault@localhost", idleCommitMinutes: 5 },
  ai: {
    defaultProviderId: "lmstudio-default",
    checkAnswers: false,
    cloudConsent: null,
    builtin: DEFAULT_BUILTIN,
    foundry: { model: "", tools: true },
    baseInstruction: "",
    globalInstructions: "",
    embeddings: { enabled: false, providerId: "lmstudio-default", model: "" },
    providers: [
      {
        id: "lmstudio-default",
        kind: "lmstudio",
        name: "LM Studio",
        baseUrl: "http://localhost:1234/v1",
        model: "qwen",
        location: "local",
        supportsTools: true,
        contextTokens: 16000,
      },
    ],
  },
};

const tree = [
  {
    name: "Work",
    path: "Work",
    isDir: true,
    children: [{ name: "Plan.md", path: "Work/Plan.md", isDir: false, children: [] }],
  },
  { name: "Home.md", path: "Home.md", isDir: false, children: [] },
];

const apiMock = vi.hoisted(() => ({
  getSettings: vi.fn(),
  missingVaults: vi.fn().mockResolvedValue([]),
  openVault: vi.fn(),
  getTree: vi.fn(),
  listProjects: vi.fn(),
  readNote: vi.fn(),
  writeNote: vi.fn(),
  commitNow: vi.fn(),
  allTags: vi.fn(),
  backlinks: vi.fn(),
  fileHistory: vi.fn(),
  hasApiKey: vi.fn(),
  getProposals: vi.fn(),
  listTasks: vi.fn().mockResolvedValue([]),
  listEpics: vi.fn().mockResolvedValue([]),
  listIdeas: vi.fn().mockResolvedValue([]),
  listDailyDates: vi.fn().mockResolvedValue([]),
  listSkills: vi.fn().mockResolvedValue([]),
  listChats: vi.fn().mockResolvedValue([]),
  saveChat: vi.fn().mockResolvedValue({}),
  listTemplates: vi.fn().mockResolvedValue([]),
  getEmbeddingStatus: vi.fn().mockResolvedValue({ enabled: false }),
  engineStatus: vi.fn().mockRejectedValue(new Error("not available in tests")),
  engineCatalog: vi.fn().mockRejectedValue(new Error("not available in tests")),
}));

vi.mock("@/lib/api", () => ({
  api: apiMock,
  toApiError: (e: unknown) => ({ message: String(e), code: "Unknown" }),
}));
vi.mock("@/lib/events", () => ({
  onFileChanged: vi.fn().mockResolvedValue(() => undefined),
  onIndexUpdated: vi.fn().mockResolvedValue(() => undefined),
  onCommitted: vi.fn().mockResolvedValue(() => undefined),
  onCloseRequested: vi.fn().mockResolvedValue(() => undefined),
  onEmbeddingStatus: vi.fn().mockResolvedValue(() => undefined),
  onFoundryStatus: vi.fn().mockResolvedValue(() => undefined),
  onEngineStatus: vi.fn().mockResolvedValue(() => undefined),
}));
vi.mock("@tauri-apps/api/window", () => ({
  getCurrentWindow: () => ({ setTitle: vi.fn().mockResolvedValue(undefined) }),
}));
vi.mock("@tauri-apps/api/core", () => ({
  convertFileSrc: (p: string) => `asset://${p}`,
  invoke: vi.fn(),
  Channel: vi.fn(),
}));
vi.mock("@tauri-apps/plugin-dialog", () => ({ open: vi.fn() }));

import { App } from "./App";
import { useChatStore } from "./stores/chatStore";
import { useEditorStore } from "./stores/editorStore";
import { useSettingsStore } from "./stores/settingsStore";
import { useVaultStore } from "./stores/vaultStore";
import { emptyLayout, useWorkspaceStore } from "./stores/workspaceStore";

describe("App smoke test", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.matchMedia = vi.fn().mockReturnValue({
      matches: false,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    });
    apiMock.getSettings.mockResolvedValue(settings);
    apiMock.openVault.mockResolvedValue({
      name: "Notes",
      path: "/home/me/Notes",
      config: { schemaVersion: 1, attachmentsFolder: "attachments", newNoteFolder: "" },
    });
    apiMock.getTree.mockResolvedValue(tree);
    apiMock.listProjects.mockResolvedValue([]);
    apiMock.readNote.mockResolvedValue({
      path: "Home.md",
      content: "# Home\n\nSome **bold** text with [[Plan]]\n",
      mtime: 1,
    });
    apiMock.writeNote.mockResolvedValue(undefined);
    apiMock.commitNow.mockResolvedValue(null);
    apiMock.allTags.mockResolvedValue([]);
    apiMock.backlinks.mockResolvedValue([]);
    apiMock.fileHistory.mockResolvedValue([]);
    apiMock.hasApiKey.mockResolvedValue(false);
    useSettingsStore.setState({ settings: null, error: null });
    // A test that opened a note saves the tabs of the vault; start without any, so the order and
    // speed of the tests do not decide which note is open.
    window.localStorage.clear();
    useWorkspaceStore.setState({ layout: emptyLayout() });
    useVaultStore.setState({
      vault: null,
      tree: [],
      files: [],
      projects: [],
      activePath: null,
      selectedPath: null,
    });
    useEditorStore.getState().reset();
    useChatStore.setState({ messages: [], streaming: false });
  });

  it("shows the welcome screen with recent vaults when no vault is open", async () => {
    render(<App />);
    expect(await screen.findByRole("button", { name: /Open folder as vault/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Create new vault/ })).toBeInTheDocument();
    expect(screen.getByText("/home/me/Notes")).toBeInTheDocument();
  });

  it("opens a recent vault into the three-column shell and opens a note", async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(await screen.findByText("/home/me/Notes"));
    expect(await screen.findByRole("tree", { name: "Files" })).toBeInTheDocument();
    expect(screen.getByTestId("save-status")).toHaveTextContent("Saved");
    // No chat column: the chat opens as a window from the right edge.
    expect(screen.queryByRole("tab", { name: "Mimer" })).toBeNull();
    expect(screen.getAllByText("LM Studio · qwen")).toHaveLength(1); // status bar
    await user.click(screen.getByRole("button", { name: "Ask about my notes" }));
    expect(
      await screen.findByRole("complementary", { name: "Ask about my notes" }),
    ).toBeInTheDocument();
    expect(screen.getAllByText("LM Studio · qwen")).toHaveLength(1);
    await user.click(screen.getByRole("button", { name: "Close the chat" }));

    await user.click(screen.getByTestId("tree-Home.md"));
    await waitFor(() => {
      expect(apiMock.readNote).toHaveBeenCalledWith("Home.md");
    });
    await waitFor(() => {
      expect(document.querySelector(".cm-content")?.textContent).toContain("Some bold text");
    });
    // Markers are hidden because the cursor is not on that line.
    expect(document.querySelector(".cm-content")?.textContent).not.toContain("**");
  });

  it("switches right-panel tabs", async () => {
    const user = userEvent.setup();
    render(<App />);
    // The whole app renders here, which can take longer than the default wait on a busy machine.
    const slow = { timeout: 10000 };
    await user.click(await screen.findByText("/home/me/Notes", undefined, slow));
    await user.click(await screen.findByRole("tab", { name: "History" }, slow));
    expect(
      await screen.findByText(/Open a note to see its history/, undefined, slow),
    ).toBeInTheDocument();
    expect(screen.queryByRole("tab", { name: "Backlinks" })).toBeNull();
  }, 20000);

  it("shows a blocking error when settings.json cannot be loaded", async () => {
    apiMock.getSettings.mockRejectedValue({ code: "Settings", message: "schema version 99" });
    render(<App />);
    expect(await screen.findByRole("alert")).toHaveTextContent(/Settings could not be loaded/);
  });
});

describe("editor without a note", () => {
  it("is read-only so typed text cannot be lost", async () => {
    window.matchMedia = vi
      .fn()
      .mockReturnValue({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() });
    apiMock.getSettings.mockResolvedValue(settings);
    apiMock.openVault.mockResolvedValue({
      name: "Notes",
      path: "/home/me/Notes",
      config: { schemaVersion: 1, attachmentsFolder: "attachments", newNoteFolder: "" },
    });
    apiMock.getTree.mockResolvedValue(tree);
    apiMock.listProjects.mockResolvedValue([]);
    useSettingsStore.setState({ settings: null, error: null });
    // Earlier tests save the open tabs of this vault; start without any so no note opens.
    window.localStorage.clear();
    useWorkspaceStore.setState({ layout: emptyLayout() });
    useVaultStore.setState({
      vault: null,
      tree: [],
      files: [],
      projects: [],
      activePath: null,
      selectedPath: null,
    });
    const user = userEvent.setup();
    render(<App />);
    await user.click(await screen.findByText("/home/me/Notes"));
    await screen.findByText("No note open");
    const content = document.querySelector<HTMLElement>(".cm-content");
    expect(content?.getAttribute("contenteditable")).toBe("false");
  });
});
