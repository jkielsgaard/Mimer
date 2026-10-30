import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { cn } from "@/lib/utils";

/**
 * Text written as Markdown, shown formatted: bold, italic, lists, links, code. It is the read-only
 * twin of `MarkdownField`. A line break in the text is a line break on the screen.
 */
export function MarkdownText({ text, className }: { text: string; className?: string }) {
  return (
    <div className={cn("chat-markdown md-text text-sm", className)}>
      <ReactMarkdown remarkPlugins={[remarkGfm]}>{text}</ReactMarkdown>
    </div>
  );
}
