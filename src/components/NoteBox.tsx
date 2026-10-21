import { Textarea } from "@/components/ui/textarea";

interface Props {
  /** The heading above the box. */
  label: string;
  /** What the note is for, shown under the box. */
  hint: string;
  value: string;
  placeholder: string;
  onSave: (text: string) => void;
}

/** A free note: it is saved when the box is left, and only when the text changed. */
export function NoteBox({ label, hint, value, placeholder, onSave }: Props) {
  return (
    <section aria-label={label} className="flex flex-col gap-1.5">
      <h3 className="section-label">{label}</h3>
      <Textarea
        key={value}
        aria-label={label}
        rows={value === "" ? 2 : Math.min(10, value.split("\n").length + 1)}
        className="min-h-0 resize-y"
        placeholder={placeholder}
        defaultValue={value}
        onBlur={(e) => {
          const text = e.target.value.trim();
          if (text !== value.trim()) onSave(text);
        }}
      />
      <p className="text-[11px] text-muted-foreground">{hint}</p>
    </section>
  );
}
