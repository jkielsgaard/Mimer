import { describe, expect, it } from "vitest";
import type { Task } from "@/bindings/Task";
import {
  INBOX,
  epicGroups,
  epicSummary,
  filterTasks,
  isQuiet,
  lastActivity,
  openThenDone,
  stepsFromAnswer,
  taskText,
  taskRef,
  afterTarget,
  latestLeftOff,
  leftOffLine,
  recentLeftOff,
} from "./taskLogic";

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
    waitingFor: null,
    history: [],
    after: null,
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

describe("openThenDone", () => {
  it("puts the open tasks first and the done ones last, each in the order of the note", () => {
    const a = task({ title: "A", line: 0, done: true });
    const b = task({ title: "B", line: 1 });
    const c = task({ title: "C", line: 2, done: true });
    const d = task({ title: "D", line: 3, status: "dropped" });
    const e = task({ title: "E", line: 4 });
    const { open, done } = openThenDone([a, b, c, d, e]);
    expect(open.map((t) => t.title)).toEqual(["B", "E"]);
    expect(done.map((t) => t.title)).toEqual(["A", "C", "D"]);
  });
});

describe("the overview of an epic", () => {
  const doing = task({ title: "A", line: 0, status: "doing" });
  const waits = task({ title: "B", line: 1, status: "waiting", waitingFor: "the vendor" });
  const waitsOnTask = task({ title: "C", line: 2, status: "waiting", after: "A/N#Other" });
  const plain = task({ title: "D", line: 3 });
  const finished = task({ title: "E", line: 4, done: true });
  const tasks = [doing, waits, waitsOnTask, plain, finished];

  it("counts what is being done and waited for, and finds the next task", () => {
    const sum = epicSummary({ tasks });
    expect(sum.doing).toBe(1);
    expect(sum.waiting).toBe(2);
    expect(sum.next?.title).toBe("A");
    expect(sum.waitingOn).toEqual(["the vendor", "C"]);
    expect(epicSummary({ tasks: [waits] }).next).toBeNull();
  });

  it("filters the tasks of an epic", () => {
    expect(filterTasks(tasks, "all")).toHaveLength(5);
    expect(filterTasks(tasks, "doing").map((t) => t.title)).toEqual(["A"]);
    expect(filterTasks(tasks, "waiting").map((t) => t.title)).toEqual(["B", "C"]);
    expect(filterTasks(tasks, "next").map((t) => t.title)).toEqual(["A"]);
    expect(filterTasks([waits, finished], "next")).toEqual([]);
  });

  it("is quiet after 14 days without anything made or written, never when the dates are unknown", () => {
    const old = epicGroups([task({ made: "2026-10-01" })], [], [])[0];
    const log = epicGroups(
      [task({ made: "2026-10-01", log: [{ line: 1, date: "2026-11-10", text: "x", key: "k" }] })],
      [],
      [],
    )[0];
    const unknown = epicGroups([task({})], [], [])[0];
    if (old === undefined || log === undefined || unknown === undefined) throw new Error("no epic");
    expect(lastActivity(old)).toBe("2026-10-01");
    expect(isQuiet(old, "2026-11-12")).toBe(true);
    expect(isQuiet(old, "2026-10-15")).toBe(false);
    expect(isQuiet(log, "2026-11-12")).toBe(false);
    expect(isQuiet(unknown, "2026-11-12")).toBe(false);
  });

  it("names a task for another to wait for, and finds it again", () => {
    const target = task({ path: "IT/Network.md", title: "Test setup" });
    expect(taskRef(target)).toBe("IT/Network#Test setup");
    expect(afterTarget([target], { after: "IT/Network#Test setup" })).toBe(target);
    expect(afterTarget([target], { after: "IT/Network#Gone" })).toBeNull();
    expect(afterTarget([target], { after: null })).toBeNull();
  });
});

describe("where you left off", () => {
  const log = (date: string, text: string) => ({ line: 1, date, text, key: "k" });

  it("writes one line and reads the latest one back", () => {
    expect(leftOffLine("  Take a  backup  ")).toBe("Left off: Take a backup");
    const t = task({
      log: [
        log("2026-11-01", "Left off: Old step"),
        log("2026-11-02", "Called Peter"),
        log("2026-11-03", "Left off: New step"),
      ],
    });
    expect(latestLeftOff(t)).toEqual({ date: "2026-11-03", text: "New step" });
    expect(latestLeftOff(task({ log: [log("2026-11-01", "Called Peter")] }))).toBeNull();
  });

  it("finds the newest one of the open tasks, not older than a week", () => {
    const a = task({ title: "A", log: [log("2026-11-05", "Left off: first")] });
    const b = task({ title: "B", log: [log("2026-11-08", "Left off: second")] });
    const old = task({ title: "C", log: [log("2026-10-01", "Left off: ancient")] });
    const done = task({ title: "D", done: true, log: [log("2026-11-09", "Left off: done")] });
    const r = recentLeftOff([a, b, old, done], "2026-11-10");
    expect(r?.task.title).toBe("B");
    expect(r?.text).toBe("second");
    expect(recentLeftOff([old], "2026-11-10")).toBeNull();
    expect(recentLeftOff([a], "2026-11-20")).toBeNull();
  });
});
