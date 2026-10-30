import { useEffect, useMemo, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { useUiStore } from "@/stores/uiStore";
import { findTopic, searchTopics } from "./helpTopics";
import { PlainButton } from "@/components/ui/plain-button";

/** The how-to guide: a list of topics on the left and the text of the chosen one on the right. */
export function HelpDialog() {
  const open = useUiStore((s) => s.helpOpen);
  const topicId = useUiStore((s) => s.helpTopic);
  const setHelpOpen = useUiStore((s) => s.setHelpOpen);
  const openHelp = useUiStore((s) => s.openHelp);
  const [query, setQuery] = useState("");

  useEffect(() => {
    if (open) setQuery("");
  }, [open]);

  const topics = useMemo(() => searchTopics(query), [query]);
  const topic = findTopic(topicId);

  return (
    <Dialog open={open} onOpenChange={setHelpOpen}>
      <DialogContent className="h-[80vh] max-w-4xl overflow-hidden p-0">
        <DialogTitle className="sr-only">How to use Mimer</DialogTitle>
        <DialogDescription className="sr-only">
          A guide to the features of Mimer. Choose a topic on the left.
        </DialogDescription>
        <div className="flex h-full min-h-0">
          <nav aria-label="Topics" className="flex w-56 shrink-0 flex-col border-r bg-sidebar">
            <div className="p-3 pb-2 text-sm font-semibold">How to use Mimer</div>
            <div className="px-2 pb-2">
              <Input
                data-no-ai
                aria-label="Search the guide"
                placeholder="Search the guide…"
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value);
                }}
              />
            </div>
            <ul className="min-h-0 flex-1 overflow-auto px-1 pb-2">
              {topics.map((t) => (
                <li key={t.id}>
                  <PlainButton
                    type="button"
                    aria-current={t.id === topic.id}
                    className={cn(
                      "w-full rounded px-2 py-1.5 text-left hover:bg-muted",
                      t.id === topic.id && "bg-accent",
                    )}
                    onClick={() => {
                      openHelp(t.id);
                    }}
                  >
                    <div className="text-[13px] font-medium">{t.title}</div>
                    <div className="truncate text-[11px] text-muted-foreground">{t.summary}</div>
                  </PlainButton>
                </li>
              ))}
              {topics.length === 0 && (
                <li className="p-2 text-xs text-muted-foreground">Nothing in the guide matches.</li>
              )}
            </ul>
          </nav>
          <article
            aria-label={topic.title}
            className="chat-markdown help-markdown min-w-0 flex-1 overflow-auto p-6 text-[14px] leading-relaxed"
          >
            <h1 className="mb-3 text-xl font-semibold">{topic.title}</h1>
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{topic.body}</ReactMarkdown>
          </article>
        </div>
      </DialogContent>
    </Dialog>
  );
}
