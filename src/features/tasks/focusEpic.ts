import { isOpen, type EpicGroup } from "@/lib/taskLogic";
import { useTaskStore } from "@/stores/taskStore";
import { useUiStore } from "@/stores/uiStore";

/** The task Focus starts on for an epic task: its first open one. */
export function firstOpenTask(group: EpicGroup) {
  return group.tasks.find(isOpen);
}

/** Opens Focus on a whole epic task, starting at its first open task. */
export function focusEpic(group: EpicGroup): void {
  const first = firstOpenTask(group);
  if (!first) return;
  useTaskStore.getState().select({ path: first.path, line: first.line, title: first.title });
  useUiStore.getState().setFocusOpen(true);
}
