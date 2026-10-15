import { autocompletion, closeBrackets, completionKeymap } from "@codemirror/autocomplete";
import { defaultKeymap, history, historyKeymap } from "@codemirror/commands";
import { markdown, markdownLanguage } from "@codemirror/lang-markdown";
import { search, searchKeymap } from "@codemirror/search";
import {
  Annotation,
  Compartment,
  EditorState,
  Transaction,
  type Extension,
} from "@codemirror/state";
import { drawSelection, EditorView, keymap } from "@codemirror/view";
import { useCallback, useEffect, useRef, type RefObject } from "react";
import { api } from "@/lib/api";
import { onFileChanged } from "@/lib/events";
import { registerFlusher } from "@/lib/flush";
import { consumeRename } from "@/lib/renameHint";
import { isMarkdown } from "@/lib/utils";
import { useEditorStore } from "@/stores/editorStore";
import { useSettingsStore } from "@/stores/settingsStore";
import { reportError, useUiStore } from "@/stores/uiStore";
import { useVaultStore } from "@/stores/vaultStore";
import { useWorkspaceStore, type PaneId } from "@/stores/workspaceStore";
import { insertTable, toggleWrap } from "./extensions/commands";
import { findFrontmatter, livePreview } from "./extensions/livePreview";
import { pasteImage } from "./extensions/pasteImage";
import { previewConfig, type PreviewConfig } from "./extensions/previewConfig";
import { dropLink } from "./extensions/dropLink";
import { trackEditor } from "./extensions/trackEditor";
import { wikiLinkCompletion } from "./extensions/wikiLinks";
import { editorTheme } from "./editorTheme";

const WRITE_DEBOUNCE_MS = 1000;
const NO_TABS: string[] = [];

/**
 * A pane without a note is read-only: text typed there could never be saved.
 * Applied with a compartment after every document change.
 */
function editableExt(on: boolean): Extension {
  return [EditorView.editable.of(on), EditorState.readOnly.of(!on)];
}

/** Marks transactions that come from disk, so they are not treated as user edits. */
const fromDisk = Annotation.define<boolean>();

interface Session {
  /** The note currently shown in this pane. */
  path: string | null;
  /** What we believe is on disk right now (last read or written). */
  lastDisk: string;
  dirty: boolean;
  timer: ReturnType<typeof setTimeout> | null;
}

/** Tabs of one pane, read fresh from the store. */
function paneTabs(paneId: PaneId): string[] {
  return useWorkspaceStore.getState().layout.panes.find((p) => p.id === paneId)?.tabs ?? NO_TABS;
}

export interface NoteSessionOptions {
  paneId: PaneId;
  /** The element the CodeMirror view is mounted into. */
  host: RefObject<HTMLDivElement | null>;
  /** Link resolution and asset settings for the live preview. */
  previewCfg: PreviewConfig;
  spellcheck: boolean;
  /** Opens the inline AI popup for the current selection; `x`/`y` are screen coordinates. */
  onInline: (view: EditorView, x?: number, y?: number) => void;
  /** Opens the "link to a note" picker (Mod+Shift+K). */
  onLinkPicker: () => void;
  /** Called after a note was written to disk, with its path and the text that was saved. */
  onSaved?: (path: string, content: string) => void;
}

/**
 * The note shown in one editor pane: the CodeMirror view, loading and autosaving the note,
 * switching tabs (hidden tabs keep their editor state), and external changes on disk with the
 * "keep mine / load disk" conflict resolution. The component only renders and wires up UI.
 */
export function useNoteSession({
  paneId,
  host,
  previewCfg,
  spellcheck,
  onInline,
  onLinkPicker,
  onSaved,
}: NoteSessionOptions) {
  const onSavedRef = useRef(onSaved);
  onSavedRef.current = onSaved;
  const viewRef = useRef<EditorView | null>(null);
  const session = useRef<Session>({ path: null, lastDisk: "", dirty: false, timer: null });
  const stash = useRef(new Map<string, EditorState>());
  const lastReload = useRef(0);
  const configCompartment = useRef(new Compartment());
  const editableCompartment = useRef(new Compartment());
  const spellCompartment = useRef(new Compartment());

  const activePath = useWorkspaceStore(
    (s) => s.layout.panes.find((p) => p.id === paneId)?.active ?? null,
  );
  const tabs = useWorkspaceStore(
    (s) => s.layout.panes.find((p) => p.id === paneId)?.tabs ?? NO_TABS,
  );
  const reloadNonce = useVaultStore((s) => s.reloadNonce);

  const previewCfgRef = useRef(previewCfg);
  previewCfgRef.current = previewCfg;

  // --- saving -------------------------------------------------------------------------------

  const saveRef = useRef<() => Promise<void>>(() => Promise.resolve());

  /** Debounced save. Defined before `save`; it reads `save` through `saveRef`. */
  const schedule = useCallback(() => {
    const s = session.current;
    if (s.timer) clearTimeout(s.timer);
    s.timer = setTimeout(() => {
      s.timer = null;
      void saveRef.current();
    }, WRITE_DEBOUNCE_MS);
  }, []);

  const save = useCallback(async () => {
    const view = viewRef.current;
    const s = session.current;
    if (!view || s.path === null) return;
    if (s.timer) {
      clearTimeout(s.timer);
      s.timer = null;
    }
    const path = s.path;
    const content = view.state.doc.toString();
    const store = useEditorStore.getState();
    store.markSaving(paneId);
    try {
      await api.writeNote(path, content);
      s.lastDisk = content;
      const stillDirty =
        session.current.path === path && viewRef.current?.state.doc.toString() !== content;
      s.dirty = stillDirty;
      store.markSaved(stillDirty, paneId);
      onSavedRef.current?.(path, content);
      if (stillDirty) schedule();
    } catch (e) {
      store.markUnsaved(paneId);
      reportError(e);
    }
    if (session.current.dirty) schedule();
  }, [paneId, schedule]);

  useEffect(() => {
    saveRef.current = save;
  }, [save]);

  /** Writes the pending buffer now (no-op when clean). */
  const flushNow = useCallback(async () => {
    const s = session.current;
    if (s.timer) {
      clearTimeout(s.timer);
      s.timer = null;
    }
    if (s.dirty) await save();
  }, [save]);

  useEffect(() => registerFlusher(flushNow), [flushNow]);

  // --- view creation ------------------------------------------------------------------------

  const makeState = useCallback(
    (doc: string): EditorState => {
      const extensions: Extension[] = [
        history(),
        drawSelection(),
        closeBrackets(),
        EditorView.lineWrapping,
        markdown({ base: markdownLanguage }),
        livePreview(),
        editorTheme,
        search({ top: true }),
        autocompletion({
          override: [wikiLinkCompletion(() => useVaultStore.getState().files)],
          icons: false,
        }),
        // Read the path at paste time: states are reused when switching tabs.
        pasteImage(() => session.current.path),
        dropLink(() => session.current.path),
        trackEditor(() => session.current.path),
        configCompartment.current.of(previewConfig.of(previewCfgRef.current)),
        editableCompartment.current.of(editableExt(true)),
        spellCompartment.current.of(
          EditorView.contentAttributes.of({
            spellcheck: String(useSettingsStore.getState().settings?.editor.spellcheck ?? true),
          }),
        ),
        keymap.of([
          { key: "Mod-b", run: (v) => toggleWrap(v, "**") },
          { key: "Mod-i", run: (v) => toggleWrap(v, "_") },
          { key: "Mod-Alt-t", run: (v) => insertTable(v) },
          {
            key: "Mod-k",
            run: (v) => {
              onInline(v);
              return true;
            },
          },
          {
            key: "Mod-Shift-k",
            run: () => {
              onLinkPicker();
              return true;
            },
          },
          ...completionKeymap,
          ...searchKeymap,
          ...historyKeymap,
          ...defaultKeymap.filter((b) => b.key !== "Mod-l" && b.key !== "Mod-i"),
        ]),
        EditorView.domEventHandlers({
          contextmenu: (e, v) => {
            if (v.state.selection.main.empty) return false;
            e.preventDefault();
            onInline(v, e.clientX, e.clientY);
            return true;
          },
        }),
        EditorView.updateListener.of((u) => {
          if (!u.docChanged || u.transactions.some((t) => t.annotation(fromDisk))) return;
          const s = session.current;
          s.dirty = true;
          useEditorStore.getState().markUnsaved(paneId);
          schedule();
        }),
      ];
      const fm = findFrontmatter(EditorState.create({ doc }).doc);
      // A brand-new note is just `# `: start typing the title right there.
      const anchor = doc === "# " ? doc.length : fm ? Math.min(fm.to + 1, doc.length) : 0;
      return EditorState.create({ doc, extensions, selection: { anchor } });
    },
    [schedule, paneId, onInline, onLinkPicker],
  );

  useEffect(() => {
    if (!host.current) return;
    const view = new EditorView({ state: makeState(""), parent: host.current });
    viewRef.current = view;
    return () => {
      view.destroy();
      viewRef.current = null;
    };
  }, [host, makeState]);

  // --- switching tabs and loading notes -----------------------------------------------------

  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    const setEditable = (on: boolean): void => {
      view.dispatch({ effects: editableCompartment.current.reconfigure(editableExt(on)) });
    };
    const run = { cancelled: false };
    const reloaded = reloadNonce !== lastReload.current;
    lastReload.current = reloadNonce;
    if (reloaded) stash.current.clear();

    void (async () => {
      const s = session.current;
      const prev = s.path;
      // The open note was only renamed (a new note named after its title): keep the editor as it is.
      if (activePath !== null && prev !== null && consumeRename(activePath) === prev) {
        s.path = activePath;
        return;
      }
      if (prev !== null && prev !== activePath) {
        // Leaving a note: write it, keep its state if the tab is still open, commit a snapshot.
        await flushNow();
        if (run.cancelled) return;
        if (paneTabs(paneId).includes(prev)) stash.current.set(prev, view.state);
        void api.commitNow({ kind: "autosave", detail: prev }, [prev]).catch(() => undefined);
      }
      if (activePath === null || !isMarkdown(activePath)) {
        s.path = null;
        s.lastDisk = "";
        s.dirty = false;
        view.setState(makeState(""));
        setEditable(false);
        useEditorStore.getState().markSaved(false, paneId);
        return;
      }
      const cached = stash.current.get(activePath);
      if (cached) {
        stash.current.delete(activePath);
        s.path = activePath;
        s.lastDisk = cached.doc.toString();
        s.dirty = false;
        view.setState(cached);
        setEditable(true);
        useEditorStore.getState().markSaved(false, paneId);
        if (useWorkspaceStore.getState().layout.focused === paneId) view.focus();
        return;
      }
      try {
        const note = await api.readNote(activePath);
        if (run.cancelled) return;
        s.path = activePath;
        s.lastDisk = note.content;
        s.dirty = false;
        view.setState(makeState(note.content));
        setEditable(true);
        useEditorStore.getState().markSaved(false, paneId);
        if (useWorkspaceStore.getState().layout.focused === paneId) view.focus();
      } catch (e) {
        if (run.cancelled) return;
        reportError(e);
        useWorkspaceStore.getState().close(activePath);
      }
    })();
    return () => {
      run.cancelled = true;
    };
  }, [activePath, reloadNonce, makeState, flushNow, paneId]);

  // Hidden tabs whose tab was closed no longer need their state.
  useEffect(() => {
    for (const p of [...stash.current.keys()]) {
      if (!tabs.includes(p)) stash.current.delete(p);
    }
  }, [tabs]);

  // Keep link resolution and settings in sync without recreating the state.
  useEffect(() => {
    viewRef.current?.dispatch({
      effects: configCompartment.current.reconfigure(previewConfig.of(previewCfg)),
    });
  }, [previewCfg]);

  useEffect(() => {
    viewRef.current?.dispatch({
      effects: spellCompartment.current.reconfigure(
        EditorView.contentAttributes.of({ spellcheck: String(spellcheck) }),
      ),
    });
  }, [spellcheck]);

  // --- external changes ---------------------------------------------------------------------

  useEffect(() => {
    let unlisten: (() => void) | undefined;
    let disposed = false;
    void onFileChanged((ev) => {
      // A hidden tab changed on disk: drop its cached state; it is re-read when shown again.
      for (const p of ev.paths) stash.current.delete(p);
      const s = session.current;
      const view = viewRef.current;
      if (!view || s.path === null || !ev.paths.includes(s.path)) return;
      const path = s.path;
      if (ev.kind === "removed") {
        void api.readNote(path).catch(() => {
          if (session.current.path !== path) return;
          const message = session.current.dirty
            ? `“${path}” was deleted outside Mimer. Your unsaved text will recreate it when saved.`
            : `“${path}” was deleted outside Mimer.`;
          useUiStore.getState().toast(message, "error");
          if (!session.current.dirty) useWorkspaceStore.getState().close(path);
        });
        return;
      }
      void api
        .readNote(path)
        .then((note) => {
          if (session.current.path !== path) return;
          if (note.content === s.lastDisk) return; // our own write
          const current = view.state.doc.toString();
          if (note.content === current) {
            s.lastDisk = note.content;
            return;
          }
          if (!s.dirty) {
            view.dispatch({
              changes: { from: 0, to: view.state.doc.length, insert: note.content },
              annotations: [fromDisk.of(true), Transaction.addToHistory.of(false)],
            });
            s.lastDisk = note.content;
          } else {
            useEditorStore.getState().setConflict({ path, diskContent: note.content }, paneId);
          }
        })
        .catch(() => undefined);
    }).then((fn) => {
      if (disposed) fn();
      else unlisten = fn;
    });
    return () => {
      disposed = true;
      unlisten?.();
    };
  }, [paneId]);

  const keepMine = useCallback(async () => {
    const c = useEditorStore.getState().conflicts[paneId];
    if (!c) return;
    try {
      // The external version is on disk right now: commit it before overwriting.
      await api.commitNow({ kind: "snapshotBeforeReload", detail: c.path }, [c.path]);
      useEditorStore.getState().setConflict(null, paneId);
      await save();
    } catch (e) {
      reportError(e);
    }
  }, [save, paneId]);

  const loadDisk = useCallback(async () => {
    const c = useEditorStore.getState().conflicts[paneId];
    const view = viewRef.current;
    if (!c || !view) return;
    try {
      const mine = view.state.doc.toString();
      await api.commitNow({ kind: "snapshotBeforeReload", detail: c.path }, [c.path]);
      await api.writeNote(c.path, mine);
      await api.commitNow({ kind: "snapshotBeforeReload", detail: `${c.path} (unsaved edits)` }, [
        c.path,
      ]);
      await api.writeNote(c.path, c.diskContent);
      view.dispatch({
        changes: { from: 0, to: view.state.doc.length, insert: c.diskContent },
        annotations: [fromDisk.of(true), Transaction.addToHistory.of(false)],
      });
      const s = session.current;
      s.lastDisk = c.diskContent;
      s.dirty = false;
      if (s.timer) clearTimeout(s.timer);
      useEditorStore.getState().setConflict(null, paneId);
      useEditorStore.getState().markSaved(false, paneId);
    } catch (e) {
      reportError(e);
    }
  }, [paneId]);

  return { viewRef, session, save, keepMine, loadDisk };
}
