import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import type { MeetingParts } from "@/lib/meeting";

const PARTS: { key: keyof MeetingParts; label: string }[] = [
  { key: "agenda", label: "Agenda" },
  { key: "decisions", label: "Decisions" },
  { key: "actions", label: "Actions" },
];

/**
 * "Use in this meeting": the parts a meeting can have besides its notes, each one an option that
 * is off until it is ticked. Used when a meeting is made and when it is changed (in a list), and
 * in the meeting screen (`compact`, in one row).
 */
export function PartsChoice({
  value,
  onChange,
  compact = false,
}: {
  value: MeetingParts;
  onChange: (next: MeetingParts) => void;
  compact?: boolean;
}) {
  return (
    <fieldset
      className={cn("flex gap-1.5", compact ? "flex-wrap items-center gap-x-4" : "flex-col")}
    >
      <legend className={cn("text-sm font-medium", compact ? "sr-only" : "pb-1")}>
        Use in this meeting
      </legend>
      {compact && <span className="section-label">Use</span>}
      {PARTS.map((p) => (
        <Label key={p.key} className="flex items-center gap-2 text-sm font-normal text-foreground">
          <Checkbox
            checked={value[p.key]}
            onChange={(e) => {
              onChange({ ...value, [p.key]: e.target.checked });
            }}
          />
          {p.label}
        </Label>
      ))}
    </fieldset>
  );
}
