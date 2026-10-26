import { cn } from "@/lib/utils";

/** A small "Beta" mark: shown where the AI is, because that part is still being built. */
export function BetaBadge({ className }: { className?: string }) {
  return (
    <span
      data-testid="beta-badge"
      title="The AI is in beta: it is still being built, will change and can make mistakes."
      className={cn(
        "inline-flex items-center rounded-full border border-warning/50 bg-warning/15 px-1.5 text-[10px] font-bold uppercase leading-4 tracking-wide text-foreground",
        className,
      )}
    >
      Beta
    </span>
  );
}
