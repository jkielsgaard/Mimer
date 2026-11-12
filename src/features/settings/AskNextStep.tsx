import { useState } from "react";
import { Checkbox } from "@/components/ui/checkbox";
import { askNextStep, setAskNextStep } from "@/lib/focusTime";

/**
 * Settings → General: whether Mimer asks "What is the next step?" when you leave Focus. Kept on
 * this computer, and changed at once (it is not part of Save).
 */
export function AskNextStep() {
  const [on, setOn] = useState(askNextStep);
  return (
    <label className="flex items-start gap-2 text-sm">
      <Checkbox
        className="mt-0.5"
        checked={on}
        onChange={(e) => {
          setOn(e.target.checked);
          setAskNextStep(e.target.checked);
        }}
      />
      <span>
        Ask for the next step when I leave Focus
        <span className="block text-xs text-muted-foreground">
          One line about where you left off. It shows on the task and on the start page when you
          come back.
        </span>
      </span>
    </label>
  );
}
