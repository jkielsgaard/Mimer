import { useMemo } from "react";
import type { Settings } from "@/bindings/Settings";
import { useSettingsStore } from "@/stores/settingsStore";
import { currentFolder, projectForPath, useVaultStore, type VaultState } from "@/stores/vaultStore";

/** The project and provider that apply to the current selection. */
export function activeAi(
  settings: Settings | null,
  vault: Pick<VaultState, "projects" | "activePath" | "selectedPath" | "files" | "tree">,
) {
  const { projects, activePath, selectedPath, files, tree } = vault;
  const anchor = activePath ?? currentFolder({ activePath, selectedPath, files, tree });
  const project = projectForPath(projects, anchor === "" ? null : anchor);
  // A project provider that is not local (from an older version) is ignored, as in the backend.
  const own = settings?.ai.providers.find(
    (p) => p.id === project?.providerId && p.location === "local",
  );
  const provider =
    own ?? settings?.ai.providers.find((p) => p.id === settings.ai.defaultProviderId);
  return { project, provider };
}

/** The provider/project info shown in the chat header and status bar. */
export function useActiveAi() {
  const settings = useSettingsStore((s) => s.settings);
  const projects = useVaultStore((s) => s.projects);
  const activePath = useVaultStore((s) => s.activePath);
  const selectedPath = useVaultStore((s) => s.selectedPath);
  const files = useVaultStore((s) => s.files);
  const tree = useVaultStore((s) => s.tree);
  return useMemo(
    () => activeAi(settings, { projects, activePath, selectedPath, files, tree }),
    [settings, projects, activePath, selectedPath, files, tree],
  );
}
