import { useState } from "react";
import type { PreviewResult } from "@/bindings/PreviewResult";
import type { Skill } from "@/bindings/Skill";
import { DiffView } from "@/components/DiffView";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ChecksList } from "@/features/proposals/ChecksList";
import { api, toApiError } from "@/lib/api";
import { useVaultStore } from "@/stores/vaultStore";

/**
 * Try a skill on one note: what it would do, before and after, and Mimer's checks. Nothing is
 * proposed or written; it works for a skill that is not saved yet.
 */
export function SkillTry({ skill }: { skill: Skill }) {
  const files = useVaultStore((s) => s.files);
  const activePath = useVaultStore((s) => s.activePath);
  const [path, setPath] = useState("");
  const [result, setResult] = useState<PreviewResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [trying, setTrying] = useState(false);
  const notes = files.filter((f) => f.endsWith(".md"));

  if (skill.kind === "answer") {
    return (
      <p className="rounded-md border border-dashed p-3 text-xs text-muted-foreground">
        This skill answers in the chat and changes nothing, so there is nothing to try here. Use it
        from the Skills button in the chat.
      </p>
    );
  }

  const run = async (): Promise<void> => {
    const target = path.trim() !== "" ? path.trim() : (activePath ?? notes[0] ?? "");
    if (target === "") {
      setError("Open a note, or type the name of one, to try the skill on.");
      return;
    }
    setTrying(true);
    setError(null);
    setResult(null);
    try {
      setResult(await api.previewSkill({ ...skill, builtin: false }, target));
      if (path.trim() === "") setPath(target);
    } catch (e) {
      setError(toApiError(e).message);
    } finally {
      setTrying(false);
    }
  };

  return (
    <section aria-label="Try it on a note" className="flex min-h-0 flex-col gap-3">
      <div className="flex items-center gap-2">
        <label htmlFor="skill-try-note" className="shrink-0 text-xs text-muted-foreground">
          Note
        </label>
        <Input
          id="skill-try-note"
          aria-label="Note to try it on"
          list="skill-try-notes"
          placeholder={activePath ?? notes[0] ?? "Choose a note"}
          value={path}
          onChange={(e) => {
            setPath(e.target.value);
          }}
        />
        <datalist id="skill-try-notes">
          {notes.slice(0, 300).map((f) => (
            <option key={f} value={f} />
          ))}
        </datalist>
        <Button
          size="sm"
          variant={result ? "outline" : "default"}
          disabled={trying || skill.instruction.trim() === ""}
          onClick={() => {
            void run();
          }}
        >
          {trying ? "Trying…" : result ? "Try again" : "Try it"}
        </Button>
      </div>
      {trying && (
        <p role="status" className="text-xs text-muted-foreground">
          The AI is working on the note. A small model can take a minute.
        </p>
      )}
      {error !== null && (
        <p role="alert" className="text-xs text-destructive">
          {error}
        </p>
      )}
      {result && (
        <div className="flex min-h-0 flex-col gap-3" data-testid="skill-try-result">
          {result.note !== null && (
            <p role="status" className="rounded-md bg-muted px-3 py-2 text-xs">
              {result.note}
            </p>
          )}
          {skill.kind === "sort" ? (
            <p className="rounded-md border p-3 text-sm">
              <span className="text-muted-foreground">Would move</span> {result.before}{" "}
              <span className="text-muted-foreground">to</span>{" "}
              <span className="font-semibold">{result.after}</span>
            </p>
          ) : skill.kind === "create" ? (
            <pre className="max-h-64 overflow-auto whitespace-pre-wrap rounded-md border p-3 font-sans text-sm">
              {result.after}
            </pre>
          ) : (
            result.note === null && (
              <div className="max-h-64 overflow-auto rounded-md border">
                <DiffView original={result.before} modified={result.after} />
              </div>
            )
          )}
          {result.checks.length > 0 && (
            <ChecksList
              checks={result.checks}
              note="A run would leave this change unselected in the review. Change the description, or try another note."
            />
          )}
          <p className="text-xs text-muted-foreground">
            Nothing has been changed in your notes. This is only a test.
          </p>
        </div>
      )}
    </section>
  );
}
