import { useEffect, useRef, useState } from "react";
import { Input } from "@/components/ui/input";
import { formatTime, parseTime, resolveTimeFormat } from "@/lib/timeFormat";
import { useUiStore } from "@/stores/uiStore";

/**
 * A time written in the way chosen in Settings (24-hour or 12-hour). It reads `14:30`, `1430`,
 * `2:30 pm` and so on, and hands on `HH:MM` (or "" when the box is empty). A time that cannot be
 * read is marked and is not handed on.
 */
export function TimeInput({
  id,
  value,
  onChange,
  onValid,
}: {
  id: string;
  /** `HH:MM`, or "". */
  value: string;
  onChange: (hhmm: string) => void;
  /** Told whether the text in the box can be read, so a form can refuse to save a wrong time. */
  onValid?: (ok: boolean) => void;
}) {
  const format = useUiStore((s) => s.timeFormat);
  const [text, setText] = useState(() => formatTime(value, format));
  const [bad, setBad] = useState(false);

  /** The last time this box handed on, so its own change does not rewrite what is being typed. */
  const handedOn = useRef(value);

  // The time is set from outside (the window opens with another time).
  useEffect(() => {
    if (value === handedOn.current) return;
    handedOn.current = value;
    setText(formatTime(value, format));
    setBad(false);
  }, [value, format]);

  // The format is changed in Settings.
  useEffect(() => {
    setText(formatTime(handedOn.current, format));
  }, [format]);

  return (
    <Input
      id={id}
      inputMode="text"
      autoComplete="off"
      placeholder={resolveTimeFormat(format) === "12" ? "2:30 PM" : "14:30"}
      aria-invalid={bad}
      value={text}
      onChange={(e) => {
        const t = e.target.value;
        setText(t);
        if (t.trim() === "") {
          setBad(false);
          onValid?.(true);
          handedOn.current = "";
          onChange("");
          return;
        }
        const parsed = parseTime(t);
        setBad(parsed === null);
        onValid?.(parsed !== null);
        if (parsed !== null) {
          handedOn.current = parsed;
          onChange(parsed);
        }
      }}
      onBlur={() => {
        setText(formatTime(handedOn.current, format));
        setBad(false);
        onValid?.(true);
      }}
    />
  );
}
