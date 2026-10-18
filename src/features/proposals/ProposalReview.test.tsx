import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ProposalSetView } from "@/bindings/ProposalSetView";

const applyProposals = vi.fn<(...a: unknown[]) => Promise<unknown>>();
const getProposals = vi.fn<(...a: unknown[]) => Promise<unknown>>();
vi.mock("@/lib/api", () => ({
  api: {
    applyProposals: (...a: unknown[]) => applyProposals(...a),
    getProposals: (...a: unknown[]) => getProposals(...a),
    discardProposals: vi.fn().mockResolvedValue(undefined),
    getTree: vi.fn().mockResolvedValue([]),
    listProjects: vi.fn().mockResolvedValue([]),
    readNote: vi
      .fn()
      .mockResolvedValue({ path: "Old.md", content: "# Old\n\nfirst words", mtime: 0 }),
  },
  toApiError: (e: unknown) => ({ message: String(e) }),
}));
vi.mock("@/components/DiffView", () => ({
  DiffView: ({ original, modified }: { original: string; modified: string }) => (
    <pre data-testid="diff">{`${original} => ${modified}`}</pre>
  ),
}));

import { useProposalStore } from "@/stores/proposalStore";
import { useUiStore } from "@/stores/uiStore";
import { ProposalReview } from "./ProposalReview";

function sample(): ProposalSetView {
  const base = { newPath: null, originalHash: "h", reason: "because", checks: [] };
  return {
    id: "set-1",
    proposals: [
      {
        proposal: {
          ...base,
          id: "p1",
          action: "create",
          path: "Part1.md",
          content: "one",
          original: null,
        },
        changedSinceProposal: false,
      },
      {
        proposal: {
          ...base,
          id: "p2",
          action: "create",
          path: "Part2.md",
          content: "two",
          original: null,
        },
        changedSinceProposal: false,
      },
      {
        proposal: {
          ...base,
          id: "p3",
          action: "edit",
          path: "Index.md",
          content: "new",
          original: "old",
        },
        changedSinceProposal: true,
      },
    ],
  };
}

describe("ProposalReview", () => {
  beforeEach(() => {
    applyProposals.mockReset().mockResolvedValue({
      applied: ["Part1.md"],
      appliedIds: ["p1"],
      skipped: [],
      commitSha: "abc",
    });
    getProposals.mockReset();
    useProposalStore.setState({
      view: sample(),
      accepted: new Set(["p1", "p2", "p3"]),
      confirmed: new Set(),
      applying: false,
    });
  });

  it("lists every file in a group with an action badge, and shows the reason of the chosen one", () => {
    render(<ProposalReview />);
    expect(screen.getByText("Review 3 proposed changes")).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "New notes" })).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Edited notes" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Index\.md/ })).toBeInTheDocument();
    expect(screen.getByText("because")).toBeInTheDocument();
  });

  it("flags files that changed since the proposal and blocks apply until re-confirmed", async () => {
    const user = userEvent.setup();
    render(<ProposalReview />);
    await user.click(screen.getByRole("button", { name: /Index\.md/ }));
    expect(screen.getAllByText(/Changed since proposal/).length).toBeGreaterThan(0);
    const apply = screen.getByRole("button", { name: /Apply selected/ });
    expect(apply).toBeDisabled();
    await user.click(screen.getByLabelText("I have checked it"));
    expect(apply).toBeEnabled();
  });

  it("applies only the files left on Accept", async () => {
    const user = userEvent.setup();
    useProposalStore.setState({ accepted: new Set(["p1", "p2"]) });
    render(<ProposalReview />);
    await user.click(screen.getByRole("button", { name: /Part2\.md/ }));
    const group2 = screen.getByRole("group", { name: "Decision for Part2.md" });
    await user.click(within(group2).getByRole("button", { name: "Reject" }));
    expect(useProposalStore.getState().accepted).toEqual(new Set(["p1"]));
    getProposals.mockRejectedValue(new Error("gone"));
    await user.click(screen.getByRole("button", { name: /Apply selected \(1\)/ }));
    expect(applyProposals).toHaveBeenCalledWith("set-1", ["p1"], []);
    expect(useProposalStore.getState().lastAppliedSha).toBe("abc");
    expect(useUiStore.getState().toasts.at(-1)?.action?.label).toBe("Undo");
  });

  it("shows the diff of the chosen file", async () => {
    const user = userEvent.setup();
    render(<ProposalReview />);
    await user.click(screen.getByRole("button", { name: /Index\.md/ }));
    expect(screen.getByTestId("diff")).toHaveTextContent("old => new");
  });

  it("accepts and rejects a whole group, and filters by kind", async () => {
    const user = userEvent.setup();
    render(<ProposalReview />);
    const news = screen.getByRole("region", { name: "New notes" });
    await user.click(within(news).getByRole("button", { name: "Reject group" }));
    expect(useProposalStore.getState().accepted).toEqual(new Set(["p3"]));
    await user.click(within(news).getByRole("button", { name: "Accept group" }));
    expect(useProposalStore.getState().accepted).toEqual(new Set(["p1", "p2", "p3"]));
    await user.click(screen.getByRole("button", { name: "Edits 1" }));
    expect(screen.queryByRole("region", { name: "New notes" })).toBeNull();
    expect(screen.getByRole("region", { name: "Edited notes" })).toBeInTheDocument();
  });

  it("groups moves by destination and previews the start of the note", async () => {
    const user = userEvent.setup();
    const base = {
      content: null,
      original: null,
      originalHash: "h",
      reason: "fits customers",
      checks: [],
    };
    useProposalStore.setState({
      view: {
        id: "set-2",
        proposals: [
          {
            proposal: {
              ...base,
              id: "m1",
              action: "move",
              path: "Old.md",
              newPath: "Customers/Old.md",
            },
            changedSinceProposal: false,
          },
        ],
      },
      accepted: new Set(["m1"]),
    });
    render(<ProposalReview />);
    expect(screen.getByRole("region", { name: "Moved to Customers" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /Old\.md/ }));
    expect(await screen.findByText(/first words/)).toBeInTheDocument();
  });
});

describe("undo after apply", () => {
  it("offers Undo in the toast and calls the backend with the commit", async () => {
    const undo = vi.fn().mockResolvedValue(["Part1.md"]);
    const mod = await import("@/lib/api");
    (mod.api as unknown as { undoCommit: typeof undo }).undoCommit = undo;
    useProposalStore.setState({ lastAppliedSha: "abc123" });
    await useProposalStore.getState().undoLast();
    expect(undo).toHaveBeenCalledWith("abc123");
    expect(useProposalStore.getState().lastAppliedSha).toBeNull();
  });
});

describe("Mimer's checks in the review", () => {
  it("leaves a change that failed a check unselected and says why", async () => {
    const base = {
      newPath: null,
      originalHash: "h",
      reason: "Fix",
      original: "old 31",
      content: "new 13",
    };
    getProposals.mockReset().mockResolvedValue({
      id: "set-9",
      proposals: [
        {
          proposal: {
            ...base,
            id: "ok",
            action: "edit",
            path: "Good.md",
            checks: [{ label: "Nothing left out", ok: true, detail: null }],
          },
          changedSinceProposal: false,
        },
        {
          proposal: {
            ...base,
            id: "bad",
            action: "edit",
            path: "Bad.md",
            checks: [
              { label: "Numbers and dates kept", ok: false, detail: "Changed or missing: 31" },
            ],
          },
          changedSinceProposal: false,
        },
      ],
    });
    await useProposalStore.getState().open("set-9");
    expect(useProposalStore.getState().accepted).toEqual(new Set(["ok"]));
    render(<ProposalReview />);
    const user = userEvent.setup();
    expect(screen.getByLabelText("Did not pass Mimer's checks")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /Bad\.md/ }));
    expect(screen.getByText(/Changed or missing: 31/)).toBeInTheDocument();
    expect(
      screen.getByText(/Not selected, because the AI may have made a mistake/),
    ).toBeInTheDocument();
  });
});
