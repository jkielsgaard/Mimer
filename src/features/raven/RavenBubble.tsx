import { Copy, FilePlus } from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Button } from "@/components/ui/button";
import { copyText } from "@/lib/clipboard";
import { cn } from "@/lib/utils";
import type { RavenMessage } from "@/stores/ravenStore";

/** One message in the Raven chat. An answer has Copy and Save as note. */
export function RavenBubble({ m, onSave }: { m: RavenMessage; onSave: (answer: string) => void }) {
  const user = m.role === "user";
  return (
    <div className={cn("flex flex-col gap-1", user ? "items-end" : "items-start")}>
      {!user && m.content !== "" && (
        <div className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
          Raven
        </div>
      )}
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
      {m.error !== null && (
        <div
          role="alert"
          className="max-w-[92%] rounded-md border border-destructive/50 bg-destructive/10 px-3 py-2 text-xs text-destructive"
        >
          {m.error}
        </div>
      )}
      {!user && m.content !== "" && (
        <div className="flex gap-1">
          <Button
            size="sm"
            variant="ghost"
            onClick={() => {
              void copyText(m.content);
            }}
          >
            <Copy /> Copy
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => {
              onSave(m.content);
            }}
          >
            <FilePlus /> Save as note
          </Button>
        </div>
      )}
    </div>
  );
}
