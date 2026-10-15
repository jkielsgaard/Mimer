import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { EmbeddingStatus } from "@/bindings/EmbeddingStatus";

const api = vi.hoisted(() => ({
  search: vi.fn(),
  semanticSearch: vi.fn(),
  hybridSearch: vi.fn(),
  allTags: vi.fn(),
}));
vi.mock("@/lib/api", () => ({ api, toApiError: (e: unknown) => ({ message: String(e) }) }));
vi.mock("@/lib/actions", () => ({ openFile: vi.fn() }));

import { SearchPanel } from "./SearchPanel";
import { useEmbeddingStore } from "@/stores/embeddingStore";

const readyStatus: EmbeddingStatus = {
  enabled: true,
  state: "idle",
  notesDone: 3,
  notesTotal: 3,
  notes: 3,
  chunks: 12,
  model: "test-model",
  lastError: null,
};

const keywordHit = { path: "Security/Firewall.md", title: "Firewall", snippet: "" };
const meaningHit = { path: "Security/Policy.md", title: "Policy", snippet: "" };

function typeQuery(text: string): Promise<void> {
  return userEvent.setup().type(screen.getByLabelText("Search notes"), text);
}

describe("SearchPanel", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    api.allTags.mockResolvedValue([]);
    api.search.mockResolvedValue([keywordHit]);
    api.semanticSearch.mockResolvedValue([{ ...meaningHit, score: 0.9 }]);
    api.hybridSearch.mockResolvedValue([meaningHit]);
    useEmbeddingStore.setState({ status: null });
  });

  it("uses keyword search and hides the mode switch when semantic search is off", async () => {
    render(<SearchPanel />);
    expect(screen.queryByRole("radiogroup", { name: "Search mode" })).toBeNull();
    await typeQuery("firewall");
    await screen.findByText("Firewall");
    expect(api.search).toHaveBeenLastCalledWith({ text: "firewall", tag: null, folder: null });
    expect(api.semanticSearch).not.toHaveBeenCalled();
  });

  it("meaning mode uses embeddings once the index has chunks", async () => {
    useEmbeddingStore.setState({ status: readyStatus });
    render(<SearchPanel />);
    await userEvent.setup().click(screen.getByRole("radio", { name: "Meaning" }));
    await typeQuery("data protection");
    await screen.findByText("Policy");
    expect(api.semanticSearch).toHaveBeenCalledWith("data protection");
  });

  it("both mode uses hybrid search", async () => {
    useEmbeddingStore.setState({ status: readyStatus });
    render(<SearchPanel />);
    await userEvent.setup().click(screen.getByRole("radio", { name: "Both" }));
    await typeQuery("backup");
    await screen.findByText("Policy");
    expect(api.hybridSearch).toHaveBeenCalledWith("backup");
  });

  it("tag and path filters always use keyword search, whatever the mode", async () => {
    useEmbeddingStore.setState({ status: readyStatus });
    render(<SearchPanel />);
    await userEvent.setup().click(screen.getByRole("radio", { name: "Meaning" }));
    await typeQuery("tag:security");
    await screen.findByText("Firewall");
    expect(api.search).toHaveBeenCalledWith({ text: "tag:security", tag: null, folder: null });
    expect(api.semanticSearch).not.toHaveBeenCalled();
  });

  it("falls back to keyword results and says so when semantic search fails", async () => {
    useEmbeddingStore.setState({ status: readyStatus });
    api.semanticSearch.mockRejectedValue(new Error("model server is off"));
    render(<SearchPanel />);
    await userEvent.setup().click(screen.getByRole("radio", { name: "Meaning" }));
    await typeQuery("encryption");
    const notice = await screen.findByRole("status");
    expect(notice.textContent).toContain("Semantic search is unavailable");
    await screen.findByText("Firewall");
    await waitFor(() => {
      expect(api.search).toHaveBeenCalledWith({ text: "encryption", tag: null, folder: null });
    });
  });
});
