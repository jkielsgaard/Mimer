import { useEffect } from "react";
import type { EditorSettings } from "@/bindings/EditorSettings";
import { Checkbox } from "@/components/ui/checkbox";
import { PlainButton } from "@/components/ui/plain-button";
import { applyReading, LETTER_SPACINGS, LINE_SPACINGS, TEXT_FONTS } from "@/lib/reading";
import { cn } from "@/lib/utils";
import { useSettingsStore } from "@/stores/settingsStore";

/** One choice out of a few, as buttons side by side. */
function Choice<T extends { id: string; label: string }>({
  label,
  options,
  value,
  onPick,
}: {
  label: string;
  options: readonly T[];
  value: string;
  onPick: (id: T["id"]) => void;
}) {
  return (
    <div className="flex items-center gap-4">
      <span className="w-32 shrink-0 text-sm">{label}</span>
      <div
        role="group"
        aria-label={label}
        className="flex overflow-hidden rounded-md border bg-background text-sm"
      >
        {options.map((o, i) => (
          <PlainButton
            key={o.id}
            type="button"
            aria-pressed={value === o.id}
            className={cn(
              "px-3 py-1",
              i > 0 && "border-l",
              value === o.id ? "bg-accent font-semibold text-accent-foreground" : "hover:bg-muted",
            )}
            onClick={() => {
              onPick(o.id);
            }}
          >
            {o.label}
          </PlainButton>
        ))}
      </div>
    </div>
  );
}

/**
 * Settings → General → Reading: the space between lines and letters, the font, and whether the
 * line you are in is followed. A choice shows at once, in the example and in every note; it is
 * kept when Settings is saved and undone when Settings is closed without saving (like the theme).
 */
export function ReadingSettings({
  editor,
  onChange,
}: {
  editor: EditorSettings;
  onChange: (next: EditorSettings) => void;
}) {
  // Closing Settings without saving puts the saved choices back.
  useEffect(
    () => () => {
      const saved = useSettingsStore.getState().settings;
      if (saved) applyReading(saved.editor);
    },
    [],
  );

  const set = (patch: Partial<EditorSettings>): void => {
    const next = { ...editor, ...patch };
    applyReading(next);
    onChange(next);
  };
  const reset = (): void => {
    set({ lineSpacing: "normal", letterSpacing: "normal", textFont: "system", followLine: false });
  };

  return (
    <fieldset className="flex flex-col gap-2.5">
      <legend className="mb-1 text-sm font-medium">Reading</legend>
      <p className="text-xs text-muted-foreground">
        How the text looks while you read and write. It applies to every note on this computer.
      </p>
      <Choice
        label="Line spacing"
        options={LINE_SPACINGS}
        value={editor.lineSpacing}
        onPick={(id) => {
          set({ lineSpacing: id });
        }}
      />
      <Choice
        label="Letter spacing"
        options={LETTER_SPACINGS}
        value={editor.letterSpacing}
        onPick={(id) => {
          set({ letterSpacing: id });
        }}
      />
      <Choice
        label="Text font"
        options={TEXT_FONTS}
        value={editor.textFont}
        onPick={(id) => {
          set({ textFont: id });
        }}
      />
      <label className="flex items-start gap-2 text-sm">
        <Checkbox
          className="mt-0.5"
          checked={editor.followLine}
          onChange={(e) => {
            set({ followLine: e.target.checked });
          }}
        />
        <span>
          Follow the line
          <span className="block text-xs text-muted-foreground">
            The line you are in stays clear; the others are a little dimmer.
          </span>
        </span>
      </label>
      <div
        aria-label="Example"
        className="rounded-md border bg-background p-3"
        style={{
          fontFamily: "var(--read-font)",
          lineHeight: "var(--read-line-height)",
          letterSpacing: "var(--read-letter-spacing)",
          fontSize: "var(--editor-font-size)",
        }}
      >
        <p style={{ opacity: editor.followLine ? 0.5 : 1 }}>
          Upgrades inside the same major version are free.
        </p>
        <p>
          The price list is fixed for twelve months. After that the vendor may raise prices by at
          most five percent a year.
        </p>
        <p style={{ opacity: editor.followLine ? 0.5 : 1 }}>
          Each seat is licensed to one named person.
        </p>
      </div>
      <div>
        <PlainButton
          type="button"
          className="text-xs text-muted-foreground underline hover:text-foreground"
          onClick={reset}
        >
          Back to the defaults
        </PlainButton>
      </div>
    </fieldset>
  );
}
