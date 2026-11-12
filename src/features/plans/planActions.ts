import type { Task } from "@/bindings/Task";
import { api } from "@/lib/api";
import { fileNameFrom } from "@/lib/noteTitle";
import {
  addChild,
  indentAt,
  joinText,
  moveBy,
  nodeAt,
  outdentAt,
  removeAt,
  setText,
  splitText,
  type NodePath,
  type PlanNode,
} from "@/lib/planTree";
import { useTaskStore } from "@/stores/taskStore";
import { reportError, useUiStore } from "@/stores/uiStore";
import { useVaultStore } from "@/stores/vaultStore";
import { planHome, usePlanStore } from "@/stores/planStore";
import { linkTarget, taskTarget } from "./nodeInfo";

/** The words of the idea at `path` in the open plan. */
export function plainAt(path: NodePath): string {
  const n = nodeAt(usePlanStore.getState().nodes, path);
  return n ? splitText(n.text).plain : "";
}

/** Writes a link to the note at `notePath` on the idea at `path`. */
export async function linkNoteTo(path: NodePath, notePath: string): Promise<void> {
  const target = linkTarget(notePath);
  await usePlanStore.getState().edit((nodes) => {
    const n = nodeAt(nodes, path);
    if (!n) return nodes;
    const { plain, links } = splitText(n.text);
    if (links.includes(target)) return nodes;
    return setText(nodes, path, joinText(plain, [...links, target]));
  });
}

/** The epic of a plan (named after it), made when it is not there: in the plan's project if it has one. */
export function epicOfPlan(plan: string): Promise<string | null> {
  const folder = planHome(plan).epics;
  return folder === undefined
    ? useTaskStore.getState().epicFor(plan)
    : useTaskStore.getState().epicFor(plan, folder);
}

/**
 * Makes a task of the idea: it is added to the epic made for the plan (the epic Mimer makes for a
 * note, with a link back). The idea itself stays where it is and shows the task.
 */
export async function makeTask(path: NodePath): Promise<void> {
  const plan = usePlanStore.getState().path;
  const text = plainAt(path);
  if (plan === null || text === "") return;
  const epic = await epicOfPlan(plan);
  if (epic === null) return;
  await useTaskStore.getState().addToNote(epic, [text]);
  await useTaskStore.getState().load();
  const made = useTaskStore.getState().tasks.find((t) => t.path === epic && t.title === text);
  if (made) await linkTaskTo(path, made);
  useUiStore.getState().toast(`Made the task “${text}”.`, "success");
}

/** Ties an existing task to the idea (a task the idea had before is let go). */
export async function linkTaskTo(path: NodePath, task: Task): Promise<void> {
  const target = taskTarget(task.path, task.title);
  await usePlanStore.getState().edit((nodes) => {
    const n = nodeAt(nodes, path);
    if (!n) return nodes;
    const { plain, links } = splitText(n.text);
    const keep = links.filter((l) => !l.includes("#"));
    return setText(nodes, path, joinText(plain, [...keep, target]));
  });
}

/** Makes a note named after the idea, next to the plan, and links the idea to it. */
export async function makeNote(path: NodePath): Promise<void> {
  const plan = usePlanStore.getState();
  const text = plainAt(path);
  if (plan.path === null || text === "") return;
  try {
    const folder = planHome(plan.path).notes;
    const taken = new Set(useVaultStore.getState().files);
    const name = fileNameFrom(text);
    let note = `${folder === "" ? "" : `${folder}/`}${name}.md`;
    for (let i = 2; taken.has(note); i++) {
      note = `${folder === "" ? "" : `${folder}/`}${name} ${String(i)}.md`;
    }
    await api.writeNote(note, `# ${text}\n\nPart of [[${linkTarget(plan.path)}]].\n\n`);
    await useVaultStore.getState().refreshTree();
    await linkNoteTo(path, note);
    useUiStore.getState().toast(`Made the note “${text}”.`, "success", {
      label: "Open",
      run: () => {
        void useVaultStore.getState().openNote(note);
      },
    });
  } catch (e) {
    reportError(e);
  }
}

/** Takes the idea out, with everything under it. The note's History has it. */
export async function removeIdea(path: NodePath): Promise<void> {
  const text = plainAt(path);
  const ok = await usePlanStore.getState().edit((nodes) => ({
    nodes: removeAt(nodes, path),
    path: null,
  }));
  if (ok) {
    useUiStore
      .getState()
      .toast(`Deleted “${text}”. It is in the plan's History if you want it back.`, "success");
  }
}

export const move = (path: NodePath, delta: -1 | 1) =>
  usePlanStore.getState().edit((nodes) => moveBy(nodes, path, delta));
export const indent = (path: NodePath) =>
  usePlanStore.getState().edit((nodes) => indentAt(nodes, path));
export const outdent = (path: NodePath) =>
  usePlanStore.getState().edit((nodes) => outdentAt(nodes, path));

/** Adds an idea as the last one under `parent` (the top level for `[]`). */
export async function addIdea(parent: NodePath, text: string): Promise<void> {
  const t = text.trim();
  if (t === "") return;
  await usePlanStore.getState().edit((nodes) => addChild(nodes, parent, t));
}

/** Adds a whole tree of ideas as the last ones under `parent` (the top level for `[]`). */
export async function addTree(parent: NodePath, tree: readonly PlanNode[]): Promise<void> {
  if (tree.length === 0) return;
  await usePlanStore.getState().edit((nodes) => {
    let acc = nodes;
    const add = (at: NodePath, list: readonly PlanNode[]): void => {
      for (const n of list) {
        const r = addChild(acc, at, n.text);
        acc = r.nodes;
        add(r.path, n.children);
      }
    };
    add(parent, tree);
    return acc;
  });
}

/** One entry of the menu of an idea. */
export interface NodeAction {
  id: string;
  label: string;
  run: () => void;
  needsAi?: boolean;
}

/** What can be done with the idea at `path` (the same in the outline's menu and the map's panel). */
export function nodeActions(path: NodePath): NodeAction[] {
  const store = usePlanStore.getState();
  return [
    {
      id: "parts",
      label: "Break it down…",
      needsAi: true,
      run: () => {
        store.setDialog({ kind: "parts", path });
      },
    },
    {
      id: "sub",
      label: "Add a sub-idea",
      run: () => {
        store.setAdding(path);
      },
    },
    {
      id: "epic",
      label: "Link or make an epic…",
      run: () => {
        store.setDialog({ kind: "epic", path });
      },
    },
    {
      id: "task",
      label: "Link or make a task…",
      run: () => {
        store.setDialog({ kind: "linktask", path });
      },
    },
    {
      id: "link",
      label: "Link or make a note…",
      run: () => {
        store.setDialog({ kind: "link", path });
      },
    },
    {
      id: "repeat",
      label: "Repeat these steps for…",
      run: () => {
        store.setDialog({ kind: "repeat", path });
      },
    },
    {
      id: "up",
      label: "Move up",
      run: () => {
        void move(path, -1);
      },
    },
    {
      id: "down",
      label: "Move down",
      run: () => {
        void move(path, 1);
      },
    },
    {
      id: "in",
      label: "One level in",
      run: () => {
        void indent(path);
      },
    },
    {
      id: "out",
      label: "One level out",
      run: () => {
        void outdent(path);
      },
    },
    {
      id: "delete",
      label: "Delete",
      run: () => {
        void removeIdea(path);
      },
    },
  ];
}
