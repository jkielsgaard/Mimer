import { Loader2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { PlainButton } from "@/components/ui/plain-button";
import { Radio } from "@/components/ui/radio";
import { Textarea } from "@/components/ui/textarea";
import { AiMistakesNote } from "@/components/AiMistakesNote";
import { askAi, type AiAnswer } from "@/lib/askAi";
import {
  addChild,
  insertAfter,
  joinText,
  nodeAt,
  removeMany,
  splitText,
  type NodePath,
  type PlanNode,
} from "@/lib/planTree";
import { stepsFromAnswer, taskText } from "@/lib/taskLogic";
import { basename, dirname, isInside } from "@/lib/utils";
import { planHome, usePlanStore } from "@/stores/planStore";
import { useTaskStore } from "@/stores/taskStore";
import { reportError, useUiStore } from "@/stores/uiStore";
import { useVaultStore } from "@/stores/vaultStore";
import { GuidedDialog } from "./GuidedDialog";
import { projectIdeas } from "./projectIdeas";
import { infoFor, linkTarget, taskTarget } from "./nodeInfo";
import {
  addIdea,
  epicOfPlan,
  linkNoteTo,
  linkTaskTo,
  makeNote,
  makeTask,
  plainAt,
} from "./planActions";
import { usePlanContext } from "./usePlanContext";

function close(): void {
  usePlanStore.getState().setDialog(null);
}

/** A dialog that closes when asked to (and not before it is done working). */
function Shell({
  title,
  description,
  children,
  footer,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
  footer: React.ReactNode;
}) {
  return (
    <Dialog
      open
      onOpenChange={(o) => {
        if (!o) close();
      }}
    >
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {description && <DialogDescription>{description}</DialogDescription>}
        </DialogHeader>
        {children}
        <DialogFooter className="items-center">{footer}</DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function useTicks(count: number) {
  const [chosen, setChosen] = useState<ReadonlySet<number>>(
    new Set(Array.from({ length: count }, (_, i) => i)),
  );
  const toggle = (i: number): void => {
    setChosen((c) => {
      const next = new Set(c);
      if (next.has(i)) next.delete(i);
      else next.add(i);
      return next;
    });
  };
  return { chosen, toggle };
}

// --- Make an epic from an idea ----------------------------------------------------------------

function MakeEpic({ path }: { path: NodePath }) {
  const nodes = usePlanStore((s) => s.nodes);
  const node = nodeAt(nodes, path);
  const plain = plainAt(path);
  const steps = (node?.children ?? []).map((c) => splitText(c.text).plain);
  const [name, setName] = useState(plain);
  const [withNote, setWithNote] = useState(false);
  const [busy, setBusy] = useState(false);
  const { chosen, toggle } = useTicks(steps.length);
  const planPath = usePlanStore((s) => s.path);
  const { groups } = usePlanContext(planPath);

  const make = async (): Promise<void> => {
    setBusy(true);
    try {
      const tasks = useTaskStore.getState();
      const home = planPath === null ? undefined : planHome(planPath).epics;
      const epic =
        home === undefined
          ? await tasks.createEpic(name.trim(), false)
          : await tasks.createEpic(name.trim(), false, home);
      if (epic === null) return;
      const texts = steps.filter((_, i) => chosen.has(i)).map(taskText);
      if (texts.length > 0) await tasks.addToNote(epic, texts);
      await tasks.load();
      await linkNoteTo(path, epic);
      if (withNote) await makeNote(path);
      useUiStore.getState().toast(`Made the epic “${name.trim()}”.`, "success", {
        label: "Open",
        run: () => {
          useTaskStore.getState().openEpic(epic);
        },
      });
      close();
    } catch (e) {
      reportError(e);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Shell
      title={`Link or make an epic for “${plain}”`}
      description="Link an epic that is already there, or make a new one below: it gets the name, and the sub-ideas you tick become its tasks."
      footer={
        <>
          <Button variant="ghost" onClick={close}>
            Cancel
          </Button>
          <Button disabled={busy || name.trim() === ""} onClick={() => void make()}>
            {busy ? "Making…" : "Make the epic"}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3">
        {groups.length > 0 && (
          <div>
            <span className="section-label">Use an epic that is there</span>
            <ul aria-label="Existing epics" className="flex max-h-32 flex-col overflow-auto">
              {groups.map((g) => (
                <li key={g.path}>
                  <PlainButton
                    type="button"
                    className="flex w-full items-center gap-2 rounded px-2 py-1 text-left text-sm hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring"
                    onClick={() => {
                      void linkNoteTo(path, g.path).then(close);
                    }}
                  >
                    <span className="flex-1 truncate font-semibold">{g.title}</span>
                    <span className="text-xs text-muted-foreground">
                      {g.done} of {g.total}
                    </span>
                  </PlainButton>
                </li>
              ))}
            </ul>
          </div>
        )}
        <span className="section-label">Or make a new one</span>
        <label className="flex flex-col gap-1 text-xs text-muted-foreground">
          Name of the epic
          <Input
            value={name}
            onChange={(e) => {
              setName(e.target.value);
            }}
          />
        </label>
        {steps.length > 0 ? (
          <ul className="flex flex-col gap-1.5" aria-label="Tasks">
            {steps.map((s, i) => (
              <li key={`${String(i)}-${s}`}>
                <label className="flex cursor-pointer items-start gap-3 text-sm">
                  <Checkbox
                    className="mt-1"
                    checked={chosen.has(i)}
                    onChange={() => {
                      toggle(i);
                    }}
                  />
                  {s}
                </label>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">
            It has no sub-ideas yet, so the epic starts empty.
          </p>
        )}
        <label className="flex items-start gap-3 text-sm">
          <Checkbox
            className="mt-1"
            checked={withNote}
            onChange={(e) => {
              setWithNote(e.target.checked);
            }}
          />
          <span>
            Make a note for it too, and link it
            <span className="block text-xs text-muted-foreground">
              A note with the same name and a link back to the plan.
            </span>
          </span>
        </label>
      </div>
    </Shell>
  );
}

// --- Link a note ------------------------------------------------------------------------------

function LinkNote({ path }: { path: NodePath }) {
  const files = useVaultStore((s) => s.files);
  const [q, setQ] = useState("");
  const planPath = usePlanStore((s) => s.path);
  const query = q.trim().toLowerCase();
  const found = files
    .filter((f) => /\.md$/i.test(f) && f !== planPath && !f.startsWith(".vault/"))
    .filter((f) => query === "" || f.toLowerCase().includes(query))
    .slice(0, 8);
  return (
    <Shell
      title="Link or make a note"
      description={`Choose the note that goes with “${plainAt(path)}”, or make a new one. The idea then points at it.`}
      footer={
        <>
          <Button variant="ghost" onClick={close}>
            Cancel
          </Button>
          <Button
            variant="outline"
            onClick={() => {
              void makeNote(path).then(close);
            }}
          >
            Make a new note
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-2">
        <Input
          autoFocus
          aria-label="Search for a note"
          placeholder="Part of the name"
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
          }}
        />
        <ul aria-label="Matching notes" className="flex flex-col">
          {found.map((f) => (
            <li key={f}>
              <PlainButton
                type="button"
                className="flex w-full flex-col rounded px-2 py-1 text-left text-sm hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring"
                onClick={() => {
                  void linkNoteTo(path, f).then(close);
                }}
              >
                <span className="font-semibold">{basename(f).replace(/\.md$/i, "")}</span>
                <span className="text-xs text-muted-foreground">{f}</span>
              </PlainButton>
            </li>
          ))}
          {found.length === 0 && (
            <li className="px-2 py-1 text-xs text-muted-foreground">No note matches.</li>
          )}
        </ul>
      </div>
    </Shell>
  );
}

// --- Suggest parts (AI) -----------------------------------------------------------------------

const PARTS_INSTRUCTION =
  "Suggest the parts that the thing below is made of, to help someone get started. Write each part as one short line that starts with '- ' (one to six words, no full sentences). At most eight. Do not repeat the parts that are already there, and do not invent facts. If nothing is missing, answer exactly NONE. Write in the language of the text.";

function SuggestParts({ path }: { path: NodePath }) {
  const nodes = usePlanStore((s) => s.nodes);
  const title = usePlanStore((s) => s.title);
  const planPath = usePlanStore((s) => s.path);
  const node = nodeAt(nodes, path);
  const what = path.length === 0 ? title : plainAt(path);
  const have = (path.length === 0 ? nodes : (node?.children ?? [])).map(
    (c) => splitText(c.text).plain,
  );
  const [found, setFound] = useState<string[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [round, setRound] = useState(0);
  const run = useRef<AiAnswer | null>(null);

  useEffect(() => {
    const life = { alive: true };
    setFound(null);
    setError(null);
    const answer = askAi(
      PARTS_INSTRUCTION,
      `The thing: ${what}\nThe plan it is part of: ${title}\nParts already there: ${have.join("; ") || "none"}`,
      planPath,
    );
    run.current = answer;
    void answer.promise
      .then((text) => {
        if (life.alive) setFound(/^\s*NONE\b/i.test(text) ? [] : stepsFromAnswer(text));
      })
      .catch((e: unknown) => {
        if (life.alive) setError(e instanceof Error ? e.message : "Something went wrong");
      });
    return () => {
      life.alive = false;
      run.current?.cancel();
    };
    // `have` and `title` only describe what was asked; a new answer is asked for by Try again.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [round]);

  const [marks, setMarks] = useState<ReadonlySet<number>>(new Set());
  useEffect(() => {
    setMarks(new Set((found ?? []).map((_, i) => i)));
  }, [found]);
  const flip = (i: number): void => {
    setMarks((c) => {
      const next = new Set(c);
      if (next.has(i)) next.delete(i);
      else next.add(i);
      return next;
    });
  };

  const add = async (): Promise<void> => {
    if (found === null) return;
    const texts = found.filter((_, i) => marks.has(i));
    await usePlanStore
      .getState()
      .edit((list) => texts.reduce((acc, t) => addChild(acc, path, t).nodes, list));
    close();
  };

  return (
    <Shell
      title="Suggest parts"
      description={`The AI suggests parts of “${what}”. You choose which ones are added; nothing is written before.`}
      footer={
        <>
          <AiMistakesNote className="mr-auto" />
          <Button variant="ghost" onClick={close}>
            Cancel
          </Button>
          <Button
            variant="outline"
            onClick={() => {
              setRound((r) => r + 1);
            }}
          >
            Try again
          </Button>
          <Button disabled={found === null || marks.size === 0} onClick={() => void add()}>
            Add {marks.size}
          </Button>
        </>
      }
    >
      <div className="min-h-24">
        {found === null && error === null && (
          <p role="status" className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin motion-reduce:animate-none" aria-hidden />
            The AI is thinking. A small model can take a minute.
          </p>
        )}
        {error !== null && (
          <p
            role="alert"
            className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive"
          >
            {error}
          </p>
        )}
        {found !== null && found.length === 0 && (
          <p className="text-sm text-muted-foreground">The AI found nothing to add.</p>
        )}
        {found !== null && found.length > 0 && (
          <ul className="flex flex-col gap-1.5" aria-label="Suggested parts">
            {found.map((t, i) => (
              <li key={`${String(i)}-${t}`}>
                <label className="flex cursor-pointer items-start gap-3 rounded-lg border px-3 py-2 text-sm">
                  <Checkbox
                    className="mt-1"
                    checked={marks.has(i)}
                    onChange={() => {
                      flip(i);
                    }}
                  />
                  {t}
                </label>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Shell>
  );
}

// --- Repeat the same steps for several things -------------------------------------------------

function strip(node: PlanNode): PlanNode {
  return { text: splitText(node.text).plain, children: node.children.map(strip) };
}

function LinkTask({ path }: { path: NodePath }) {
  const planPath = usePlanStore((s) => s.path);
  const { tasks, groups } = usePlanContext(planPath);
  const [q, setQ] = useState("");
  const query = q.trim().toLowerCase();
  const found = tasks
    .filter((t) => !t.done && t.status !== "dropped")
    .filter((t) => query === "" || t.title.toLowerCase().includes(query))
    .slice(0, 8);
  const epicTitle = (p: string): string => groups.find((g) => g.path === p)?.title ?? basename(p);
  return (
    <Shell
      title="Link or make a task"
      description={`Choose a task that is already there for “${plainAt(path)}”, or make a new one. A new task is put in the epic of this plan (made now if it is not there), which has the name of the plan.`}
      footer={
        <>
          <Button variant="ghost" onClick={close}>
            Cancel
          </Button>
          <Button
            variant="outline"
            onClick={() => {
              void makeTask(path).then(close);
            }}
          >
            Make a new task
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-2">
        <Input
          autoFocus
          aria-label="Search for a task"
          placeholder="Part of the name"
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
          }}
        />
        <ul aria-label="Matching tasks" className="flex flex-col">
          {found.map((t) => (
            <li key={`${t.path}#${t.title}`}>
              <PlainButton
                type="button"
                className="flex w-full flex-col rounded px-2 py-1 text-left text-sm hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring"
                onClick={() => {
                  void linkTaskTo(path, t).then(close);
                }}
              >
                <span className="font-semibold">{t.title}</span>
                <span className="text-xs text-muted-foreground">{epicTitle(t.path)}</span>
              </PlainButton>
            </li>
          ))}
          {found.length === 0 && (
            <li className="px-2 py-1 text-xs text-muted-foreground">No open task matches.</li>
          )}
        </ul>
      </div>
    </Shell>
  );
}

function Repeat({ path }: { path: NodePath }) {
  const nodes = usePlanStore((s) => s.nodes);
  const node = nodeAt(nodes, path);
  const plain = plainAt(path);
  const steps = (node?.children ?? []).map(strip);
  const [names, setNames] = useState("");
  const [busy, setBusy] = useState(false);
  const list = names
    .split("\n")
    .map((n) => n.trim())
    .filter((n) => n !== "");

  const make = async (): Promise<void> => {
    setBusy(true);
    try {
      const tasks = useTaskStore.getState();
      const plan = usePlanStore.getState().path;
      const epic = plan === null ? null : await epicOfPlan(plan);
      const made: PlanNode[] = [];
      if (epic !== null) {
        // One epic (the plan's own): a task for each name, and the steps as steps of that task.
        await tasks.addToNote(
          epic,
          list.map((n) => taskText(n)),
        );
        await tasks.load();
        for (const name of list) {
          const find = () =>
            useTaskStore
              .getState()
              .tasks.find((t) => t.path === epic && t.title === taskText(name));
          for (const s of steps) {
            const t = find();
            if (t) await useTaskStore.getState().addStep(t, taskText(s.text));
          }
          const t = find();
          made.push({
            text: joinText(name, t ? [taskTarget(epic, t.title)] : []),
            children: steps.map((s) => ({ ...s })),
          });
        }
      } else {
        for (const name of list) made.push({ text: name, children: steps.map((s) => ({ ...s })) });
      }
      await usePlanStore.getState().edit((all) => {
        let acc = all;
        let at = path;
        for (const m of made) {
          const r = insertAfter(acc, at, m);
          acc = r.nodes;
          at = r.path;
        }
        return acc;
      });
      close();
    } catch (e) {
      reportError(e);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Shell
      title={`Repeat the steps of “${plain}”`}
      description="Each name gets its own branch here, and a task in the epic of this plan, with the same steps as the steps of that task. Nothing is made before you press the button."
      footer={
        <>
          <Button variant="ghost" onClick={close}>
            Cancel
          </Button>
          <Button
            disabled={busy || list.length === 0 || steps.length === 0}
            onClick={() => void make()}
          >
            {busy ? "Making…" : `Make ${String(list.length)} task${list.length === 1 ? "" : "s"}`}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3">
        {steps.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            This idea has no sub-ideas. Write the steps as sub-ideas first, then repeat them.
          </p>
        ) : (
          <div>
            <span className="section-label">The steps</span>
            <ul className="ml-5 list-disc text-sm">
              {steps.map((s, i) => (
                <li key={`${String(i)}-${s.text}`}>{s.text}</li>
              ))}
            </ul>
          </div>
        )}
        <label className="flex flex-col gap-1 text-xs text-muted-foreground">
          For these (one name on each line)
          <Textarea
            aria-label="Names"
            rows={4}
            value={names}
            onChange={(e) => {
              setNames(e.target.value);
            }}
          />
        </label>
      </div>
    </Shell>
  );
}

// --- Finish the plan, or carry the rest over --------------------------------------------------

function Finish() {
  const nodes = usePlanStore((s) => s.nodes);
  const title = usePlanStore((s) => s.title);
  const planPath = usePlanStore((s) => s.path);
  const ctx = usePlanContext(planPath);
  const [mode, setMode] = useState<"carry" | "finish" | "keep">("carry");
  const [name, setName] = useState(`${title} (continued)`);
  const open = nodes
    .map((n, i) => ({ n, i, info: infoFor(n, ctx) }))
    .filter(
      ({ info }) =>
        !(
          info.task?.done === true ||
          (info.epic !== null && info.epic.total > 0 && info.epic.done === info.epic.total)
        ),
    );
  const [picked, setPicked] = useState<ReadonlySet<number>>(new Set(open.map((o) => o.i)));
  const [busy, setBusy] = useState(false);
  const flip = (i: number): void => {
    setPicked((c) => {
      const next = new Set(c);
      if (next.has(i)) next.delete(i);
      else next.add(i);
      return next;
    });
  };

  const go = async (): Promise<void> => {
    const store = usePlanStore.getState();
    if (mode === "keep") {
      close();
      return;
    }
    setBusy(true);
    try {
      if (mode === "carry" && picked.size > 0) {
        const moving = [...picked].sort((a, b) => a - b);
        const moved = moving.flatMap((i) => (nodes[i] ? [nodes[i]] : []));
        const place =
          planPath !== null && planHome(planPath).epics !== undefined
            ? { folder: dirname(planPath) }
            : "plans";
        const created = await store.create(name.trim(), moved, false, place);
        if (created === null) return;
        const line = `Moved to [[${linkTarget(created)}]]`;
        await store.edit(
          (all) =>
            addChild(
              removeMany(
                all,
                moving.map((i) => [i]),
              ),
              [],
              line,
            ).nodes,
        );
        await store.setFinished(true);
        await store.open(created);
      } else {
        await store.setFinished(true);
      }
      close();
    } catch (e) {
      reportError(e);
    } finally {
      setBusy(false);
    }
  };

  const choice = (id: typeof mode, label: string, help: string) => (
    <label
      className={`flex cursor-pointer gap-3 rounded-lg border px-3 py-2 ${mode === id ? "border-2 border-primary bg-accent" : ""}`}
    >
      <Radio
        name="finish-mode"
        className="mt-1"
        checked={mode === id}
        onChange={() => {
          setMode(id);
        }}
      />
      <span className="text-sm">
        <b>{label}</b>
        <span className="block text-xs text-muted-foreground">{help}</span>
      </span>
    </label>
  );

  return (
    <Shell
      title={`Finish “${title}”?`}
      description="A finished plan stays readable under Finished, with its notes and epics, and you can open it again. Choose what happens to what is still open."
      footer={
        <>
          <Button variant="ghost" onClick={close}>
            Cancel
          </Button>
          <Button disabled={busy} onClick={() => void go()}>
            {mode === "keep"
              ? "Keep it going"
              : mode === "carry"
                ? "Finish and carry over"
                : "Finish it"}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-2">
        {choice(
          "carry",
          "Carry the open things over to a new plan",
          "Pick what continues. This plan keeps a line, “Moved to …”.",
        )}
        {mode === "carry" && (
          <div className="ml-7 flex flex-col gap-1.5">
            {open.length === 0 && <p className="text-sm text-muted-foreground">Nothing is open.</p>}
            {open.map(({ n, i }) => (
              <label key={i} className="flex items-start gap-3 text-sm">
                <Checkbox
                  className="mt-1"
                  checked={picked.has(i)}
                  onChange={() => {
                    flip(i);
                  }}
                />
                {splitText(n.text).plain}
              </label>
            ))}
            <label className="mt-1 flex flex-col gap-1 text-xs text-muted-foreground">
              Name of the new plan
              <Input
                value={name}
                onChange={(e) => {
                  setName(e.target.value);
                }}
              />
            </label>
            <span className="text-xs text-muted-foreground">
              Epics and tasks go with their idea. Nothing is copied, so there is still only one of
              each.
            </span>
          </div>
        )}
        {choice(
          "finish",
          "Just finish it",
          "Move it to Finished as it is. What is open stays in it.",
        )}
        {choice("keep", "Not yet", "Keep it going. A plan can be ongoing for a long time.")}
      </div>
    </Shell>
  );
}

/** Makes a plan of a project that is there: a plan note in its folder, and nothing else changed. */
function ImportProject({ folder }: { folder: string | null }) {
  const projects = useVaultStore((s) => s.projects);
  const files = useVaultStore((s) => s.files);
  const plans = usePlanStore((s) => s.plans);
  const [chosen, setChosen] = useState<string | null>(folder);
  const [withNotes, setWithNotes] = useState(true);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    void usePlanStore.getState().load();
  }, []);
  const planOf = (f: string) => plans.find((p) => isInside(p.path, f));
  const project = projects.find((p) => p.folder === chosen);
  const have = chosen === null ? undefined : planOf(chosen);
  const go = async (): Promise<void> => {
    if (!project) return;
    setBusy(true);
    try {
      if (have) await usePlanStore.getState().open(have.path);
      else {
        const nodes = withNotes ? projectIdeas(files, project.folder) : [];
        await usePlanStore.getState().create(project.name, nodes, true, { folder: project.folder });
      }
      close();
    } finally {
      setBusy(false);
    }
  };
  return (
    <Shell
      title="Make a plan of a project"
      description="The plan is a note in the project's folder. Nothing else in the project is changed or moved, and a project never becomes a plan by itself."
      footer={
        <>
          <Button variant="ghost" onClick={close}>
            Cancel
          </Button>
          <Button disabled={busy || !project} onClick={() => void go()}>
            {have ? "Open its plan" : "Make the plan"}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3">
        {projects.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            There are no projects yet. A project is a folder with its own AI rules; make one in
            Files, or make a new plan, which makes its own project.
          </p>
        ) : (
          <ul aria-label="Projects" className="flex max-h-48 flex-col overflow-auto">
            {projects.map((p) => (
              <li key={p.id}>
                <label className="flex cursor-pointer items-center gap-3 rounded px-2 py-1 text-sm hover:bg-muted">
                  <Radio
                    name="import-project"
                    checked={chosen === p.folder}
                    onChange={() => {
                      setChosen(p.folder);
                    }}
                  />
                  <span className="flex-1 truncate font-semibold">{p.name}</span>
                  {planOf(p.folder) && (
                    <span className="text-xs text-muted-foreground">has a plan</span>
                  )}
                </label>
              </li>
            ))}
          </ul>
        )}
        {project && !have && (
          <label className="flex items-start gap-3 text-sm">
            <Checkbox
              className="mt-1"
              checked={withNotes}
              onChange={(e) => {
                setWithNotes(e.target.checked);
              }}
            />
            <span>
              Start the plan with the notes and epics of the project as ideas
              <span className="block text-xs text-muted-foreground">
                Each one is an idea that links to it, with the folders as branches. You can take out
                what you do not need.
              </span>
            </span>
          </label>
        )}
      </div>
    </Shell>
  );
}

/** Writes new ideas under an idea (or the plan): Enter adds one and the field stays for the next. */
function AddIdeas({ path }: { path: NodePath }) {
  const [text, setText] = useState("");
  const [added, setAdded] = useState<string[]>([]);
  const nodes = usePlanStore((s) => s.nodes);
  const title = usePlanStore((s) => s.title);
  const under = path.length === 0 ? title : (nodeAt(nodes, path)?.text ?? "");
  const add = async (): Promise<void> => {
    const t = text.trim();
    if (t === "") return;
    setText("");
    setAdded((a) => [...a, t]);
    await addIdea(path, t);
  };
  return (
    <Shell
      title={`Add ideas under “${splitText(under).plain}”`}
      description="Write an idea and press Enter. The field stays, so the next one can follow."
      footer={<Button onClick={close}>Done</Button>}
    >
      <form
        className="flex flex-col gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          void add();
        }}
      >
        <Input
          autoFocus
          aria-label="A new idea"
          placeholder="A new idea"
          value={text}
          onChange={(e) => {
            setText(e.target.value);
          }}
        />
        {added.length > 0 && (
          <ul className="text-sm text-muted-foreground">
            {added.map((a, i) => (
              <li key={`${String(i)}-${a}`}>✓ {a}</li>
            ))}
          </ul>
        )}
      </form>
    </Shell>
  );
}

/** The window over the open plan, if one is asked for, and the window that makes a plan. */
export function PlanDialogs() {
  const dialog = usePlanStore((s) => s.dialog);
  const guided = usePlanStore((s) => s.guidedOpen);
  return (
    <>
      {dialog?.kind === "epic" && <MakeEpic path={dialog.path} />}
      {dialog?.kind === "link" && <LinkNote path={dialog.path} />}
      {dialog?.kind === "linktask" && <LinkTask path={dialog.path} />}
      {dialog?.kind === "parts" && <SuggestParts path={dialog.path} />}
      {dialog?.kind === "repeat" && <Repeat path={dialog.path} />}
      {dialog?.kind === "add" && <AddIdeas path={dialog.path} />}
      {dialog?.kind === "import" && <ImportProject folder={dialog.folder} />}
      {dialog?.kind === "finish" && <Finish />}
      {guided && <GuidedDialog hidden={dialog !== null} />}
    </>
  );
}
