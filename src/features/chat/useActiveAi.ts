import { useMemo } from "react";
import { useSettingsStore } from "@/stores/settingsStore";
import { currentFolder, projectForPath, useVaultStore } from "@/stores/vaultStore";

/** The provider/project info shown in the chat header and status bar. */
export function useActiveAi() {
  const settings = useSettingsStore((s) => s.settings);
  const projects = useVaultStore((s) => s.projects);
  const activePath = useVaultStore((s) => s.activePath);
  const selectedPath = useVaultStore((s) => s.selectedPath);
  const files = useVaultStore((s) => s.files);
  const tree = useVaultStore((s) => s.tree);
  return useMemo(() => {
    const anchor = activePath ?? currentFolder({ activePath, selectedPath, files, tree });
    const project = projectForPath(projects, anchor === "" ? null : anchor);
    const providerId = project?.providerId ?? settings?.ai.defaultProviderId;
    const provider = settings?.ai.providers.find((p) => p.id === providerId);
    return { project, provider, localOnly: project?.localOnly ?? false };
  }, [settings, projects, activePath, selectedPath, files, tree]);
}
