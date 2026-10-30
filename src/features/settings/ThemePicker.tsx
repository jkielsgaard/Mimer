import { Check } from "lucide-react";
import { useEffect } from "react";
import { Checkbox } from "@/components/ui/checkbox";
import { PlainButton } from "@/components/ui/plain-button";
import {
  applyTheme,
  computerIsDark,
  resolveTheme,
  THEMES,
  type ThemeId,
  type ThemeSetting,
} from "@/lib/themes";
import { cn } from "@/lib/utils";
import { useSettingsStore } from "@/stores/settingsStore";

/** A small model of Mimer in one theme. The colours come from the theme's own tokens. */
function Preview({ id }: { id: ThemeId }) {
  return (
    <div
      data-theme={id}
      aria-hidden
      className="flex h-[88px] overflow-hidden rounded-md border bg-background text-[9px] text-foreground"
    >
      <div className="flex w-[14px] flex-col items-center gap-1 border-r bg-sidebar pt-1.5">
        <span className="size-2 rounded-sm bg-accent" />
        <span className="size-2 rounded-sm bg-muted" />
      </div>
      <div className="flex w-[40px] flex-col gap-0.5 border-r bg-sidebar p-1">
        <b>Meetings</b>
        <span className="rounded-sm bg-accent px-0.5 text-accent-foreground">Weekly</span>
        <span className="px-0.5">Budget</span>
      </div>
      <div className="flex min-w-0 flex-1 flex-col gap-1 p-1.5">
        <div className="flex items-center">
          <b className="flex-1 text-[10px]">Weekly</b>
          <span className="rounded-sm bg-primary px-1 font-semibold text-primary-foreground">
            Start
          </span>
        </div>
        <div className="rounded-sm border bg-card p-1 leading-tight">
          <span className="text-muted-foreground">AGENDA</span>
          <br />☑ Budget
        </div>
        <span className="w-fit rounded-full bg-accent px-1 font-bold text-accent-foreground">
          doing
        </span>
      </div>
    </div>
  );
}

/**
 * Settings → General → Theme: the eight themes as cards, and a box that makes Mimer follow the
 * computer (Light or Dark). A choice shows at once; it is kept when Settings is saved, and
 * undone when Settings is closed without saving.
 */
export function ThemePicker({
  value,
  onChange,
}: {
  value: ThemeSetting;
  onChange: (theme: ThemeSetting) => void;
}) {
  const follows = value === "system";
  const shown = resolveTheme(value, computerIsDark());

  // Closing Settings without saving puts the saved theme back.
  useEffect(
    () => () => {
      const saved = useSettingsStore.getState().settings;
      if (saved) applyTheme(saved.theme);
    },
    [],
  );

  const pick = (theme: ThemeSetting): void => {
    applyTheme(theme);
    onChange(theme);
  };

  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="mb-1 text-sm font-medium">Theme</legend>
      <label className="flex items-center gap-2 text-sm">
        <Checkbox
          checked={follows}
          onChange={(e) => {
            pick(e.target.checked ? "system" : shown);
          }}
        />
        Follow my computer (Light or Dark)
      </label>
      <div
        role="radiogroup"
        aria-label="Theme"
        className={cn("grid grid-cols-2 gap-3 sm:grid-cols-4", follows && "opacity-60")}
      >
        {THEMES.map((t) => {
          const on = !follows && shown === t.id;
          return (
            <PlainButton
              key={t.id}
              role="radio"
              aria-checked={on}
              aria-label={t.label}
              title={t.description}
              className={cn(
                "flex flex-col gap-1.5 rounded-lg border p-1.5 text-left hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring",
                on && "border-primary ring-2 ring-primary/40",
              )}
              onClick={() => {
                pick(t.id);
              }}
            >
              <Preview id={t.id} />
              <span className="flex items-center gap-1 px-0.5 text-sm font-medium">
                {t.label}
                {on && <Check className="size-3.5 text-primary" aria-hidden />}
              </span>
              <span className="px-0.5 text-[11px] leading-tight text-muted-foreground">
                {t.description}
              </span>
            </PlainButton>
          );
        })}
      </div>
    </fieldset>
  );
}
