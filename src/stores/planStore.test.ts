import { beforeEach, describe, expect, it, vi } from "vitest";

const apiMock = vi.hoisted(() => ({
  taggedNotes: vi.fn(),
  readNote: vi.fn(),
  writeNote: vi.fn(),
  noteSetTag: vi.fn(),
}));
vi.mock("@/lib/api", () => ({
  api: apiMock,
  toApiError: (e: unknown) => ({ code: "Unknown", message: String(e) }),
}));
vi.mock("@/lib/flush", () => ({ flushPendingWrites: () => Promise.resolve() }));

import { addChild } from "@/lib/planTree";
import { usePlanStore } from "./planStore";
import { useUiStore } from "./uiStore";
import { useVaultStore } from "./vaultStore";

const NOTE =
  "---\ntags: [plan]\n---\n# Move the office\n\nBefore 1 March.\n\n- Find the place\n  - Visit\n- Moving day\n\nAfter the list.\n";

describe("planStore", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
    apiMock.writeNote.mockResolvedValue(undefined);
    apiMock.noteSetTag.mockResolvedValue([]);
    apiMock.readNote.mockResolvedValue({ path: "Plans/Move.md", content: NOTE });
    useVaultStore.setState({ files: [], refreshTree: vi.fn().mockResolvedValue(undefined) });
    usePlanStore.setState({ plans: [], path: null, nodes: [], selected: null, dialog: null });
    useUiStore.setState({ centerView: "start" });
  });

  it("lists the plans by name, with how many ideas each has and which are finished", async () => {
    apiMock.taggedNotes.mockResolvedValue([
      { path: "Plans/Zed.md", content: "---\ntags: [plan, plan-finished]\n---\n# Zed\n\n- a\n" },
      { path: "Plans/Move.md", content: NOTE },
    ]);
    await usePlanStore.getState().load();
    const { plans } = usePlanStore.getState();
    expect(plans.map((p) => p.title)).toEqual(["Move the office", "Zed"]);
    expect(plans[0]?.ideas).toBe(3);
    expect(plans[1]?.finished).toBe(true);
  });

  it("opens a plan in the Plans area", async () => {
    await usePlanStore.getState().open("Plans/Move.md");
    const s = usePlanStore.getState();
    expect(s.title).toBe("Move the office");
    expect(s.nodes.map((n) => n.text)).toEqual(["Find the place", "Moving day"]);
    expect(useUiStore.getState().centerView).toBe("plans");
  });

  it("writes only the list when the ideas change, and keeps the rest of the note", async () => {
    await usePlanStore.getState().open("Plans/Move.md");
    apiMock.taggedNotes.mockResolvedValue([]);
    await usePlanStore.getState().edit((nodes) => addChild(nodes, [1], "Book the van"));
    const written = apiMock.writeNote.mock.calls[0]?.[1] as string;
    expect(written).toContain("Before 1 March.");
    expect(written).toContain("After the list.");
    expect(written).toContain("- Moving day\n  - Book the van\n");
    expect(usePlanStore.getState().nodes[1]?.children[0]?.text).toBe("Book the van");
  });

  it("writes nothing when nothing changed", async () => {
    await usePlanStore.getState().open("Plans/Move.md");
    apiMock.taggedNotes.mockResolvedValue([]);
    await usePlanStore.getState().edit((nodes) => nodes);
    expect(apiMock.writeNote).not.toHaveBeenCalled();
  });

  it("makes a plan as a note with the tag, in Plans, and does not take a name that is used", async () => {
    useVaultStore.setState({ files: ["Plans/Move the office.md"] });
    apiMock.taggedNotes.mockResolvedValue([]);
    apiMock.readNote.mockImplementation((p: string) =>
      Promise.resolve({ path: p, content: "---\ntags: [plan]\n---\n# Move the office\n\n" }),
    );
    const path = await usePlanStore.getState().create("Move the office");
    expect(path).toBe("Plans/Move the office 2.md");
    const [where, text] = apiMock.writeNote.mock.calls[0] as [string, string];
    expect(where).toBe("Plans/Move the office 2.md");
    expect(text.startsWith("---\ntags: [plan]\n---\n# Move the office\n")).toBe(true);
    expect(usePlanStore.getState().path).toBe(path);
  });

  it("marks a plan finished and open again with its tag", async () => {
    await usePlanStore.getState().open("Plans/Move.md");
    apiMock.taggedNotes.mockResolvedValue([]);
    await usePlanStore.getState().setFinished(true);
    expect(apiMock.noteSetTag).toHaveBeenCalledWith("Plans/Move.md", "plan-finished", true);
    expect(usePlanStore.getState().finished).toBe(true);
  });

  it("remembers the view on this computer", () => {
    usePlanStore.getState().setView("map");
    expect(localStorage.getItem("mimer.planView")).toBe("map");
  });
});
