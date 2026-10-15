import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { ProposalCard } from "@/features/proposals/ProposalCard";
import { MentionChips } from "./MentionChips";
import { ProgressLine } from "./ProgressLine";
import { ResearchPromptCard } from "./ResearchPromptCard";
import { cn } from "@/lib/utils";
import { type ChatMessage } from "@/stores/chatStore";

export function Bubble({ m }: { m: ChatMessage }) {
  const user = m.role === "user";
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
              <ReactMarkdown remarkPlugins={[remarkGfm]}>{m.content}</ReactMarkdown>
            </div>
          )}
        </div>
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
    </div>
  );
}
