import type { Skill } from "@/bindings/Skill";
import { activeAi } from "@/features/chat/useActiveAi";
import { api } from "@/lib/api";
import { aiBlocked } from "@/lib/aiStatus";
import { wakeIfNeeded } from "@/lib/wake";
import { MAX_MENTIONS } from "@/lib/mentionQuery";
import { useChatStore } from "@/stores/chatStore";
import { useEngineStore } from "@/stores/engineStore";
import { useFoundryStore } from "@/stores/foundryStore";
import { useSettingsStore } from "@/stores/settingsStore";
import { useUiStore } from "@/stores/uiStore";
import { useVaultStore } from "@/stores/vaultStore";

/** Whether a skill is offered for a note (`isDir` false) or a folder (`isDir` true). */
export function skillFits(skill: Skill, isDir: boolean): boolean {
  return skill.appliesTo === "both" || skill.appliesTo === (isDir ? "folder" : "note");
}

/**
 * Why a skill cannot run now, or null when a local AI is ready. Skills work on notes, and notes
 * only ever go to a local AI, so one must be set up, started and reachable.
 */
export async function localAiProblem(): Promise<string | null> {
  const { provider } = activeAi(useSettingsStore.getState().settings, useVaultStore.getState());
  const blocked = aiBlocked(
    provider,
    useEngineStore.getState().status?.state,
    useFoundryStore.getState().status?.state,
  );
  if (blocked !== null || !provider) return blocked;
  if (provider.kind === "builtin" || provider.kind === "foundry_local") return wakeIfNeeded();
  try {
    const r = await api.testProvider(provider.id);
    return r.ok ? null : `${provider.name} is not reachable: ${r.message}`;
  } catch {
    return `${provider.name} is not reachable. Start it and try again.`;
  }
}

/** Runs a skill on the given notes or folders: attaches them, opens the assistant and sends. */
export async function runSkillOn(skill: Skill, paths: string[]): Promise<void> {
  const ui = useUiStore.getState();
  if (useChatStore.getState().streaming) {
    ui.toast(
      "Mimer is busy with another job. Wait for it, or press Stop, then try again.",
      "error",
    );
    return;
  }
  if (paths.length > MAX_MENTIONS) {
    ui.toast(`A skill can run on up to ${String(MAX_MENTIONS)} items at a time.`, "error");
    return;
  }
  const problem = await localAiProblem();
  if (problem !== null) {
    ui.toast(problem, "error");
    return;
  }
  useChatStore.setState({ draftMentions: paths, draftSkill: skill });
  ui.setAskOpen(true);
  void useChatStore.getState().send("");
}
