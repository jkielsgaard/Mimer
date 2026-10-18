import { create } from "zustand";
import type { ApplyResult } from "@/bindings/ApplyResult";
import type { ProposalSetView } from "@/bindings/ProposalSetView";
import { api } from "@/lib/api";
import { flushPendingWrites } from "@/lib/flush";
import { reportError, useUiStore } from "./uiStore";
import { useVaultStore } from "./vaultStore";

export interface ApplyPayload {
  setId: string;
  acceptedIds: string[];
  confirmedChangedIds: string[];
}

/** Builds the `apply_proposals` arguments from the review state. */
export function buildApplyPayload(
  view: ProposalSetView,
  accepted: ReadonlySet<string>,
  confirmed: ReadonlySet<string>,
): ApplyPayload {
  const acceptedIds = view.proposals
    .filter((p) => accepted.has(p.proposal.id))
    .map((p) => p.proposal.id);
  const confirmedChangedIds = view.proposals
    .filter(
      (p) => p.changedSinceProposal && accepted.has(p.proposal.id) && confirmed.has(p.proposal.id),
    )
    .map((p) => p.proposal.id);
  return { setId: view.id, acceptedIds, confirmedChangedIds };
}

/** True when every accepted file that changed on disk has been re-confirmed. */
export function canApply(
  view: ProposalSetView,
  accepted: ReadonlySet<string>,
  confirmed: ReadonlySet<string>,
): boolean {
  const any = view.proposals.some((p) => accepted.has(p.proposal.id));
  const unconfirmed = view.proposals.some(
    (p) => accepted.has(p.proposal.id) && p.changedSinceProposal && !confirmed.has(p.proposal.id),
  );
  return any && !unconfirmed;
}

interface ProposalState {
  view: ProposalSetView | null;
  accepted: Set<string>;
  confirmed: Set<string>;
  applying: boolean;
  /** The commit of the last apply, while it can still be undone. */
  lastAppliedSha: string | null;
  /** Undoes the last apply (see `undo_commit`). */
  undoLast: () => Promise<void>;
  open: (setId: string) => Promise<void>;
  toggle: (id: string) => void;
  /** Accepts or rejects several proposals at once (a group). */
  setMany: (ids: readonly string[], on: boolean) => void;
  confirm: (id: string) => void;
  applySelected: () => Promise<ApplyResult | null>;
  rejectAll: () => Promise<void>;
  close: () => void;
}

export const useProposalStore = create<ProposalState>((set, get) => ({
  view: null,
  accepted: new Set(),
  confirmed: new Set(),
  applying: false,
  lastAppliedSha: null,

  undoLast: async () => {
    const sha = get().lastAppliedSha;
    if (sha === null) return;
    try {
      await flushPendingWrites();
      const touched = await api.undoCommit(sha);
      set({ lastAppliedSha: null });
      const vault = useVaultStore.getState();
      await Promise.all([vault.refreshTree(), vault.refreshProjects()]);
      const active = vault.activePath;
      if (active !== null && !vault.files.includes(active)) {
        await vault.openNote(null);
      } else {
        useVaultStore.setState((s) => ({ reloadNonce: s.reloadNonce + 1 }));
      }
      useUiStore
        .getState()
        .toast(`Undone: ${String(touched.length)} note(s) are back as they were.`, "success");
    } catch (e) {
      reportError(e);
    }
  },

  open: async (setId) => {
    try {
      const view = await api.getProposals(setId);
      set({
        view,
        // A change that failed one of Mimer's checks is shown, but not selected.
        accepted: new Set(
          view.proposals
            .filter((p) => p.proposal.checks.every((c) => c.ok))
            .map((p) => p.proposal.id),
        ),
        confirmed: new Set(),
      });
    } catch (e) {
      reportError(e);
    }
  },

  toggle: (id) => {
    set((s) => {
      const accepted = new Set(s.accepted);
      if (accepted.has(id)) accepted.delete(id);
      else accepted.add(id);
      return { accepted };
    });
  },

  setMany: (ids, on) => {
    set((s) => {
      const accepted = new Set(s.accepted);
      for (const id of ids) {
        if (on) accepted.add(id);
        else accepted.delete(id);
      }
      return { accepted };
    });
  },

  confirm: (id) => {
    set((s) => ({ confirmed: new Set(s.confirmed).add(id) }));
  },

  applySelected: async () => {
    const { view, accepted, confirmed } = get();
    if (!view) return null;
    set({ applying: true });
    try {
      await flushPendingWrites();
      const payload = buildApplyPayload(view, accepted, confirmed);
      const result = await api.applyProposals(
        payload.setId,
        payload.acceptedIds,
        payload.confirmedChangedIds,
      );
      const vault = useVaultStore.getState();
      await Promise.all([vault.refreshTree(), vault.refreshProjects()]);
      const active = vault.activePath;
      if (active !== null && !vault.files.includes(active)) {
        await vault.openNote(null);
      } else {
        useVaultStore.setState((s) => ({ reloadNonce: s.reloadNonce + 1 }));
      }
      const ui = useUiStore.getState();
      if (result.skipped.length > 0) {
        ui.toast(
          `${result.skipped.length} change(s) were not applied: ${result.skipped[0]?.reason ?? ""}`,
          "error",
        );
        // Keep the review open with whatever is left.
        try {
          const rest = await api.getProposals(view.id);
          set({
            view: rest,
            accepted: new Set(rest.proposals.map((p) => p.proposal.id)),
            applying: false,
          });
          return result;
        } catch {
          /* set is gone: everything was applied */
        }
      } else {
        const sha = result.commitSha;
        set({ lastAppliedSha: sha });
        ui.toast(
          `Applied ${result.applied.length} change(s). You can undo them from the version history.`,
          "success",
          sha === null
            ? undefined
            : {
                label: "Undo",
                run: () => {
                  void get().undoLast();
                },
              },
        );
      }
      set({ view: null, applying: false });
      return result;
    } catch (e) {
      reportError(e);
      set({ applying: false });
      return null;
    }
  },

  rejectAll: async () => {
    const { view } = get();
    if (view) {
      try {
        await api.discardProposals(view.id);
      } catch {
        /* already gone */
      }
    }
    set({ view: null });
  },

  close: () => {
    set({ view: null });
  },
}));
