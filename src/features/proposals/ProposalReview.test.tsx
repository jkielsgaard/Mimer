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
  },
  toApiError: (e: unknown) => ({ message: String(e) }),
}));
vi.mock("@/components/DiffView", () => ({
  DiffView: ({ original, modified }: { original: string; modified: string }) => (
    <pre data-testid="diff">{`${original} => ${modified}`}</pre>
  ),
}));

import { useProposalStore } from "@/stores/proposalStore";
import { ProposalReview } from "./ProposalReview";

function sample(): ProposalSetView {
  const base = { newPath: null, originalHash: "h", reason: "because" };
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

  it("lists every file with an action badge and reason", () => {
    render(<ProposalReview />);
    expect(screen.getAllByText("Create")).toHaveLength(2);
    expect(screen.getByText("Edit")).toBeInTheDocument();
    expect(screen.getByText("Index.md")).toBeInTheDocument();
    expect(screen.getAllByText("because").length).toBeGreaterThan(0);
  });

  it("flags files that changed since the proposal and blocks apply until re-confirmed", async () => {
    const user = userEvent.setup();
    render(<ProposalReview />);
    expect(screen.getByText(/Changed since proposal/)).toBeInTheDocument();
    const apply = screen.getByRole("button", { name: /Apply selected/ });
    expect(apply).toBeDisabled();
    await user.click(screen.getByLabelText("I have checked it"));
    expect(apply).toBeEnabled();
  });

  it("applies only the files left on Accept", async () => {
    const user = userEvent.setup();
    useProposalStore.setState({ accepted: new Set(["p1", "p2"]) });
    render(<ProposalReview />);
    const group2 = screen.getByRole("group", { name: "Decision for Part2.md" });
    await user.click(within(group2).getByRole("button", { name: "Reject" }));
    expect(useProposalStore.getState().accepted).toEqual(new Set(["p1"]));
    getProposals.mockRejectedValue(new Error("gone"));
    await user.click(screen.getByRole("button", { name: /Apply selected \(1\)/ }));
    expect(applyProposals).toHaveBeenCalledWith("set-1", ["p1"], []);
  });

  it("expands a unified diff per file", async () => {
    const user = userEvent.setup();
    render(<ProposalReview />);
    await user.click(screen.getAllByRole("button", { name: "Show changes" })[2] as HTMLElement);
    expect(screen.getByTestId("diff")).toHaveTextContent("old => new");
  });
});
