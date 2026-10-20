import { describe, expect, it } from "vitest";
import type { Task } from "@/bindings/Task";
import {
  addDays,
  bucketOf,
  durationLabel,
  quickTaskText,
  stepsFromAnswer,
  whenLabel,
} from "./taskLogic";

const TODAY = "2026-10-19"; // a Monday

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
    ...patch,
  };
}

describe("buckets", () => {
  it("puts a task where it is planned, else where it is due", () => {
    expect(bucketOf(task({ due: "2026-10-19" }), TODAY)).toBe("today");
    expect(bucketOf(task({ due: "2026-10-12" }), TODAY)).toBe("moved");
    expect(bucketOf(task({ due: "2026-10-23" }), TODAY)).toBe("week");
    expect(bucketOf(task({ due: "2026-12-01" }), TODAY)).toBe("later");
    expect(bucketOf(task({}), TODAY)).toBe("later");
    // The plan wins over the date, and `later` pushes a late task away.
    expect(bucketOf(task({ due: "2026-10-12", plan: "2026-10-19" }), TODAY)).toBe("today");
    expect(bucketOf(task({ due: "2026-10-12", plan: "later" }), TODAY)).toBe("later");
  });
});

describe("quickTaskText", () => {
  it("turns a date word at the end into due:", () => {
    expect(quickTaskText("Call Mette tomorrow", TODAY)).toBe("Call Mette due:2026-10-20");
    expect(quickTaskText("Send quote fri", TODAY)).toBe("Send quote due:2026-10-23");
    expect(quickTaskText("Send quote mon", TODAY)).toBe("Send quote due:2026-10-26");
    expect(quickTaskText("Renew in 3 days", TODAY)).toBe("Renew due:2026-10-22");
    expect(quickTaskText("Renew 2026-11-01", TODAY)).toBe("Renew due:2026-11-01");
    expect(quickTaskText("Buy milk", TODAY)).toBe("Buy milk plan:2026-10-19");
  });
  it("makes a task without a date a task for today, and `later` puts it away", () => {
    expect(quickTaskText("Call the bank", TODAY)).toBe("Call the bank plan:2026-10-19");
    expect(quickTaskText("Call the bank later", TODAY)).toBe("Call the bank plan:later");
    expect(quickTaskText("Call the bank fri", TODAY)).toBe("Call the bank due:2026-10-23");
    expect(quickTaskText("Call the bank due:2026-11-01", TODAY)).toBe(
      "Call the bank due:2026-11-01",
    );
  });

  it("reads ~15m as an estimate and keeps tags", () => {
    expect(quickTaskText("Fix the guide #vpn today ~15m", TODAY)).toBe(
      "Fix the guide #vpn due:2026-10-19 est:15m",
    );
  });
});

describe("labels", () => {
  it("says when a task is due", () => {
    expect(whenLabel(task({ due: "2026-10-19" }), TODAY)).toBe("Today");
    expect(whenLabel(task({ due: "2026-10-20" }), TODAY)).toBe("Tomorrow");
    expect(whenLabel(task({ due: "2026-10-23" }), TODAY)).toBe("Fri 23 Oct");
    expect(whenLabel(task({ due: "2026-10-17" }), TODAY)).toBe("2 days late");
    expect(whenLabel(task({}), TODAY)).toBeNull();
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
  });
  it("writes durations", () => {
    expect(durationLabel(50)).toBe("50 min");
    expect(durationLabel(75)).toBe("1 h 15 min");
    expect(durationLabel(120)).toBe("2 h");
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
