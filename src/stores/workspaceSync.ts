import { saveLayout } from "@/lib/workspacePersistence";
import { focusedActive, layoutPersistence, useWorkspaceStore } from "./workspaceStore";
import { useRecent } from "./recentStore";
import { useVaultStore } from "./vaultStore";

// Keeps the rest of the app working unchanged: `vaultStore.activePath` is the active tab of the
// focused pane, and the layout is saved per vault (debounced).

let saveTimer: ReturnType<typeof setTimeout> | null = null;

useWorkspaceStore.subscribe((state) => {
  const next = focusedActive(state.layout);
  const vault = useVaultStore.getState();
  if (vault.activePath !== next) {
    useVaultStore.setState({ activePath: next, selectedPath: next ?? vault.selectedPath });
    if (next !== null && /\.md$/i.test(next)) useRecent.getState().push(next);
  }
  const vaultPath = vault.vault?.path;
  if (vaultPath === undefined || layoutPersistence.paused) return;
  if (saveTimer) clearTimeout(saveTimer);
  const layout = state.layout;
  saveTimer = setTimeout(() => {
    saveTimer = null;
    saveLayout(vaultPath, layout);
  }, 300);
});
