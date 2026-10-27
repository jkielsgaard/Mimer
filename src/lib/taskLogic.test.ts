import { describe, expect, it } from "vitest";
import type { Task } from "@/bindings/Task";
import { INBOX, epicGroups, stepsFromAnswer, taskText } from "./taskLogic";

function task(patch: Partial<Task>): Task {
  return {
    path: "A.md",
    line: 0,
    end: 0,
    key: "k",
    title: "T",
    done: false,
    tags: [],
    due: null,
    plan: null,
    status: null,
    estMinutes: null,
    steps: [],
    log: [],
    note: "",
    made: null,
    link: null,
    ...patch,
  };
}

describe("taskText", () => {
  it("keeps what was typed as the title: date words are not read", () => {
    expect(taskText("  Call   Mette tomorrow ")).toBe("Call Mette tomorrow");
    expect(taskText("Pay the bill fri ~15m")).toBe("Pay the bill fri ~15m");
  });
});

describe("epicGroups", () => {
  it("puts the Inbox first and keeps the tasks in the order of the note", () => {
    const tasks = [
      task({ path: "Tasks/B.md", line: 4, title: "Second" }),
      task({ path: "Tasks/B.md", line: 2, title: "First", made: "2026-10-12" }),
      task({ path: INBOX, line: 1, title: "Quick" }),
    ];
    const epics = [
      { path: "Tasks/B.md", title: "B", source: null },
      { path: INBOX, title: "Inbox", source: null },
      { path: "Tasks/A.md", title: "A", source: null },
    ];
    const groups = epicGroups(tasks, epics);
    expect(groups.map((g) => g.title)).toEqual(["Inbox", "A", "B"]);
    const b = groups.find((g) => g.title === "B");
    expect(b?.tasks.map((t) => t.title)).toEqual(["First", "Second"]);
    expect(b?.made).toBe("2026-10-12");
  });
});

describe("stepsFromAnswer", () => {
  it("reads one step per line without bullets or numbers", () => {
    expect(
      stepsFromAnswer(
        "Here are the steps:\n1. List who has access\n- [ ] Ask Lene\n* **Write rules**\n\n",
      ),
    ).toEqual(["List who has access", "Ask Lene", "Write rules"]);
  });
});
