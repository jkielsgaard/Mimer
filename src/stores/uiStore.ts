import { create } from "zustand";
import type { Project } from "@/bindings/Project";
import type { RenamePreview } from "@/bindings/RenamePreview";
import { toApiError } from "@/lib/api";

export type LeftTab = "files" | "search" | "tasks" | "ideas";
/** What fills the middle of the window. */
export type CenterView = "notes" | "tasks" | "epic" | "task" | "ideas";

/** The task list, an epic or a task: all of them are the Tasks area. */
export function isTasksView(v: CenterView): boolean {
  return v === "tasks" || v === "epic" || v === "task";
}
export type RightTab = "outline" | "links" | "history" | "images";
const SOURCE_MODE_KEY = "mimer.sourceMode";

/** Whether notes are shown as Markdown source (remembered between runs). */
function readSourceMode(): boolean {
  try {
    return localStorage.getItem(SOURCE_MODE_KEY) === "1";
  } catch {
    return false;
  }
}

export type LinkUpdateChoice = "update" | "skip" | "cancel";

export interface Toast {
  id: number;
  kind: "info" | "error" | "success";
  message: string;
  /** A button in the toast, for example Undo. */
  action?: { label: string; run: () => void };
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
  /** True = the editor shows the Markdown source instead of the live preview. */
  sourceMode: boolean;
  setSourceMode: (on: boolean) => void;
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
  /** The chat window over the note is open. */
  askOpen: boolean;
  setAskOpen: (open: boolean) => void;
  leftCollapsed: boolean;
  rightCollapsed: boolean;
  /** What fills the middle of the window: the notes, the task list or one task. */
  centerView: CenterView;
  setCenterView: (v: CenterView) => void;
  /** Where "open the note" came from, so the note can offer a way back to the task or epic. */
  /** Shows the tasks or the ideas: their own panel on the left and their page in the middle. */
  openArea: (area: "tasks" | "ideas") => void;
  /** The write-it-down box (Ctrl+Shift+N), opened with this kind chosen. */
  captureKind: "task" | "idea" | "note" | null;
  openCapture: (kind?: "task" | "idea" | "note") => void;
  closeCapture: () => void;
  /** The focus screen is open. */
  focusOpen: boolean;
  setFocusOpen: (open: boolean) => void;
  findTasksOpen: boolean;
  /** Look for tasks in this text instead of the whole open note (a selection). */
  findTasksIn: string | null;
  /** What the task finder reads and does: look for tasks in a note, or suggest missing steps. */
  findTasksOpts: { path: string | null; mode: "tasks" | "steps" };
  setFindTasksOpen: (
    open: boolean,
    text?: string,
    opts?: { path: string; mode: "tasks" | "steps" },
  ) => void;
  starterOpen: boolean;
  setStarterOpen: (open: boolean) => void;
  quickOpen: boolean;
  commandPalette: boolean;
  settingsOpen: boolean;
  /** The Settings tab to show when the dialog opens (`null` = the first). */
  settingsTab: string | null;
  /** Opens Settings on the Built-in AI tab. */
  openBuiltInSettings: () => void;
  recoverOpen: boolean;
  templatePickerOpen: boolean;
  vaultSwitcherOpen: boolean;
  setVaultSwitcherOpen: (open: boolean) => void;
  importOpen: boolean;
  setImportOpen: (open: boolean) => void;
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
  focusSearchNonce: number;
  /** Search text pushed from elsewhere (e.g. a tag click). */
  searchSeed: string;

  setLeftTab: (t: LeftTab) => void;
  setRightTab: (t: RightTab) => void;
  toggleLeft: () => void;
  toggleRight: () => void;
  setQuickOpen: (open: boolean) => void;
  setCommandPalette: (open: boolean) => void;
  setSettingsOpen: (open: boolean) => void;
  setRecoverOpen: (open: boolean) => void;
  openProjectDialog: (state: ProjectDialogState | null) => void;
  focusChat: () => void;
  focusSearch: (seed?: string) => void;
  toast: (message: string, kind?: Toast["kind"], action?: Toast["action"]) => void;
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
  sourceMode: readSourceMode(),
  setSourceMode: (sourceMode) => {
    try {
      localStorage.setItem(SOURCE_MODE_KEY, sourceMode ? "1" : "0");
    } catch {
      /* the choice just is not remembered */
    }
    set({ sourceMode });
  },
  leftTab: "files",
  rightTab: "outline",
  askOpen: false,
  setAskOpen: (askOpen) => {
    set({ askOpen });
  },
  leftCollapsed: false,
  // The right panel opens only when asked for: the note gets the width.
  rightCollapsed: true,
  centerView: "notes",
  captureKind: null,
  openCapture: (kind) => {
    set({ captureKind: kind ?? "idea" });
  },
  closeCapture: () => {
    set({ captureKind: null });
  },
  setCenterView: (centerView) => {
    set({ centerView });
  },
  focusOpen: false,
  setFocusOpen: (focusOpen) => {
    set({ focusOpen });
  },
  findTasksOpen: false,
  findTasksIn: null,
  findTasksOpts: { path: null, mode: "tasks" },
  setFindTasksOpen: (findTasksOpen, text, opts) => {
    set({
      findTasksOpen,
      findTasksIn: findTasksOpen ? (text ?? null) : null,
      findTasksOpts: findTasksOpen && opts ? opts : { path: null, mode: "tasks" },
    });
  },
  starterOpen: false,
  setStarterOpen: (starterOpen) => {
    set({ starterOpen });
  },
  quickOpen: false,
  commandPalette: false,
  settingsOpen: false,
  settingsTab: null,
  openBuiltInSettings: () => {
    set({ settingsOpen: true, settingsTab: "builtin" });
  },
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
  focusSearchNonce: 0,
  searchSeed: "",

  openArea: (area) => {
    set({ leftTab: area, leftCollapsed: false, centerView: area });
  },
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
  setCommandPalette: (commandPalette) => {
    set({ commandPalette });
  },
  setSettingsOpen: (settingsOpen) => {
    set({ settingsOpen, settingsTab: null });
  },
  setRecoverOpen: (recoverOpen) => {
    set({ recoverOpen });
  },
  openProjectDialog: (projectDialog) => {
    set({ projectDialog });
  },
  focusChat: () => {
    set((s) => ({ askOpen: true, focusChatNonce: s.focusChatNonce + 1 }));
  },
  focusSearch: (seed) => {
    set((s) => ({
      leftTab: "search",
      leftCollapsed: false,
      focusSearchNonce: s.focusSearchNonce + 1,
      searchSeed: seed ?? s.searchSeed,
    }));
  },
  toast: (message, kind = "info", action) => {
    const id = toastId++;
    set((s) => ({
      toasts: [...s.toasts, { id, kind, message, ...(action ? { action } : {}) }],
    }));
    setTimeout(
      () => {
        get().dismissToast(id);
      },
      kind === "error" ? 8000 : action ? 15000 : 4000,
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
  if (err.code === "Conflict") {
    useUiStore.getState().showNotice({
      title: "That cannot be done",
      details: [err.message],
      hint: "Nothing was changed.",
    });
    return;
  }
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
