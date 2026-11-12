import { useState } from "react";
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
import { Radio } from "@/components/ui/radio";
import { useAiBlocked } from "@/lib/useAiBlocked";
import { cn } from "@/lib/utils";
import { splitText, walk, type NodePath, type PlanNode } from "@/lib/planTree";
import { usePlanStore } from "@/stores/planStore";
import { addIdea, makeTask, removeIdea } from "./planActions";

const STEPS = ["What is it?", "What are the parts?", "Where to start"] as const;

/** The plan as a small indented list, to show how it grows while it is written. */
function Preview({ nodes, depth = 0 }: { nodes: readonly PlanNode[]; depth?: number }) {
  return (
    <ul className="flex flex-col gap-0.5">
      {nodes.map((n, i) => (
        <li key={`${String(i)}-${n.text}`}>
          <div
            className={cn(
              "flex items-center gap-2 text-sm",
              n.children.length > 0 && "font-semibold",
            )}
            style={{ paddingLeft: depth * 14 }}
          >
            <span
              aria-hidden
              className={cn(
                "size-2 shrink-0 rounded-full",
                n.children.length > 0 ? "bg-primary" : "bg-input",
              )}
            />
            {splitText(n.text).plain}
          </div>
          <Preview nodes={n.children} depth={depth + 1} />
        </li>
      ))}
    </ul>
  );
}

/**
 * Makes a plan in three short steps, so a big thing becomes smaller: say what it is, write down
 * its parts (and break a part into smaller ones), and pick the one smallest thing to begin with.
 * The plan is saved after the first step and after every idea, so it can be left and come back
 * to. There is no timer.
 */
export function GuidedDialog({ hidden }: { hidden: boolean }) {
  const [step, setStep] = useState<0 | 1 | 2>(0);
  const [title, setTitle] = useState("");
  const [breaking, setBreaking] = useState<NodePath | null>(null);
  const [text, setText] = useState("");
  const [sub, setSub] = useState("");
  const [start, setStart] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [asProject, setAsProject] = useState(true);
  const nodes = usePlanStore((s) => s.nodes);
  const aiOff = useAiBlocked();

  const done = (): void => {
    usePlanStore.getState().setGuidedOpen(false);
  };
  const leaves = walk(nodes).filter((w) => w.node.children.length === 0);

  const first = async (): Promise<void> => {
    if (title.trim() === "") return;
    setBusy(true);
    const path = await usePlanStore
      .getState()
      .create(title.trim(), [], true, asProject ? "project" : "plans");
    setBusy(false);
    if (path !== null) setStep(1);
  };

  const justTitle = async (): Promise<void> => {
    if (title.trim() === "") return;
    setBusy(true);
    const path = await usePlanStore
      .getState()
      .create(title.trim(), [], true, asProject ? "project" : "plans");
    setBusy(false);
    if (path !== null) done();
  };

  return (
    <Dialog
      open={!hidden}
      onOpenChange={(o) => {
        if (!o) done();
      }}
    >
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>Break it down</DialogTitle>
          <DialogDescription>
            A few minutes of writing things down make a big thing smaller. There is no timer, and
            everything is saved as you go, so you can stop and come back.
          </DialogDescription>
        </DialogHeader>
        <ol className="flex gap-2 text-xs" aria-label="Steps">
          {STEPS.map((s, i) => (
            <li
              key={s}
              aria-current={i === step}
              className={cn(
                "rounded-full px-3 py-1",
                i === step
                  ? "bg-accent font-semibold text-accent-foreground"
                  : "text-muted-foreground",
              )}
            >
              {String(i + 1)}. {s}
            </li>
          ))}
        </ol>

        <div className="flex min-h-64 gap-5">
          <div className="flex min-w-0 flex-1 flex-col gap-3">
            {step === 0 && (
              <form
                className="flex flex-col gap-2"
                onSubmit={(e) => {
                  e.preventDefault();
                  void first();
                }}
              >
                <label htmlFor="plan-title" className="text-sm font-semibold">
                  What do you want to get done?
                </label>
                <Input
                  id="plan-title"
                  autoFocus
                  placeholder="For example: Move the Copenhagen office before 1 March"
                  value={title}
                  onChange={(e) => {
                    setTitle(e.target.value);
                  }}
                />
                <label className="mt-1 flex items-start gap-3 text-sm">
                  <Checkbox
                    className="mt-1"
                    checked={asProject}
                    onChange={(e) => {
                      setAsProject(e.target.checked);
                    }}
                  />
                  <span>
                    Make a project for it
                    <span className="block text-xs text-muted-foreground">
                      A folder with the name of the plan. The plan, and the epics and notes made
                      from it, are kept in it. Without it the plan goes in the folder Plans.
                    </span>
                  </span>
                </label>
                <p className="text-xs text-muted-foreground">
                  It becomes a plan: a note you can open in any editor. Press “Next” to be guided
                  through the parts, or “Just make the plan” to start with the name and build it
                  yourself.
                </p>
              </form>
            )}

            {step === 1 && (
              <>
                <div>
                  <h3 className="text-sm font-semibold">What parts does it have?</h3>
                  <p className="text-xs text-muted-foreground">
                    Write them as they come. They do not have to be in order or complete.
                  </p>
                </div>
                <ul className="flex flex-col gap-1.5">
                  {nodes.map((n, i) => (
                    <li key={`${String(i)}-${n.text}`} className="flex flex-col gap-1">
                      <div className="flex items-center gap-2 rounded-lg border px-3 py-1.5 text-sm">
                        <span className="flex-1 font-semibold">{splitText(n.text).plain}</span>
                        <span className="text-xs text-muted-foreground">
                          {n.children.length > 0 ? `${String(n.children.length)} parts` : ""}
                        </span>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => {
                            setBreaking(breaking?.[0] === i ? null : [i]);
                            setSub("");
                          }}
                        >
                          Break it down
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          aria-label={`Remove ${splitText(n.text).plain}`}
                          onClick={() => {
                            void removeIdea([i]);
                          }}
                        >
                          ✕
                        </Button>
                      </div>
                      {breaking?.[0] === i && (
                        <form
                          className="ml-6"
                          onSubmit={(e) => {
                            e.preventDefault();
                            if (sub.trim() === "") return;
                            void addIdea([i], sub);
                            setSub("");
                          }}
                        >
                          <Input
                            autoFocus
                            aria-label={`A smaller part of ${splitText(n.text).plain}`}
                            placeholder="A smaller part, then Enter"
                            value={sub}
                            onChange={(e) => {
                              setSub(e.target.value);
                            }}
                          />
                        </form>
                      )}
                    </li>
                  ))}
                </ul>
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    if (text.trim() === "") return;
                    void addIdea([], text);
                    setText("");
                  }}
                >
                  <Input
                    aria-label="Add a part"
                    placeholder="Add a part, and press Enter"
                    value={text}
                    onChange={(e) => {
                      setText(e.target.value);
                    }}
                  />
                </form>
                <div className="flex items-center gap-2 rounded-lg bg-accent px-3 py-2 text-sm text-accent-foreground">
                  <span className="flex-1">
                    Stuck? The AI can suggest parts. You choose which ones to keep.
                  </span>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={aiOff !== null}
                    title={aiOff ?? "The AI suggests parts of the plan"}
                    onClick={() => {
                      usePlanStore.getState().setDialog({ kind: "parts", path: [] });
                    }}
                  >
                    Suggest parts
                  </Button>
                </div>
              </>
            )}

            {step === 2 && (
              <>
                <div>
                  <h3 className="text-sm font-semibold">
                    Which one is the smallest thing to begin with?
                  </h3>
                  <p className="text-xs text-muted-foreground">
                    Choose one. You can make it a task now, or leave it for later.
                  </p>
                </div>
                {leaves.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    There are no parts yet. Go back and write a few.
                  </p>
                ) : (
                  <ul
                    className="flex max-h-56 flex-col gap-1 overflow-auto"
                    aria-label="Where to start"
                  >
                    {leaves.map((w) => {
                      const k = w.path.join(".");
                      return (
                        <li key={k}>
                          <label className="flex cursor-pointer items-start gap-3 rounded-lg border px-3 py-1.5 text-sm">
                            <Radio
                              name="start-here"
                              className="mt-1"
                              checked={start === k}
                              onChange={() => {
                                setStart(k);
                              }}
                            />
                            {splitText(w.node.text).plain}
                          </label>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </>
            )}
          </div>

          <aside
            aria-label="As it grows"
            className="hidden w-64 shrink-0 flex-col gap-2 rounded-lg bg-muted/50 p-3 sm:flex"
          >
            <span className="section-label">As it grows</span>
            {title.trim() !== "" && (
              <div className="flex items-center gap-2 text-sm font-bold">
                <span aria-hidden className="size-2 shrink-0 rounded-full bg-primary" />
                {title.trim()}
              </div>
            )}
            <div className="ml-3">
              <Preview nodes={nodes} />
            </div>
          </aside>
        </div>

        <DialogFooter className="items-center">
          {step > 0 && (
            <Button variant="ghost" onClick={done}>
              Save and come back later
            </Button>
          )}
          <span className="flex-1" />
          {step === 0 && (
            <>
              <Button variant="ghost" onClick={done}>
                Cancel
              </Button>
              <Button
                variant="outline"
                disabled={busy || title.trim() === ""}
                onClick={() => void justTitle()}
              >
                Just make the plan
              </Button>
              <Button disabled={busy || title.trim() === ""} onClick={() => void first()}>
                Next: the parts
              </Button>
            </>
          )}
          {step === 1 && (
            <>
              <Button
                variant="outline"
                onClick={() => {
                  setStep(0);
                }}
              >
                Back
              </Button>
              <Button
                onClick={() => {
                  setStep(2);
                }}
              >
                Next: where to start
              </Button>
            </>
          )}
          {step === 2 && (
            <>
              <Button
                variant="outline"
                onClick={() => {
                  setStep(1);
                }}
              >
                Back
              </Button>
              <Button variant="outline" onClick={done}>
                Later
              </Button>
              <Button
                disabled={start === null}
                onClick={() => {
                  const hit = leaves.find((w) => w.path.join(".") === start);
                  if (hit) void makeTask(hit.path);
                  done();
                }}
              >
                Make it a task now
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
