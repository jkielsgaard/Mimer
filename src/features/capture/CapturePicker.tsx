import { Plus, X } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { CAPTURE_KINDS, CaptureBox, type CaptureKind } from "./CaptureBox";

const ORDER: { kind: CaptureKind; label: string }[] = [
  { kind: "task", label: "Task" },
  { kind: "idea", label: "Idea" },
  { kind: "note", label: "Quick note" },
];

/**
 * Three buttons, + Task, + Idea and + Quick note, where there is room to write something down
 * without leaving the screen (a meeting, Focus, the start page). A press opens the box for that
 * one kind; it stays open after saving, so the next thing can be written at once.
 */
export function CapturePicker({
  onSaved,
  epic,
  aroundNote,
}: {
  onSaved?: (what: string, open: () => void) => void;
  epic?: string;
  aroundNote?: { path: string; title: string };
}) {
  const [kind, setKind] = useState<CaptureKind | null>(null);
  return (
    <div className="flex w-full flex-col gap-2">
      <div role="group" aria-label="Write down a" className="flex flex-wrap gap-1.5">
        {ORDER.map((o) => (
          <Button
            key={o.kind}
            type="button"
            size="sm"
            variant="outline"
            aria-pressed={kind === o.kind}
            className={cn(kind === o.kind && "border-primary bg-accent text-accent-foreground")}
            onClick={() => {
              setKind(o.kind);
            }}
          >
            <Plus /> {o.label}
          </Button>
        ))}
      </div>
      {kind !== null && (
        <div className="flex flex-col gap-2 rounded-lg border bg-card p-3">
          <div className="flex items-center">
            <span className="flex-1 text-sm font-semibold">{CAPTURE_KINDS[kind].title}</span>
            <Button
              type="button"
              size="icon"
              variant="ghost"
              className="size-6"
              aria-label="Close the box"
              onClick={() => {
                setKind(null);
              }}
            >
              <X />
            </Button>
          </div>
          <CaptureBox
            key={kind}
            kind={kind}
            autoFocus
            epic={epic}
            aroundNote={aroundNote}
            onSaved={onSaved}
          />
        </div>
      )}
    </div>
  );
}
