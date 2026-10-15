import { useSettingsStore } from "@/stores/settingsStore";
import { useUiStore } from "@/stores/uiStore";
import { ProjectForm } from "./ProjectForm";

/** Make project / Project settings dialog. */
export function ProjectDialog() {
  const state = useUiStore((s) => s.projectDialog);
  const settings = useSettingsStore((s) => s.settings);
  if (!state || !settings) return null;
  return (
    <ProjectForm
      key={`${state.folder}|${state.project?.id ?? "new"}`}
      state={state}
      settings={settings}
    />
  );
}
