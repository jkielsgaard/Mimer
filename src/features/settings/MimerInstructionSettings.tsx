import { useEffect, useState } from "react";
import type { Settings } from "@/bindings/Settings";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { api } from "@/lib/api";
import { InfoHint } from "@/components/InfoHint";

interface Props {
  draft: Settings;
  onChange: (s: Settings) => void;
}

/**
 * Edits Mimer's base instruction (who Mimer is). The built-in default is shown when nothing
 * custom is stored; saving text equal to the default stores nothing, so future improvements
 * to the default still reach users who never changed it.
 */
export function MimerInstructionSettings({ draft, onChange }: Props) {
  const [defaultText, setDefaultText] = useState("");

  useEffect(() => {
    api
      .getDefaultBaseInstruction()
      .then(setDefaultText)
      .catch(() => undefined);
  }, []);

  const stored = draft.ai.baseInstruction;
  const set = (value: string): void => {
    onChange({
      ...draft,
      ai: { ...draft.ai, baseInstruction: value === defaultText ? "" : value },
    });
  };

  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5">
          <Label htmlFor="set-base">Mimer's base instruction</Label>
          <InfoHint
            label="Base instruction"
            text="Who Mimer is. Change it to change Mimer's role or tone. The safety rules, that Mimer only proposes changes and stays inside the project, cannot be changed here."
            topic="mimer"
          />
        </div>
        <Button
          variant="ghost"
          size="sm"
          disabled={stored === ""}
          onClick={() => {
            set("");
          }}
        >
          Reset to default
        </Button>
      </div>
      <Textarea
        id="set-base"
        rows={9}
        value={stored === "" ? defaultText : stored}
        onChange={(e) => {
          set(e.target.value);
        }}
      />
      <p className="text-xs text-muted-foreground">
        Describes who Mimer is. The safety rules (Mimer only proposes changes, and stays inside the
        project) cannot be changed here. An empty field means the default.
      </p>
    </div>
  );
}
