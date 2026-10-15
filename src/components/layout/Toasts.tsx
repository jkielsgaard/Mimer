import { X } from "lucide-react";
import { cn } from "@/lib/utils";
import { useUiStore } from "@/stores/uiStore";

/** Transient messages; errors show the backend's message. */
export function Toasts() {
  const toasts = useUiStore((s) => s.toasts);
  const dismiss = useUiStore((s) => s.dismissToast);
  return (
    <div
      className="pointer-events-none fixed bottom-9 right-3 z-[60] flex w-80 max-w-[90vw] flex-col gap-2"
      aria-live="polite"
    >
      {toasts.map((t) => (
        <div
          key={t.id}
          role={t.kind === "error" ? "alert" : "status"}
          className={cn(
            "pointer-events-auto flex items-start gap-2 rounded-md border bg-card px-3 py-2 text-sm shadow-lg",
            t.kind === "error" && "border-destructive/60",
            t.kind === "success" && "border-success/60",
          )}
        >
          <span className="flex-1 break-words">{t.message}</span>
          <button
            type="button"
            aria-label="Dismiss"
            className="text-muted-foreground hover:text-foreground"
            onClick={() => {
              dismiss(t.id);
            }}
          >
            <X className="size-3.5" />
          </button>
        </div>
      ))}
    </div>
  );
}
