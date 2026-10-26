import { Archive } from "lucide-react";
import { useEffect, useState } from "react";
import type { Idea } from "@/bindings/Idea";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { api } from "@/lib/api";
import { fileNameFrom } from "@/lib/noteTitle";
import { shortDate, stepsFromAnswer, todayIso } from "@/lib/taskLogic";
import { AiAsk } from "@/components/AiAsk";
import { CaptureBox } from "./CaptureBox";
import { ChooseEpicDialog } from "./ChooseEpicDialog";
import { DeleteButton } from "@/components/DeleteButton";
import { ViewHeader } from "@/components/ViewHeader";
import { useIdeaStore } from "@/stores/ideaStore";
import { useTaskStore } from "@/stores/taskStore";
import { reportError, useUiStore } from "@/stores/uiStore";
import { useVaultStore } from "@/stores/vaultStore";

/** Turns an idea into a task in the epic at `epicPath`. The idea stays, marked as used. */
export async function ideaToTask(idea: Idea, epicPath: string): Promise<void> {
  await useTaskStore
    .getState()
    .add(`${idea.text}${idea.tags.map((t) => ` #${t}`).join("")}`, idea.note, undefined, epicPath);
  await useIdeaStore.getState().setStatus(idea, "used");
  useUiStore.getState().toast("Made a task.", "success");
}

/** Turns an idea into a note in Quick notes and opens it. The idea stays, marked as used. */
export async function ideaToNote(idea: Idea): Promise<void> {
  try {
    const vault = useVaultStore.getState();
    const folder = vault.vault?.config.quickNotesFolder ?? "";
    const title = idea.text.length > 60 ? `${idea.text.slice(0, 57)}…` : idea.text;
    const path = await api.createNote(folder, fileNameFrom(title));
    await api.writeNote(
      path,
      `# ${title}\n\n${idea.text}\n${idea.note === "" ? "" : `\n${idea.note}\n`}`,
    );
    await vault.refreshTree();
    await useIdeaStore.getState().setStatus(idea, "used");
    await vault.openNote(path);
  } catch (e) {
    reportError(e);
  }
}

const THINK_INSTRUCTION =
  "Ask three short questions that help the person think this idea through: who it is for, what it should do, and what is needed to start. Number them 1, 2, 3. Do not answer them. Write in the language of the idea.";

const STEPS_INSTRUCTION =
  "Suggest three to five small, concrete first steps to get started with this idea. Write each step as one short line that starts with '- ' and a verb. Write in the language of the idea. Answer with the list only.";

/** The idea as it is written in the title box: the text, then its #tags. */
function titleOf(idea: Idea): string {
  return `${idea.text}${idea.tags.map((t) => ` #${t}`).join("")}`;
}

/** One idea, open for reading and changing. It is saved when you leave a box or press Save. */
function IdeaEditor({ idea }: { idea: Idea }) {
  const [title, setTitle] = useState(titleOf(idea));
  const [note, setNote] = useState(idea.note);
  const today = todayIso();
  // What waits for an epic to be chosen: the idea itself, or the steps the AI suggested.
  const [asking, setAsking] = useState<((epic: string) => Promise<void>) | null>(null);
  const dirty = title !== titleOf(idea) || note !== idea.note;

  useEffect(() => {
    setTitle(titleOf(idea));
    setNote(idea.note);
    // Only when the idea itself was changed, not on every reload of the list.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idea.key, idea.note]);

  const save = async (): Promise<void> => {
    if (!dirty) return;
    if (title.trim() === "") {
      setTitle(titleOf(idea));
      return;
    }
    await useIdeaStore.getState().edit(idea, title, note);
  };
  const set = useIdeaStore.getState().setStatus;
  const open = idea.status === null;

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-4 px-6 py-6">
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <span>Written {idea.date === today ? "today" : shortDate(idea.date)}</span>
        {idea.status === "used" && (
          <span className="rounded-full border px-2">Turned into something</span>
        )}
        {idea.status === "archived" && <span className="rounded-full border px-2">Archived</span>}
      </div>
      <Input
        aria-label="The idea"
        className="h-11 text-base font-semibold"
        value={title}
        onChange={(e) => {
          setTitle(e.target.value);
        }}
        onBlur={() => {
          void save();
        }}
      />
      <Textarea
        aria-label="Note for the idea"
        rows={10}
        className="resize-y"
        placeholder="A note for the idea. Write what you were thinking, links, next steps… It is saved when you click away."
        value={note}
        onChange={(e) => {
          setNote(e.target.value);
        }}
        onBlur={() => {
          void save();
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
            e.preventDefault();
            void save();
          }
        }}
      />
      <div className="flex flex-wrap items-center gap-2">
        {open && (
          <>
            <Button
              variant="outline"
              onClick={() => {
                void save().then(() => {
                  setAsking(() => (epic: string) => ideaToTask(idea, epic));
                });
              }}
            >
              Make a task
            </Button>
            <Button
              variant="outline"
              onClick={() => {
                void save().then(() => ideaToNote(idea));
              }}
            >
              Make a note
            </Button>
            <Button
              variant="ghost"
              onClick={() => {
                void set(idea, "archived");
              }}
            >
              <Archive /> Archive
            </Button>
          </>
        )}
        {!open && (
          <Button
            variant="outline"
            onClick={() => {
              void set(idea, null);
            }}
          >
            Bring back
          </Button>
        )}
        <DeleteButton
          what="this idea"
          where="open the note Ideas and choose History to bring it back."
          onDelete={() => {
            void useIdeaStore.getState().remove(idea);
          }}
        />
        <span className="grow" />
        <Button disabled={!dirty} onClick={() => void save()}>
          Save
        </Button>
      </div>
      {open && (
        <div className="flex flex-col gap-3 border-t pt-4">
          <AiAsk
            label="Think it through"
            title="Questions to think about"
            notePath={null}
            instruction={THINK_INSTRUCTION}
            text={() => `${title}\n\n${note}`}
            actions={(answer, close) => (
              <Button
                size="sm"
                onClick={() => {
                  const next = `${note.trim()}${note.trim() === "" ? "" : "\n\n"}${answer}`;
                  setNote(next);
                  void useIdeaStore.getState().edit(idea, title, next);
                  close();
                }}
              >
                Add to the idea's note
              </Button>
            )}
          />
          <AiAsk
            label="Suggest first steps"
            title="First steps"
            notePath={null}
            instruction={STEPS_INSTRUCTION}
            text={() => `${title}\n\n${note}`}
            actions={(answer, close) => {
              const steps = stepsFromAnswer(answer);
              return (
                <Button
                  size="sm"
                  disabled={steps.length === 0}
                  onClick={() => {
                    // One task with the steps under it, not one task for each step.
                    setAsking(() => async (epic: string) => {
                      await useTaskStore
                        .getState()
                        .add(title.replace(/#\S+/g, "").trim(), "", steps, epic);
                      useUiStore
                        .getState()
                        .toast(`Made one task with ${String(steps.length)} steps.`, "success");
                      close();
                    });
                  }}
                >
                  Make a task with {steps.length} steps
                </Button>
              );
            }}
          />
        </div>
      )}
      <p className="text-xs text-muted-foreground">
        An idea you turn into a task or a note stays here, marked as used, so nothing is lost. The
        note you write here goes with it.
      </p>
      {asking !== null && (
        <ChooseEpicDialog
          title="Make a task"
          onCancel={() => {
            setAsking(null);
          }}
          onChoose={(epic) => {
            const run = asking;
            setAsking(null);
            void run(epic);
          }}
        />
      )}
    </div>
  );
}

/** The Ideas area: the idea picked in the list on the left, or a box to write a new one. */
export function IdeasView() {
  const ideas = useIdeaStore((s) => s.ideas);
  const selected = useIdeaStore((s) => s.selectedLine);
  const picked = ideas.find((i) => i.line === selected);

  useEffect(() => {
    void useIdeaStore.getState().load();
  }, []);

  return (
    <section aria-label="Ideas" className="flex h-full min-h-0 flex-col bg-background">
      <ViewHeader
        title={picked ? "Idea" : "Ideas"}
        back={
          picked
            ? {
                label: "Ideas",
                run: () => {
                  useIdeaStore.getState().select(null);
                },
              }
            : undefined
        }
      >
        {picked && (
          <Button
            size="sm"
            variant="outline"
            onClick={() => {
              useIdeaStore.getState().select(null);
            }}
          >
            New idea
          </Button>
        )}
      </ViewHeader>
      <div className="min-h-0 flex-1 overflow-auto">
        {picked ? (
          <IdeaEditor key={picked.line} idea={picked} />
        ) : (
          <div className="mx-auto flex w-full max-w-xl flex-col gap-4 px-6 py-8">
            <div>
              <p className="text-base font-semibold">Write an idea down</p>
              <p className="text-sm text-muted-foreground">
                Give it a title and, if you like, a small note. Pick an idea in the list on the left
                to read it or change it. You can also press <b>Ctrl/Cmd+Shift+N</b> from anywhere.
              </p>
            </div>
            <CaptureBox
              initialKind="idea"
              kinds={["idea"]}
              onSaved={() => {
                useIdeaStore.getState().select(useIdeaStore.getState().ideas[0]?.line ?? null);
              }}
            />
          </div>
        )}
      </div>
      <p className="border-t bg-sidebar px-5 py-2 text-[11px] text-muted-foreground">
        Ideas are lines in the note <b>Ideas</b> in the root of your vault, with the note indented
        under them. The note is hidden from the file tree.
      </p>
    </section>
  );
}
