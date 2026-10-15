> **Status: implemented.** See docs/DECISIONS.md and docs/START-GUIDE.md. The text below is the original plan.

# Feature 1 – Tabs and split view

Branch: `feat/tabs`. Read [README.md](README.md) first. **This is the biggest change to existing code of the six features**: it changes how the editor is mounted. Work in the exact order of the tasks; every task leaves the app working.

## What the user gets

- Several notes open at once, shown as tabs above the editor (click to switch, × or middle-click to close, drag to reorder).
- A **split view**: two editors side by side, each with its own tabs.
- Shortcuts: `Mod+W` close tab · `Mod+PageDown` / `Mod+PageUp` next / previous tab · `Mod+\` open the current note in a split / close the split.
- The open tabs and the split are remembered per vault between restarts.

## Decisions (already made – do not change)

| Question                                    | Decision                                                                                                                                                                | Why                                                                              |
| ------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| Can one note be open in both panes?         | **No.** Opening a note that is already open anywhere just focuses that tab                                                                                              | Two live buffers of the same file would need synchronisation; avoided on purpose |
| How many panes?                             | 1 or 2 (`primary`, `secondary`)                                                                                                                                         | Spec §13 only asks for tabs/split; keep it simple                                |
| Unsaved edits in background tabs?           | **There are none.** Before a tab is hidden, its buffer is written to disk (`flush`) and an `Autosave: <path>` commit is made (spec trigger "switching to another note") | Removes the hard "dirty background tab" problem                                  |
| What is kept for a hidden tab?              | Its CodeMirror `EditorState` (cursor, scroll anchor, undo history) in a `Map<path, EditorState>` inside the pane's editor component                                     | Cheap and keeps undo history                                                     |
| External change to a hidden tab's file      | Drop its cached state (it is re-read when the tab is shown next)                                                                                                        | Hidden tabs are always clean                                                     |
| What does `vaultStore.activePath` mean now? | The **active tab of the focused pane**. It is kept in sync automatically so chat, backlinks, history and the status bar keep working unchanged                          | Avoids touching every consumer                                                   |
| Persistence                                 | `safeStorage` key `mimer.workspace.<vaultPath>` (try/catch wrapper already exists)                                                                                      | Spec §9 says UI layout lives in localStorage                                     |

---

## Tasks

### Task 1.1 – `workspaceStore` (pure logic first, with tests)

**Files:** create `src/stores/workspaceStore.ts` and `src/stores/workspaceStore.test.ts`.

Types:

```ts
export type PaneId = "primary" | "secondary";
export interface Pane {
  id: PaneId;
  tabs: string[];
  active: string | null;
}
export interface WorkspaceLayout {
  panes: Pane[];
  focused: PaneId;
}
```

First write **pure helper functions** (exported, no Zustand) that take a `WorkspaceLayout` and return a new one. They are easy to test:

| Function                               | Behaviour                                                                                                                                                                                                                                                                          |
| -------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `openPath(layout, path, pane?)`        | If `path` is open in any pane → set that pane's `active = path` and `focused` to that pane (no duplicates). Otherwise add it at the end of `pane` (default: the focused pane), make it active, focus that pane. If `pane` is `"secondary"` and no secondary pane exists, create it |
| `closePath(layout, path)`              | Remove from its pane. If it was active, the new active is the tab to its right, else to its left, else `null`. If the **secondary** pane becomes empty, remove it and focus `primary`                                                                                              |
| `activate(layout, pane, path)`         | Set active + focus (ignore if the tab is not in that pane)                                                                                                                                                                                                                         |
| `focusPane(layout, pane)`              | Ignore if the pane does not exist                                                                                                                                                                                                                                                  |
| `reorder(layout, pane, from, to)`      | Move a tab inside a pane                                                                                                                                                                                                                                                           |
| `moveToPane(layout, path, to, index?)` | Remove from the current pane, insert into `to` (create secondary if needed, drop an emptied secondary), make it active in `to` and focus `to`                                                                                                                                      |
| `unsplit(layout)`                      | Append the secondary's tabs to the primary, keep the focused tab active, remove the secondary                                                                                                                                                                                      |
| `renamePaths(layout, from, to)`        | Every tab equal to `from` or starting with `from + "/"` is rewritten (`to + rest`); `active` too                                                                                                                                                                                   |
| `removePaths(layout, prefix)`          | Close every tab equal to or inside `prefix` (used after deleting a file/folder)                                                                                                                                                                                                    |
| `filterExisting(layout, files)`        | Drop tabs that are not in `files` (used when restoring)                                                                                                                                                                                                                            |
| `focusedActive(layout)`                | `active` of the focused pane, or `null`                                                                                                                                                                                                                                            |
| `emptyLayout()`                        | `{ panes: [{ id: "primary", tabs: [], active: null }], focused: "primary" }`                                                                                                                                                                                                       |

Then the Zustand store `useWorkspaceStore` wraps them: state `{ layout }` + actions `open`, `close`, `activate`, `focusPane`, `reorder`, `moveToPane`, `unsplit`, `renamePaths`, `removePaths`, `restore(layout)`, `reset()`. Every action does `set({ layout: helper(get().layout, …) })`.

**Tests (at least these):** open dedupes across panes · closing the active tab picks the right neighbour, then the left, then null · closing the last tab of the secondary removes it and focuses primary · `moveToPane` creates the secondary and removes it again when emptied · `unsplit` keeps all tabs, no duplicates · `renamePaths` handles a file and a folder prefix and does not touch `Workshop/x.md` when renaming `Work` · `removePaths` closes everything inside a folder · `filterExisting`.

**Done when:** `pnpm test workspaceStore` passes.

### Task 1.2 – Keep `vaultStore.activePath` in sync

**Files:** create `src/stores/workspaceSync.ts`; edit `src/stores/vaultStore.ts`, `src/main.tsx` (import once: `import "./stores/workspaceSync"`).

1. `workspaceSync.ts`:
   ```ts
   useWorkspaceStore.subscribe((s) => {
     const next = focusedActive(s.layout);
     if (useVaultStore.getState().activePath !== next) {
       useVaultStore.setState({
         activePath: next,
         selectedPath: next ?? useVaultStore.getState().selectedPath,
       });
     }
   });
   ```
2. `vaultStore.openNote(path)` becomes:
   ```ts
   openNote: async (path) => {
     if (path === null) {
       const a = get().activePath;
       if (a !== null) useWorkspaceStore.getState().close(a);
       return;
     }
     await flushPendingWrites(); // keep: the editor flushes its own buffer
     useWorkspaceStore.getState().open(path);
   };
   ```
   **Remove** the `commitNow({kind:"autosave"})` call from here – it moves into the editor's tab-switch logic (Task 1.5) so it also runs when the user switches tabs.
3. `renamePath`: replace the code that computes `nextActive` with `useWorkspaceStore.getState().renamePaths(from, to)`; keep `set({ selectedPath: to })` and the `reloadNonce` bump.
4. `deletePath`: replace the `activePath` handling with `useWorkspaceStore.getState().removePaths(path)`.
5. `openVault` and `closeVault`: call `useWorkspaceStore.getState().reset()` before loading/after closing (restore comes in 1.10).
6. `src/App.test.tsx` sets `useVaultStore.setState({ activePath: … })` directly in `beforeEach`; add `useWorkspaceStore.getState().reset()` there too.

**Done when:** the app still behaves exactly as before with one note at a time (run `pnpm test` and `pnpm tauri dev`: open, rename, delete notes).

### Task 1.3 – Flush registry supports several editors

**Files:** `src/lib/flush.ts`, `src/lib/flush.test.ts` (new)

Change the registry from one function to a `Set<Flusher>`:

```ts
const flushers = new Set<Flusher>();
export function registerFlusher(fn: Flusher): () => void {
  flushers.add(fn);
  return () => {
    flushers.delete(fn);
  };
}
export async function flushPendingWrites(): Promise<void> {
  await Promise.all([...flushers].map((f) => f()));
}
```

**Tests:** two registered flushers are both called; after unregistering one, only the other runs; errors in one flusher reject the promise (use `Promise.all`).

### Task 1.4 – `editorStore` becomes per pane

**Files:** `src/stores/editorStore.ts`, `src/stores/editorStore.test.ts`, `src/components/layout/StatusBar.tsx`

1. State: `statuses: Record<PaneId, SaveStatus>` and `conflicts: Record<PaneId, Conflict | null>` (initial `saved` / `null`).
2. Every action gets an optional last parameter `pane: PaneId = "primary"`: `markUnsaved(pane)`, `markSaving(pane)`, `markSaved(stillDirty, pane)`, `setConflict(c, pane)`, `reset(pane?)` (no argument = reset both).
3. Export a hook `useFocusedSaveStatus()` = `useEditorStore((s) => s.statuses[useWorkspaceStore((w) => w.layout.focused)])` (read the focused pane first, then the status). `StatusBar` uses it instead of `s.saveStatus`.
4. Update the existing editorStore tests to read `statuses.primary` / `conflicts.primary`; add one test that two panes keep independent status.
5. `vaultStore` calls `useEditorStore.getState().reset()` – still fine (resets both).

### Task 1.5 – Refactor `Editor` into a per-pane component

**Files:** `src/features/editor/Editor.tsx` (edit), keep `InlineAiPopup` as is.

Change the signature to `export function Editor({ paneId }: { paneId: PaneId })`. Work through these steps in order:

1. **Active path comes from the workspace**, not `vaultStore`:
   `const activePath = useWorkspaceStore((s) => s.layout.panes.find((p) => p.id === paneId)?.active ?? null);`
   and `const tabs = useWorkspaceStore((s) => s.layout.panes.find(p => p.id === paneId)?.tabs ?? [])`.
2. Add `const stash = useRef(new Map<string, EditorState>());` and keep the existing `session` ref (it describes the **currently shown** document only).
3. Replace the `useEffect` that loads notes with a version that handles switching. Pseudocode:
   ```ts
   useEffect(() => {
     const run = { cancelled: false };
     void (async () => {
       const view = viewRef.current;
       if (!view) return;
       const s = session.current;
       const prev = s.path;
       if (prev !== null && prev !== activePath) {
         await flush(); // write buffer to disk (same function the flusher uses)
         if (run.cancelled) return;
         stash.current.set(prev, view.state); // keep cursor + undo history
         if (tabs.includes(prev))
           void api.commitNow({ kind: "autosave", detail: prev }, [prev]).catch(reportError);
         else stash.current.delete(prev); // tab was closed: commit too (see 1.8), no stash
       }
       if (activePath === null || !isMarkdown(activePath)) {
         /* same empty handling as today */ return;
       }
       const cached = stash.current.get(activePath);
       if (cached) {
         stash.current.delete(activePath);
         s.path = activePath;
         s.lastDisk = cached.doc.toString();
         s.dirty = false;
         view.setState(cached);
         markSaved(false, paneId);
         return;
       }
       /* otherwise: read the note and create state, exactly like today */
     })();
     return () => {
       run.cancelled = true;
     };
   }, [activePath, reloadNonce, makeState]);
   ```
   **Important:** when a stashed state is restored, `lastDisk` must be set to the text that is on disk. Because hidden tabs are always flushed this equals `cached.doc.toString()`, **unless** the file changed externally while hidden – that case is handled by step 5 (state dropped).
4. When `reloadNonce` changes: `stash.current.clear()` at the top of the effect (all hidden tabs are re-read next time).
5. In the `onFileChanged` listener: if `ev.paths` contains a path that is in `stash.current` (a hidden tab) → `stash.current.delete(path)` and return. The existing logic stays for the shown document.
6. Clean up closed tabs: `useEffect(() => { for (const p of [...stash.current.keys()]) if (!tabs.includes(p)) stash.current.delete(p); }, [tabs]);`
7. Replace every `useEditorStore.getState().markX()` call with the pane version (`markX(…, paneId)`), the conflict banner reads `conflicts[paneId]`.
8. `registerFlusher` already registers per component instance (Task 1.3 made that safe).
9. Mark the pane as focused: wrap the root `div` with `onFocusCapture={() => useWorkspaceStore.getState().focusPane(paneId)}` and `onMouseDownCapture` doing the same.
10. The "No note open" overlay and read-only rule stay per pane (with no active tab the pane is read-only – do not remove that).

**Done when:** with the single primary pane, opening note A, typing, opening note B, going back to A restores A with its cursor and undo history; `git log` shows `Autosave: A.md` after switching.

### Task 1.6 – `TabBar` component

**Files:** create `src/features/workspace/TabBar.tsx` and `TabBar.test.tsx`.

Props: `{ paneId: PaneId }`. Reads the pane from `useWorkspaceStore`; save status from `useEditorStore` (`statuses[paneId]`).

Markup requirements (accessibility is tested):

- container `role="tablist"` `aria-label="Open notes"` (horizontal scroll: `overflow-x-auto`);
- each tab: `role="tab"` `aria-selected`, shows `noteTitle(path)` (from `@/lib/utils`), `title={path}` tooltip, a dirty dot `●` when it is the active tab and `statuses[paneId] !== "saved"`, and a close button `aria-label={`Close ${title}`}`;
- click → `activate(paneId, path)` then `vaultStore.openNote`-style focus is handled by the store; middle-click (`onAuxClick` with `button === 1`) → close; close button `onClick` with `stopPropagation()`.
- **Closing** goes through a helper `closeTab(path)` in `src/lib/actions.ts`: `await flushPendingWrites(); await api.commitNow({kind:"autosave", detail:path},[path]); useWorkspaceStore.getState().close(path);` (the commit is skipped by the backend when nothing changed – no empty commits).
- **Drag & drop:** `draggable`; `onDragStart` sets `dataTransfer.setData("application/x-mimer-tab", JSON.stringify({ path, from: paneId }))`; `onDragOver` on the tab bar and on tabs calls `preventDefault` when the type is present; `onDrop` calculates the target index from the tab under the cursor (`dataset.index`) and calls `reorder` (same pane) or `moveToPane` (other pane).
- **Context menu** (Radix `ContextMenu`, same style as `FileTree`): Close · Close others · Close all · Open in split view / Move to other pane · Reveal in file manager (`api.revealInFileManager`).

**Tests:** renders tabs in order with titles; clicking activates; close button closes and does not activate; the active tab shows the dirty dot when status is `unsaved`; middle click closes; (drag and drop: test the pure helper that computes the drop index instead of simulating DnD).

### Task 1.7 – `EditorArea` (one or two panes)

**Files:** create `src/features/workspace/EditorPane.tsx` (TabBar + Editor in a column) and `src/features/workspace/EditorArea.tsx`; edit `src/components/layout/AppShell.tsx`.

1. `EditorPane({ paneId })` = `<div className="flex h-full min-h-0 flex-col"><TabBar paneId={paneId} /><div className="min-h-0 flex-1"><Editor paneId={paneId} /></div></div>`, with a 2 px top border in `border-primary` when `layout.focused === paneId` and the split is active.
2. `EditorArea`: if one pane → `<EditorPane paneId="primary" />`. If two → a nested `PanelGroup direction="horizontal" autoSaveId="mimer-split" storage={panelStorage}` (reuse the `panelStorage` object – export it from `AppShell` or move it to `src/lib/safeStorage.ts`) with two `Panel`s (ids `split-primary` / `split-secondary`, `minSize={20}`) and a `PanelResizeHandle` styled like the others. Give each Panel `order` so the layout library stays consistent when the second panel appears/disappears.
3. In `AppShell`, replace `<Editor />` by `<EditorArea />`.

**Done when:** the app looks the same with one pane except for the tab bar on top.

### Task 1.8 – Opening in split and closing the split

**Files:** `src/lib/actions.ts`, `src/features/fileTree/FileTree.tsx`, `src/features/workspace/TabBar.tsx`

Actions in `actions.ts`:

- `openInSplit(path)`: `await flushPendingWrites()` then `useWorkspaceStore.getState().moveToPane(path, "secondary")` – if the path is not open yet, `open(path, "secondary")`.
- `toggleSplit()`: if two panes → `unsplit()`; else if there is an active note with at least two tabs → move the active note to the secondary pane; with one tab → open the same note... **no** (a note cannot be open twice): show a toast "Open another note first, then split." and return.
- `closeActiveTab()` for `Mod+W`.
- `cycleTab(delta: 1 | -1)`: within the focused pane, wrap around.

Wire: FileTree context menu item "Open in split view" for markdown files; TabBar context menu item (Task 1.6).

### Task 1.9 – Shortcuts

**Files:** `src/lib/shortcuts.ts`, `src/App.tsx`, `src/lib/shortcuts.test.ts`

`matchShortcut` lower-cases `e.key`, so `"Mod+w"`, `"Mod+PageDown"` (`e.key === "PageDown"`) and `"Mod+\\"` (`e.key === "\\"`) work as written. Add to `bindings` in `App.tsx`:

```ts
"Mod+w": () => void closeActiveTab(),
"Mod+PageDown": () => cycleTab(1),
"Mod+PageUp": () => cycleTab(-1),
"Mod+\\": () => void toggleSplit(),
```

Add matching tests in `shortcuts.test.ts`. Note: **Cmd+W on macOS** closes the window by default in some setups – `preventDefault` in the handler (already done by `useShortcuts`) is enough in the Tauri webview; confirm in the manual tests. Add the new shortcuts to the README shortcut table.

### Task 1.10 – Persistence

**Files:** create `src/lib/workspacePersistence.ts` + test; edit `src/stores/workspaceSync.ts`, `src/stores/vaultStore.ts`.

1. `saveLayout(vaultPath, layout)` / `loadLayout(vaultPath): WorkspaceLayout | null` using `safeStorage` and `JSON.stringify`; `loadLayout` must **validate the shape** (arrays of strings, `focused` is a known pane) and return `null` on any problem (never throw).
2. In `workspaceSync.ts`: debounce (300 ms) a `saveLayout` call on every layout change when a vault is open (`useVaultStore.getState().vault?.path`).
3. In `vaultStore.openVault`, **after** `refreshTree()`: `const saved = loadLayout(vault.path); if (saved) useWorkspaceStore.getState().restore(filterExisting(saved, get().files));`.
4. A restored layout must not trigger commits (no previous note is shown, so the editor's switch logic has nothing to commit – verify).

**Tests:** round trip; corrupt JSON → `null`; wrong shapes → `null`; missing files are dropped by `filterExisting`.

### Task 1.11 – Window title, status bar, other consumers

Check (and fix if needed) these places still use `vaultStore.activePath`, which is now the focused pane's active tab: `Header.tsx` title, `StatusBar`, `useActiveAi`, `BacklinksPanel`, `HistoryPanel`, `ChatPanel` ("Include current note"), `actions.saveActiveNote`. They should need **no changes**; the task is to verify by running the app with a split open and clicking between panes: the right panel must follow the focused pane.

### Task 1.12 – Tests, docs

- Update `App.test.tsx` smoke test: opening a note shows a tab with its title (`screen.getByRole("tab", { name: /Home/ })`).
- Add an integration-style test (jsdom): open two notes via `useVaultStore.getState().openNote`, assert two tabs, assert switching calls `api.commitNow` with `autosave` for the first note.
- `CHANGELOG.md`, README (feature list + shortcut table), `docs/DECISIONS.md` (decision table above), manual tests below.

---

## Tests summary (automated)

workspaceStore (all helpers) · flush registry · editorStore per pane · TabBar · shortcuts · workspacePersistence · smoke test (tab appears) · switch-commits-autosave.

## Manual tests to add (README section "15. Tabs and split view")

- [ ] Click two notes in the tree: two tabs appear; clicking a tab switches; the first note keeps its cursor position and **Ctrl+Z** still undoes its last edit.
- [ ] Switching tabs creates `Autosave: <path>` in `git log` only if the note changed.
- [ ] Open a note that is already open in another tab: no duplicate; that tab is focused.
- [ ] Close a tab with × and with middle-click; closing the active tab selects its neighbour.
- [ ] Drag a tab to reorder; drag a tab onto the other pane while split.
- [ ] `Mod+\` with two tabs puts the active note in a second pane; again closes the split and all tabs are back in the first pane. With one tab it shows the "Open another note first" toast.
- [ ] In a split, click in each pane: the right panel (Backlinks/History/Assistant), the status bar and the window title follow the focused pane. Typing in the left pane shows "Unsaved changes" only for that pane's status while focused.
- [ ] Rename an open note in the tree: its tab shows the new name. Delete an open note: its tab closes. Delete a folder containing two open notes: both tabs close.
- [ ] Edit an open note in another program while it is a **hidden** tab: switching to it shows the new text. Edit it while it is shown and clean: it updates silently; while dirty: the conflict banner appears (pane-local).
- [ ] Quit with two tabs and a split open, restart: the same tabs and split are restored. Delete one of the files while Mimer is closed: that tab is simply missing.
- [ ] Close the window while two panes both have unsaved text: both are saved (`Autosave on close`).
- [ ] `Mod+W` closes the tab (not the window); `Mod+PageDown/PageUp` cycle tabs.
- [ ] Inline AI (`Mod+K`) works in the **secondary** pane and replaces text in that pane's note.

## Pitfalls

- Never mount two `EditorView`s for the same file (the "one note, one pane" rule prevents it – do not add a way around it).
- The editor effect must read `tabs` through a ref or the dependency list correctly; ESLint's `exhaustive-deps` warning is a hint, not noise.
- `react-resizable-panels` needs stable `id`/`order` on conditionally rendered panels, otherwise it throws "Panel data not found" – always set both.
- When a tab is closed its stash entry must be deleted (memory), and the **commit** must still happen: call `closeTab()` from `actions.ts`, never `workspace.close()` directly from UI code.
- Do not `await` inside Zustand `set` callbacks; compute first, then `set`.
