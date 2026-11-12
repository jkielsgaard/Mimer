import { describe, expect, it } from "vitest";
import { LinkResolver } from "@/lib/links";
import { epicGroups } from "@/lib/taskLogic";
import { makeTask } from "@/test/taskFixtures";
import { firstStep, infoFor, linkTarget, type InfoContext } from "./nodeInfo";

const epics = [
  { path: "Tasks/Find the place.md", title: "Find the place", source: null, description: "" },
];
const tasks = [
  makeTask({ path: "Tasks/Find the place.md", line: 3, title: "Visit the offices", done: true }),
  makeTask({ path: "Tasks/Find the place.md", line: 4, title: "Ask Mette" }),
  makeTask({ path: "Tasks/Move.md", line: 3, title: "Call the movers", status: "waiting" }),
];

const ctx: InfoContext = {
  resolver: new LinkResolver(["Tasks/Find the place.md", "Tasks/Move.md", "Notes/Network plan.md"]),
  groups: epicGroups(
    tasks,
    [...epics, { path: "Tasks/Move.md", title: "Move", source: null, description: "" }],
    [],
  ),
  planEpic: "Tasks/Move.md",
  tasks,
};

describe("infoFor", () => {
  it("tells the epic with its progress and the notes an idea links to", () => {
    const info = infoFor(
      { text: "Find the place [[Tasks/Find the place]] [[Network plan]]", children: [] },
      ctx,
    );
    expect(info.plain).toBe("Find the place");
    expect(info.epic).toEqual({
      path: "Tasks/Find the place.md",
      title: "Find the place",
      done: 1,
      total: 2,
    });
    expect(info.notes).toEqual(["Notes/Network plan.md"]);
  });

  it("finds the task of the plan's own epic that has the idea's words as its title", () => {
    expect(infoFor({ text: "Call the movers", children: [] }, ctx).task?.status).toBe("waiting");
    expect(infoFor({ text: "Something else", children: [] }, ctx).task).toBeNull();
    expect(
      infoFor({ text: "Call the movers", children: [] }, { ...ctx, planEpic: null }).task,
    ).toBeNull();
  });

  it("finds a task by a link `note#title`, in any epic, whatever the idea says", () => {
    const info = infoFor(
      { text: "Phone Mette [[Tasks/Find the place#Ask Mette]]", children: [] },
      ctx,
    );
    expect(info.task?.title).toBe("Ask Mette");
    expect(info.notes).toEqual([]);
    expect(info.epic).toBeNull();
  });

  it("ignores a link to a note that is not there", () => {
    expect(infoFor({ text: "Idea [[Gone]]", children: [] }, ctx).notes).toEqual([]);
  });
});

describe("firstStep", () => {
  it("is the first open task, in the order of the list, from an epic or from the plan's own epic", () => {
    const found = firstStep(
      [
        { text: "Done already", children: [] },
        {
          text: "Branch",
          children: [{ text: "Find the place [[Tasks/Find the place]]", children: [] }],
        },
        { text: "Call the movers", children: [] },
      ],
      ctx,
    );
    expect(found?.task.title).toBe("Ask Mette");
    expect(found?.idea).toBe("Find the place");
    expect(firstStep([{ text: "Call the movers", children: [] }], ctx)?.task.title).toBe(
      "Call the movers",
    );
    expect(firstStep([{ text: "Nothing", children: [] }], ctx)).toBeNull();
  });
});

describe("linkTarget", () => {
  it("is the path without .md", () => {
    expect(linkTarget("Tasks/Find the place.md")).toBe("Tasks/Find the place");
  });
});
