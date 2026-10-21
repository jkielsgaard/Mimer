import type { Task } from "@/bindings/Task";

/** A task with every field filled, for tests. */
export function makeTask(patch: Partial<Task> = {}): Task {
  return {
    path: "Møder/Acme.md",
    line: 5,
    end: 5,
    key: "key-1",
    title: "Renew the Acme licence",
    done: false,
    tags: [],
    due: null,
    plan: null,
    status: null,
    estMinutes: null,
    steps: [],
    log: [],
    note: "",
    ...patch,
  };
}
