import { useEffect, useState } from "react";
import type { HelperSettings } from "@/bindings/HelperSettings";
import type { HelperStatus } from "@/bindings/HelperStatus";
import type { KeyStatus } from "@/bindings/KeyStatus";
import { Checkbox } from "@/components/ui/checkbox";
import { InfoHint } from "@/components/InfoHint";
import { Input } from "@/components/ui/input";
import { PlainButton } from "@/components/ui/plain-button";
import { api } from "@/lib/api";
import { useSettingsStore } from "@/stores/settingsStore";
import { combinationFromEvent } from "./helperKeys";

const DEFAULT_NOTE_KEY = "Ctrl+Alt+N";
const DEFAULT_PARK_KEY = "Ctrl+Alt+P";

/** One key combination: click the box and press the keys you want. */
function KeyField({
  id,
  label,
  value,
  disabled,
  status,
  fallback,
  onChange,
}: {
  id: string;
  label: string;
  value: string;
  disabled: boolean;
  /** How the saved key went; shown only while the saved key is the one shown. */
  status: KeyStatus | null;
  fallback: string;
  onChange: (next: string) => void;
}) {
  const [hint, setHint] = useState<string | null>(null);
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="text-sm">
        {label}
      </label>
      <div className="flex items-center gap-2">
        <Input
          id={id}
          data-no-ai
          readOnly
          disabled={disabled}
          className="w-44 font-mono"
          value={value}
          onFocus={() => {
            setHint("Press the keys you want, for example Ctrl+Alt+N.");
          }}
          onBlur={() => {
            setHint(null);
          }}
          onKeyDown={(e) => {
            if (e.key === "Tab") return;
            e.preventDefault();
            if (e.key === "Escape") {
              e.currentTarget.blur();
              return;
            }
            const next = combinationFromEvent(e);
            if (next === null) {
              setHint("Use Ctrl, Alt or Shift together with a letter, a digit or an F key.");
              return;
            }
            setHint(null);
            onChange(next);
          }}
        />
        <PlainButton
          type="button"
          disabled={disabled || value === fallback}
          className="text-xs text-muted-foreground underline hover:text-foreground disabled:no-underline disabled:opacity-50"
          onClick={() => {
            onChange(fallback);
          }}
        >
          Use {fallback}
        </PlainButton>
      </div>
      {hint !== null && <span className="text-xs text-muted-foreground">{hint}</span>}
      {hint === null && status !== null && (
        <span
          role="status"
          className={status.ok ? "text-xs text-success" : "text-xs text-destructive"}
        >
          {status.ok ? "Works" : status.problem}
        </span>
      )}
    </div>
  );
}

/**
 * Settings → General → Taskbar helper: an icon in the Windows taskbar and keys that work in every
 * program (write something down, say where you left off). It is off until turned on. The keys can
 * be changed if another program already uses them. On other systems it is greyed out.
 */
export function TaskbarHelperSettings({
  helper,
  onChange,
}: {
  helper: HelperSettings;
  onChange: (next: HelperSettings) => void;
}) {
  const [status, setStatus] = useState<HelperStatus | null>(null);
  const saved = useSettingsStore((s) => s.settings?.helper);
  useEffect(() => {
    let live = true;
    void Promise.resolve()
      .then(() => api.helperStatus())
      .then((s) => {
        if (live) setStatus(s);
      })
      .catch(() => {
        if (live) setStatus({ supported: false, running: false, quickNote: nope, park: nope });
      });
    return () => {
      live = false;
    };
  }, [saved]);

  const supported = status?.supported === true;
  const off = !supported;
  const set = (patch: Partial<HelperSettings>): void => {
    onChange({ ...helper, ...patch });
  };
  // What the last save found out is only true for the keys that were saved.
  const noteStatus =
    saved?.enabled === true && saved.quickNoteKey === helper.quickNoteKey
      ? (status?.quickNote ?? null)
      : null;
  const parkStatus =
    saved?.enabled === true && saved.parkKey === helper.parkKey ? (status?.park ?? null) : null;

  return (
    <fieldset className={`flex flex-col gap-2.5 ${off ? "opacity-60" : ""}`} aria-disabled={off}>
      <legend className="mb-1 flex items-center gap-1.5 text-sm font-medium">
        Taskbar helper
        <InfoHint
          label="Taskbar helper"
          text="An icon in the Windows taskbar and keys that work in every program: write something down, or say where you left off in a task. Read more in the guide."
          topic="helper"
        />
      </legend>
      {off && (
        <p className="text-xs text-muted-foreground">
          The taskbar helper works on Windows only. Here it is greyed out.
        </p>
      )}
      <label className="flex items-start gap-2 text-sm">
        <Checkbox
          className="mt-0.5"
          disabled={off}
          checked={helper.enabled}
          onChange={(e) => {
            set({ enabled: e.target.checked });
          }}
        />
        <span>
          Turn on the taskbar helper
          <span className="block text-xs text-muted-foreground">
            Puts Mimer in the taskbar. The keys below then work in every program.
          </span>
        </span>
      </label>
      <KeyField
        id="helper-note-key"
        label="Write something down"
        value={helper.quickNoteKey}
        disabled={off || !helper.enabled}
        status={noteStatus}
        fallback={DEFAULT_NOTE_KEY}
        onChange={(quickNoteKey) => {
          set({ quickNoteKey });
        }}
      />
      <KeyField
        id="helper-park-key"
        label="Where I left off"
        value={helper.parkKey}
        disabled={off || !helper.enabled}
        status={parkStatus}
        fallback={DEFAULT_PARK_KEY}
        onChange={(parkKey) => {
          set({ parkKey });
        }}
      />
      <label className="flex items-start gap-2 text-sm">
        <Checkbox
          className="mt-0.5"
          disabled={off || !helper.enabled}
          checked={helper.keepRunning}
          onChange={(e) => {
            set({ keepRunning: e.target.checked });
          }}
        />
        <span>
          Keep Mimer running when I close the window
          <span className="block text-xs text-muted-foreground">
            The window is hidden and Mimer stays in the taskbar. Choose Quit Mimer in its menu to
            end it.
          </span>
        </span>
      </label>
    </fieldset>
  );
}

const nope: KeyStatus = { ok: false, problem: "" };
