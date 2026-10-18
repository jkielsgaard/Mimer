import {
  Copy,
  FilePlus2,
  FolderInput,
  MessageSquare,
  PenLine,
  Plus,
  Search,
  SpellCheck,
  Trash2,
} from "lucide-react";
import { useEffect, useState } from "react";
import type { Skill } from "@/bindings/Skill";
import type { SkillKind } from "@/bindings/SkillKind";
import type { SkillTarget } from "@/bindings/SkillTarget";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { api } from "@/lib/api";
import { formatShortcut } from "@/lib/shortcuts";
import { cn } from "@/lib/utils";
import { reportError, useUiStore } from "@/stores/uiStore";
import { defaultTarget, GOAL_ORDER, GOALS, nameFrom, TARGET_ORDER, TARGETS } from "./skillGoals";
import { SkillTry } from "./SkillTry";

const ICONS: Record<SkillKind, typeof PenLine> = {
  fix: SpellCheck,
  rewrite: PenLine,
  sort: FolderInput,
  create: FilePlus2,
  answer: MessageSquare,
};

type Step = 1 | 2;

const blank = (): Skill => ({
  id: "",
  name: "",
  description: "",
  kind: "fix",
  appliesTo: "both",
  instruction: "",
  builtin: false,
});

/**
 * Settings → Skills: the list on the left; on the right, a skill is made in two steps:
 * say what it should do and what should happen to the notes, then try it on a note and save.
 */
export function SkillsTab() {
  const [skills, setSkills] = useState<Skill[]>([]);
  const [form, setForm] = useState<Skill | null>(null);
  const [step, setStep] = useState<Step>(1);
  /** True once the user typed a name, so it is no longer made from the description. */
  const [ownName, setOwnName] = useState(false);
  const [ownTarget, setOwnTarget] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const [saving, setSaving] = useState(false);
  const [filter, setFilter] = useState("");

  const open = (s: Skill, at: Step = 1): void => {
    setForm({ ...s });
    setStep(at);
    setOwnName(s.name !== "");
    setOwnTarget(s.id !== "");
  };

  const load = async (select?: string): Promise<void> => {
    try {
      const list = await api.listSkills();
      setSkills(list);
      const focus = select ?? useUiStore.getState().skillsFocus ?? undefined;
      if (focus !== undefined) {
        useUiStore.setState({ skillsFocus: null });
        const found = list.find((s) => s.id === focus);
        if (found) open(found);
      }
    } catch (e) {
      reportError(e);
    }
  };
  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- the list is loaded once, on open
  }, []);

  const q = filter.trim().toLowerCase();
  const shown = skills.filter(
    (s) => q === "" || s.name.toLowerCase().includes(q) || s.description.toLowerCase().includes(q),
  );
  const mine = shown.filter((s) => !s.builtin);
  const builtinGroups = GOAL_ORDER.map((k) => ({
    label: GOALS[k].group,
    items: shown.filter((s) => s.builtin && s.kind === k),
  })).filter((g) => g.items.length > 0);

  const set = (patch: Partial<Skill>): void => {
    setForm((f) => (f ? { ...f, ...patch } : f));
  };

  const save = async (): Promise<void> => {
    if (!form || form.builtin) return;
    setSaving(true);
    try {
      const saved = await api.saveSkill({ ...form, builtin: false });
      await load(saved.id);
      useUiStore.getState().toast("Skill saved", "success");
    } catch (e) {
      reportError(e);
    } finally {
      setSaving(false);
    }
  };

  const remove = async (): Promise<void> => {
    if (!form || form.id === "") return;
    try {
      await api.removeSkill(form.id);
      setForm(null);
      await load();
    } catch (e) {
      reportError(e);
    }
  };

  const item = (s: Skill) => (
    <li key={s.id}>
      <button
        type="button"
        aria-current={form?.id === s.id}
        className={cn(
          "flex w-full flex-col rounded px-2 py-1.5 text-left hover:bg-muted",
          form?.id === s.id && "bg-accent",
        )}
        onClick={() => {
          open(s);
        }}
      >
        <span className="truncate text-[13px]">{s.name}</span>
        <span className="truncate text-[11px] text-muted-foreground">{s.description}</span>
      </button>
    </li>
  );

  const editable = form !== null && !form.builtin;

  return (
    <div className="flex h-full min-h-0 gap-3">
      <div className="flex w-52 shrink-0 flex-col gap-2" aria-label="Skills list">
        <Button
          size="sm"
          variant="outline"
          onClick={() => {
            open(blank());
          }}
        >
          <Plus /> Add a skill
        </Button>
        <div className="relative">
          <Search
            className="pointer-events-none absolute left-2 top-2 size-3.5 text-muted-foreground"
            aria-hidden
          />
          <Input
            aria-label="Search skills"
            placeholder="Search skills"
            className="h-7 pl-7 text-xs"
            value={filter}
            onChange={(e) => {
              setFilter(e.target.value);
            }}
          />
        </div>
        <div className="min-h-0 flex-1 overflow-auto rounded border p-1">
          <h3 className="px-2 pb-1 pt-1 text-[11px] font-semibold uppercase text-muted-foreground">
            Your skills
          </h3>
          {mine.length === 0 ? (
            <p className="px-2 pb-2 text-xs text-muted-foreground">
              {q === "" ? "None yet." : "No match."}
            </p>
          ) : (
            <ul>{mine.map(item)}</ul>
          )}
          {builtinGroups.map((g) => (
            <section key={g.label} aria-label={`${g.label} · built in`}>
              <h3 className="px-2 pb-1 pt-2 text-[11px] font-semibold uppercase text-muted-foreground">
                {g.label} · built in
              </h3>
              <ul>{g.items.map(item)}</ul>
            </section>
          ))}
        </div>
      </div>

      <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-auto pr-1">
        {form === null ? (
          <div className="flex flex-col gap-2 text-sm text-muted-foreground">
            <p>
              A skill is a job you can give Mimer for one note or a whole folder: fix the spelling,
              translate, sort into folders, write a summary.
            </p>
            <p>
              Press <strong>Add a skill</strong>, say in your own words what it should do, and try
              it on a note before you save it. Choose a skill in the list to see or try it.
            </p>
          </div>
        ) : form.builtin ? (
          <BuiltinView
            skill={form}
            onCopy={() => {
              open({ ...form, id: "", builtin: false, name: `${form.name} (copy)`.slice(0, 40) });
            }}
          />
        ) : step === 1 ? (
          <div className="flex flex-col gap-4">
            <div className="flex items-center">
              <h2 className="flex-1 text-base font-semibold">
                {form.id === "" ? "New skill" : form.name}
              </h2>
              <span className="text-xs text-muted-foreground">Step 1 of 2</span>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="skill-instruction">
                What should the skill do? Say it in your own words.
              </Label>
              <Textarea
                id="skill-instruction"
                rows={4}
                value={form.instruction}
                maxLength={4000}
                placeholder={`For example: ${GOALS[form.kind].example}`}
                onChange={(e) => {
                  const instruction = e.target.value;
                  set(ownName ? { instruction } : { instruction, name: nameFrom(instruction) });
                }}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <span id="skill-goal-label" className="text-sm font-medium">
                What should happen to the notes?
              </span>
              <div
                role="radiogroup"
                aria-labelledby="skill-goal-label"
                className="flex flex-col gap-1.5"
              >
                {GOAL_ORDER.map((k) => {
                  const Icon = ICONS[k];
                  const on = form.kind === k;
                  return (
                    <button
                      key={k}
                      type="button"
                      role="radio"
                      aria-checked={on}
                      className={cn(
                        "flex items-center gap-3 rounded-lg border px-3 py-2 text-left focus-visible:ring-2 focus-visible:ring-ring",
                        on ? "border-primary bg-accent text-accent-foreground" : "hover:bg-muted",
                      )}
                      onClick={() => {
                        set(ownTarget ? { kind: k } : { kind: k, appliesTo: defaultTarget(k) });
                      }}
                    >
                      <Icon className="size-4 shrink-0" aria-hidden />
                      <span className="flex min-w-0 flex-col">
                        <span className="text-[13px] font-semibold">{GOALS[k].title}</span>
                        <span className="text-xs text-muted-foreground">{GOALS[k].text}</span>
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              {form.id !== "" && (
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    setConfirmRemove(true);
                  }}
                >
                  <Trash2 /> Remove
                </Button>
              )}
              <span className="flex-1" />
              <Button
                size="sm"
                disabled={form.instruction.trim() === ""}
                onClick={() => {
                  setStep(2);
                }}
              >
                Next: try it on a note
              </Button>
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            <div className="flex items-center">
              <h2 className="flex-1 text-base font-semibold">Try it on a note</h2>
              <span className="text-xs text-muted-foreground">Step 2 of 2</span>
            </div>
            <p className="rounded-md bg-muted px-3 py-2 text-xs">
              <span className="font-medium">{GOALS[form.kind].title}:</span> {form.instruction}
            </p>
            <SkillTry skill={form} />
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="flex flex-col gap-1">
                <Label htmlFor="skill-name">Name</Label>
                <Input
                  id="skill-name"
                  value={form.name}
                  maxLength={40}
                  placeholder="For example: Translate to English"
                  onChange={(e) => {
                    setOwnName(true);
                    set({ name: e.target.value });
                  }}
                />
              </div>
              <div className="flex flex-col gap-1">
                <Label htmlFor="skill-target">Offer it when I right-click</Label>
                <Select
                  id="skill-target"
                  value={form.appliesTo}
                  onChange={(e) => {
                    setOwnTarget(true);
                    set({ appliesTo: e.target.value as SkillTarget });
                  }}
                >
                  {TARGET_ORDER.map((t) => (
                    <option key={t} value={t}>
                      {TARGETS[t].label}
                    </option>
                  ))}
                </Select>
              </div>
            </div>
            <p className="text-xs text-muted-foreground" data-testid="skill-shown-in">
              You find it in the right-click menu of the file tree, the Skills button in the chat
              and the command palette ({formatShortcut("Mod+Shift+P")}).
            </p>
            <div className="flex flex-wrap gap-2">
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  setStep(1);
                }}
              >
                Back: change the description
              </Button>
              <span className="flex-1" />
              <Button
                size="sm"
                disabled={!editable || saving || form.name.trim() === ""}
                onClick={() => {
                  void save();
                }}
              >
                Save the skill
              </Button>
            </div>
          </div>
        )}
      </div>

      <ConfirmDialog
        open={confirmRemove}
        title="Remove this skill?"
        description="The skill is deleted. Notes it has already changed are not affected."
        confirmLabel="Remove"
        destructive
        onCancel={() => {
          setConfirmRemove(false);
        }}
        onConfirm={() => {
          setConfirmRemove(false);
          void remove();
        }}
      />
    </div>
  );
}

/** A built-in skill: what it does, a try box, and a copy to change. */
function BuiltinView({ skill, onCopy }: { skill: Skill; onCopy: () => void }) {
  return (
    <div className="flex flex-col gap-4">
      <h2 className="text-base font-semibold">{skill.name}</h2>
      <p
        role="note"
        data-testid="skill-builtin-note"
        className="rounded border bg-muted/40 p-2 text-xs"
      >
        This skill comes with Mimer and cannot be changed. Copy it to make your own version.
      </p>
      <dl className="grid grid-cols-[9rem_1fr] gap-x-3 gap-y-1.5 text-sm">
        <dt className="text-muted-foreground">What happens</dt>
        <dd>{GOALS[skill.kind].title}</dd>
        <dt className="text-muted-foreground">What it does</dt>
        <dd>{skill.instruction}</dd>
        <dt className="text-muted-foreground">Right-click menu</dt>
        <dd>{TARGETS[skill.appliesTo].label}</dd>
      </dl>
      <SkillTry skill={skill} />
      <div>
        <Button size="sm" variant="outline" onClick={onCopy}>
          <Copy /> Copy to a new skill
        </Button>
      </div>
    </div>
  );
}
