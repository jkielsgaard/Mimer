import { create } from "zustand";
import type { Project } from "@/bindings/Project";
import type { RenamePreview } from "@/bindings/RenamePreview";
import { toApiError } from "@/lib/api";

export type LeftTab = "files" | "search";
export type RightTab = "assistant" | "raven" | "images" | "history";
export type LinkUpdateChoice = "update" | "skip" | "cancel";

export interface Toast {
  id: number;
  kind: "info" | "error" | "success";
  message: string;
}

/** A message that must not be overlooked: shown in a dialog until the user closes it. */
export interface Notice {
  title: string;
  /** What went wrong, one line each (several when more than one item failed). */
  details: string[];
  /** What the user can do about it. */
  hint: string;
}

export interface ProjectDialogState {
  folder: string;
  project: Project | null;
}

interface LinkUpdatePrompt {
  preview: RenamePreview;
  resolve: (choice: LinkUpdateChoice) => void;
}

/** A picture shown large. `path` is its vault path when known (it can then be opened elsewhere). */
export interface ImagePreview {
  src: string;
  name: string;
  path: string | null;
}

interface UiState {
  notice: Notice | null;
  /** Shows a message in a dialog (not a toast that disappears). */
  showNotice: (notice: Notice | null) => void;
  /** The folder a new note is being named for, or null when the dialog is closed. */
  newNoteDialog: { folder: string } | null;
  openNewNoteDialog: (folder: string | null) => void;
  imagePreview: ImagePreview | null;
  /** Shows a picture large, or closes the view with `null`. */
  openImagePreview: (preview: ImagePreview | null) => void;
  leftTab: LeftTab;
  rightTab: RightTab;
  leftCollapsed: boolean;
  rightCollapsed: boolean;
  quickOpen: boolean;
  settingsOpen: boolean;
  recoverOpen: boolean;
  templatePickerOpen: boolean;
  vaultSwitcherOpen: boolean;
  setVaultSwitcherOpen: (open: boolean) => void;
  importOpen: boolean;
  setImportOpen: (open: boolean) => void;
  researchOpen: boolean;
  setResearchOpen: (open: boolean) => void;
  importAnswerOpen: boolean;
  setImportAnswerOpen: (open: boolean) => void;
  aboutOpen: boolean;
  setAboutOpen: (open: boolean) => void;
  helpOpen: boolean;
  /** The topic of the how-to guide that is shown. */
  helpTopic: string;
  setHelpOpen: (open: boolean) => void;
  /** Opens the how-to guide, at `topic` when given. */
  openHelp: (topic?: string) => void;
  exportDialog: { path: string; isFolder: boolean } | null;
  openExportDialog: (target: { path: string; isFolder: boolean } | null) => void;
  setTemplatePickerOpen: (open: boolean) => void;
  projectDialog: ProjectDialogState | null;
  linkUpdate: LinkUpdatePrompt | null;
  toasts: Toast[];
  focusChatNonce: number;
  focusRavenNonce: number;
  focusSearchNonce: number;
  /** Search text pushed from elsewhere (e.g. a tag click). */
  searchSeed: string;

  setLeftTab: (t: LeftTab) => void;
  setRightTab: (t: RightTab) => void;
  toggleLeft: () => void;
  toggleRight: () => void;
  setQuickOpen: (open: boolean) => void;
  setSettingsOpen: (open: boolean) => void;
  setRecoverOpen: (open: boolean) => void;
  openProjectDialog: (state: ProjectDialogState | null) => void;
  focusChat: () => void;
  /** Opens the Raven tab and focuses its message box. */
  focusRaven: () => void;
  focusSearch: (seed?: string) => void;
  toast: (message: string, kind?: Toast["kind"]) => void;
  dismissToast: (id: number) => void;
  askLinkUpdate: (preview: RenamePreview) => Promise<LinkUpdateChoice>;
  answerLinkUpdate: (choice: LinkUpdateChoice) => void;
}

let toastId = 1;

export const useUiStore = create<UiState>((set, get) => ({
  notice: null,
  showNotice: (notice) => {
    set((s) => {
      // Several items that fail one after the other (moving many at once) share one dialog.
      if (notice !== null && s.notice?.title === notice.title) {
        const merged = [
          ...s.notice.details,
          ...notice.details.filter((d) => !s.notice?.details.includes(d)),
        ];
        return { notice: { ...s.notice, details: merged } };
      }
      return { notice };
    });
  },
  newNoteDialog: null,
  openNewNoteDialog: (folder) => {
    set({ newNoteDialog: folder === null ? null : { folder } });
  },
  leftTab: "files",
  rightTab: "assistant",
  leftCollapsed: false,
  rightCollapsed: false,
  quickOpen: false,
  settingsOpen: false,
  recoverOpen: false,
  templatePickerOpen: false,
  vaultSwitcherOpen: false,
  setVaultSwitcherOpen: (vaultSwitcherOpen) => {
    set({ vaultSwitcherOpen });
  },
  imagePreview: null,
  openImagePreview: (imagePreview) => {
    set({ imagePreview });
  },
  importOpen: false,
  setImportOpen: (importOpen) => {
    set({ importOpen });
  },
  researchOpen: false,
  setResearchOpen: (researchOpen) => {
    set({ researchOpen });
  },
  importAnswerOpen: false,
  setImportAnswerOpen: (importAnswerOpen) => {
    set({ importAnswerOpen });
  },
  aboutOpen: false,
  setAboutOpen: (aboutOpen) => {
    set({ aboutOpen });
  },
  helpOpen: false,
  helpTopic: "start",
  setHelpOpen: (helpOpen) => {
    set({ helpOpen });
  },
  openHelp: (topic) => {
    set((s) => ({ helpOpen: true, helpTopic: topic ?? s.helpTopic }));
  },
  exportDialog: null,
  openExportDialog: (exportDialog) => {
    set({ exportDialog });
  },
  setTemplatePickerOpen: (templatePickerOpen) => {
    set({ templatePickerOpen });
  },
  projectDialog: null,
  linkUpdate: null,
  toasts: [],
  focusChatNonce: 0,
  focusRavenNonce: 0,
  focusSearchNonce: 0,
  searchSeed: "",

  setLeftTab: (leftTab) => {
    set({ leftTab, leftCollapsed: false });
  },
  setRightTab: (rightTab) => {
    set({ rightTab, rightCollapsed: false });
  },
  toggleLeft: () => {
    set((s) => ({ leftCollapsed: !s.leftCollapsed }));
  },
  toggleRight: () => {
    set((s) => ({ rightCollapsed: !s.rightCollapsed }));
  },
  setQuickOpen: (quickOpen) => {
    set({ quickOpen });
  },
  setSettingsOpen: (settingsOpen) => {
    set({ settingsOpen });
  },
  setRecoverOpen: (recoverOpen) => {
    set({ recoverOpen });
  },
  openProjectDialog: (projectDialog) => {
    set({ projectDialog });
  },
  focusChat: () => {
    set((s) => ({
      rightTab: "assistant",
      rightCollapsed: false,
      focusChatNonce: s.focusChatNonce + 1,
    }));
  },
  focusRaven: () => {
    set((s) => ({
      rightTab: "raven",
      rightCollapsed: false,
      focusRavenNonce: s.focusRavenNonce + 1,
    }));
  },
  focusSearch: (seed) => {
    set((s) => ({
      leftTab: "search",
      leftCollapsed: false,
      focusSearchNonce: s.focusSearchNonce + 1,
      searchSeed: seed ?? s.searchSeed,
    }));
  },
  toast: (message, kind = "info") => {
    const id = toastId++;
    set((s) => ({ toasts: [...s.toasts, { id, kind, message }] }));
    setTimeout(
      () => {
        get().dismissToast(id);
      },
      kind === "error" ? 8000 : 4000,
    );
  },
  dismissToast: (id) => {
    set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) }));
  },
  askLinkUpdate: (preview) =>
    new Promise<LinkUpdateChoice>((resolve) => {
      set({ linkUpdate: { preview, resolve } });
    }),
  answerLinkUpdate: (choice) => {
    const prompt = get().linkUpdate;
    set({ linkUpdate: null });
    prompt?.resolve(choice);
  },
}));

/**
 * Shows an error. A name that is already taken gets a dialog, because a toast is easy to miss;
 * everything else is a toast.
 */
export function reportError(e: unknown): void {
  const err = toApiError(e);
  if (err.code === "AlreadyExists") {
    useUiStore.getState().showNotice({
      title: "That name is already taken",
      details: [err.message],
      hint: "Nothing was changed for these. Rename one of them, or choose another name, and try again.",
    });
    return;
  }
  useUiStore.getState().toast(err.message, "error");
}
