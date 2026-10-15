import { describe, expect, it } from "vitest";
import type { ProposalSetView } from "@/bindings/ProposalSetView";
import { buildApplyPayload, canApply } from "./proposalStore";

function view(): ProposalSetView {
  const mk = (id: string, path: string, changed = false) => ({
    proposal: {
      id,
      action: "edit" as const,
      path,
      newPath: null,
      content: "new",
      original: "old",
      originalHash: "h",
      reason: "r",
    },
    changedSinceProposal: changed,
  });
  return { id: "set-1", proposals: [mk("a", "A.md"), mk("b", "B.md"), mk("c", "C.md", true)] };
}

describe("apply payload", () => {
  it("contains only accepted ids", () => {
    const p = buildApplyPayload(view(), new Set(["a", "c"]), new Set());
    expect(p).toEqual({ setId: "set-1", acceptedIds: ["a", "c"], confirmedChangedIds: [] });
  });

  it("includes re-confirmed changed files only if they are accepted", () => {
    const v = view();
    expect(buildApplyPayload(v, new Set(["a", "c"]), new Set(["c"])).confirmedChangedIds).toEqual([
      "c",
    ]);
    expect(buildApplyPayload(v, new Set(["a"]), new Set(["c"])).confirmedChangedIds).toEqual([]);
  });
});

describe("canApply", () => {
  it("needs at least one accepted file", () => {
    expect(canApply(view(), new Set(), new Set())).toBe(false);
    expect(canApply(view(), new Set(["a"]), new Set())).toBe(true);
  });
  it("blocks while an accepted changed file is unconfirmed", () => {
    expect(canApply(view(), new Set(["a", "c"]), new Set())).toBe(false);
    expect(canApply(view(), new Set(["a", "c"]), new Set(["c"]))).toBe(true);
    expect(canApply(view(), new Set(["a"]), new Set())).toBe(true);
  });
});
