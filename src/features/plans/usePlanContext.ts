import { useMemo } from "react";
import { epicGroups } from "@/lib/taskLogic";
import { useTaskStore } from "@/stores/taskStore";
import { useVaultStore } from "@/stores/vaultStore";
import type { InfoContext } from "./nodeInfo";

/** What a plan needs to know about the rest of the vault to show its ideas: epics, tasks, links. */
export function usePlanContext(planPath: string | null): InfoContext {
  const tasks = useTaskStore((s) => s.tasks);
  const epics = useTaskStore((s) => s.epics);
  const epicOrder = useTaskStore((s) => s.epicOrder);
  const resolver = useVaultStore((s) => s.resolver);
  const groups = useMemo(() => epicGroups(tasks, epics, epicOrder), [tasks, epics, epicOrder]);
  // The epic Mimer made for the plan ("Make a task") is the one that points back at the note.
  const planEpic =
    planPath === null
      ? null
      : (epics.find((e) => e.source !== null && resolver.resolve(e.source) === planPath)?.path ??
        null);
  return { resolver, groups, planEpic, tasks };
}
