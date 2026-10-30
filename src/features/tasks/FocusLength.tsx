import { ChevronDown } from "lucide-react";
import { useState } from "react";
import { PromptDialog } from "@/components/PromptDialog";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { FOCUS_PRESETS, FOCUS_MAX, FOCUS_MIN, minutesError } from "@/lib/focusTime";

/**
 * How long the Focus timer runs: a short list of lengths and "Custom…" for any other number of
 * minutes. The length in use shows on the button; it cannot be changed while the timer runs.
 */
export function FocusLength({
  minutes,
  disabled,
  onChange,
}: {
  minutes: number;
  disabled: boolean;
  onChange: (minutes: number) => void;
}) {
  const [custom, setCustom] = useState(false);
  const preset = (FOCUS_PRESETS as readonly number[]).includes(minutes);
  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button size="sm" variant="outline" disabled={disabled} aria-label="How long">
            {minutes} min <ChevronDown />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="center" className="w-40">
          {FOCUS_PRESETS.map((m) => (
            <DropdownMenuItem
              key={m}
              aria-checked={m === minutes}
              onSelect={() => {
                onChange(m);
              }}
            >
              {m} min {m === minutes && "✓"}
            </DropdownMenuItem>
          ))}
          <DropdownMenuSeparator />
          <DropdownMenuItem
            onSelect={() => {
              setCustom(true);
            }}
          >
            Custom… {!preset && `(${String(minutes)} min ✓)`}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <PromptDialog
        open={custom}
        title="How many minutes?"
        label={`From ${String(FOCUS_MIN)} to ${String(FOCUS_MAX)}`}
        confirmLabel="Use it"
        initialValue={String(minutes)}
        validate={(v) => minutesError(v)}
        onCancel={() => {
          setCustom(false);
        }}
        onSubmit={(v) => {
          setCustom(false);
          onChange(Number(v));
        }}
      />
    </>
  );
}
