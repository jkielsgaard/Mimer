import { useMemo } from "react";
import type { ProviderConfig } from "@/bindings/ProviderConfig";
import type { Settings } from "@/bindings/Settings";
import { cloudConsented } from "@/lib/aiChoice";
import { effectiveLocation } from "@/lib/providers";
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
  // The same rule as the backend (`ai::router::select_notes`): a provider on this computer, or
  // the cloud AI the user agreed to, but never for a project marked Local AI only.
  const localOnly = project?.localOnly === true;
  const allowed = (p: ProviderConfig) =>
    effectiveLocation(p) === "local" ||
    (!localOnly && settings !== null && cloudConsented(settings, p));
  const own = settings?.ai.providers.find((p) => p.id === project?.providerId && allowed(p));
  const chosen = own ?? settings?.ai.providers.find((p) => p.id === settings.ai.defaultProviderId);
  const provider =
    chosen && !allowed(chosen)
      ? localOnly
        ? settings?.ai.providers.find((p) => effectiveLocation(p) === "local")
        : chosen
      : chosen;
  const cloud = provider !== undefined && effectiveLocation(provider) === "cloud";
  return { project, provider, cloud };
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
