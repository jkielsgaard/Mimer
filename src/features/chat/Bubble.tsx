import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { ProposalCard } from "@/features/proposals/ProposalCard";
import { MentionChips } from "./MentionChips";
import { ProgressLine } from "./ProgressLine";
import { ResearchPromptCard } from "./ResearchPromptCard";
import { cn } from "@/lib/utils";
import { type ChatMessage, useChatStore } from "@/stores/chatStore";
import { useUiStore } from "@/stores/uiStore";
import { Button } from "@/components/ui/button";
import { splitLeftOut } from "./leftOut";

export function Bubble({ m }: { m: ChatMessage }) {
  const user = m.role === "user";
  const { main, leftOut } = user ? { main: m.content, leftOut: [] } : splitLeftOut(m.content);
  return (
    <div className={cn("flex flex-col gap-1", user ? "items-end" : "items-start")}>
      {m.activity.map((a, i) => (
        <div key={i} className="text-[11px] italic text-muted-foreground">
          {a}
        </div>
      ))}
      {!user && m.content !== "" && (
        <div className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
          Mimer
        </div>
      )}
      {user && <MentionChips paths={m.mentions} />}
      {(m.content !== "" || user) && (
        <div
          className={cn(
            "max-w-[92%] rounded-lg px-3 py-2 text-[13px] leading-relaxed",
            user ? "bg-primary text-primary-foreground" : "bg-muted",
          )}
        >
          {user ? (
            <span className="whitespace-pre-wrap">{m.content}</span>
          ) : (
            <div className="chat-markdown">
              <ReactMarkdown remarkPlugins={[remarkGfm]}>{main}</ReactMarkdown>
            </div>
          )}
        </div>
      )}
      {leftOut.length > 0 && (
        <details className="max-w-[92%] rounded-md border bg-card px-3 py-2 text-xs">
          <summary className="cursor-pointer font-medium">
            Why {leftOut.length === 1 ? "was 1 note" : `were ${String(leftOut.length)} notes`} left
            out?
          </summary>
          <ul className="mt-1 list-disc space-y-0.5 pl-4 text-muted-foreground">
            {leftOut.map((l, i) => (
              <li key={i}>{l}</li>
            ))}
          </ul>
        </details>
      )}
      {m.progress && <ProgressLine progress={m.progress} />}
      {m.error !== null && (
        <div
          role="alert"
          className="max-w-[92%] rounded-md border border-destructive/50 bg-destructive/10 px-3 py-2 text-xs text-destructive"
        >
          {m.error}
        </div>
      )}
      {m.research.map((card, i) => (
        <ResearchPromptCard key={i} card={card} />
      ))}
      {m.proposalSetId !== null && <ProposalCard setId={m.proposalSetId} />}
      {m.trial && <TrialCard m={m} />}
    </div>
  );
}

/** After the first notes of a long skill run: go on with the rest, or change the skill. */
function TrialCard({ m }: { m: ChatMessage }) {
  const streaming = useChatStore((s) => s.streaming);
  const trial = m.trial;
  if (!trial) return null;
  const rest = trial.rest.length;
  return (
    <section
      aria-label="First notes done"
      className="flex max-w-[92%] flex-col gap-2 rounded-lg border bg-card p-3 text-xs"
    >
      <h3 className="text-[13px] font-semibold">
        First {trial.done} of {trial.total} notes done
      </h3>
      {trial.continued ? (
        <p className="text-muted-foreground">Mimer is doing the other {rest} notes below.</p>
      ) : (
        <>
          <p className="text-muted-foreground">
            Look at the changes first, so you know the skill does what you want. Nothing is written
            until you apply.
          </p>
          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              disabled={streaming}
              onClick={() => {
                void useChatStore.getState().continueSkill(m.id);
              }}
            >
              Looks good, do the other {rest}
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                useUiStore.getState().openSkillsSettings(trial.skillId);
              }}
            >
              Not right, change the skill
            </Button>
          </div>
        </>
      )}
    </section>
  );
}
