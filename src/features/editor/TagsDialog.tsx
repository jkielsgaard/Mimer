import { Diamond, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { PlainButton } from "@/components/ui/plain-button";
import { api } from "@/lib/api";
import { flushPendingWrites } from "@/lib/flush";
import { cleanTagName, isSystemTag, NOTE_TAGS, textTags, userTags } from "@/lib/noteTags";
import { useTagStore } from "@/stores/tagStore";

/** How many of the tags already in the vault are offered at a time. */
const OFFERED = 12;

/**
 * "Tags" on a note: Mimer's own tags (what each one does) and the person's own tags, which can be
 * any word. A tag used on another note is offered as a click. The `#tags` written in the text
 * are listed, but are changed in the text.
 */
export function TagsDialog({
  open,
  onClose,
  path,
  tags,
  setTag,
}: {
  open: boolean;
  onClose: () => void;
  path: string | null;
  tags: readonly string[];
  setTag: (tag: string, on: boolean) => Promise<void>;
}) {
  const vaultTags = useTagStore((s) => s.tags);
  const [text, setText] = useState("");
  const [problem, setProblem] = useState<string | null>(null);
  const [inText, setInText] = useState<string[]>([]);

  // Opening: the tags of the vault, and the #tags in this note's text.
  useEffect(() => {
    if (!open) return;
    setText("");
    setProblem(null);
    void useTagStore.getState().load();
    if (path === null) return;
    let live = true;
    void flushPendingWrites()
      .then(() => api.readNote(path))
      .then((n) => {
        if (live) setInText(textTags(n.content));
      })
      .catch(() => {
        if (live) setInText([]);
      });
    return () => {
      live = false;
    };
  }, [open, path]);

  const mine = userTags(tags);
  const offered = useMemo(() => {
    const typed = text.trim().replace(/^#+/, "").toLowerCase();
    return vaultTags
      .filter((t) => !isSystemTag(t.tag) && !tags.includes(t.tag) && t.tag.startsWith(typed))
      .sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag))
      .slice(0, OFFERED);
  }, [vaultTags, tags, text]);

  const add = (raw: string): void => {
    const tag = cleanTagName(raw);
    if (tag === null) {
      setProblem("A tag is one word: letters, digits, - and _.");
      return;
    }
    setProblem(
      isSystemTag(tag) ? `“${tag}” is one of Mimer's tags, so it was put on above.` : null,
    );
    setText("");
    void setTag(tag, true).then(() => useTagStore.getState().load());
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) onClose();
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Tags</DialogTitle>
          <DialogDescription>
            The note stays where it is. A tag is written in the note's properties.
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-1">
          <span className="section-label">Mimer uses these</span>
          <ul className="flex flex-col gap-1">
            {NOTE_TAGS.map((t) => (
              <li key={t.tag}>
                <label className="flex cursor-pointer items-start gap-3 rounded-md px-2 py-1.5 hover:bg-muted">
                  <Checkbox
                    className="mt-1 size-4"
                    checked={tags.includes(t.tag)}
                    onChange={(e) => void setTag(t.tag, e.target.checked)}
                  />
                  <span className="flex flex-col">
                    <span className="text-sm font-semibold">{t.label}</span>
                    <span className="text-xs text-muted-foreground">{t.does}</span>
                  </span>
                </label>
              </li>
            ))}
          </ul>
        </div>
        <div className="flex flex-col gap-2 border-t pt-3">
          <span className="section-label">Your tags</span>
          {mine.length > 0 && (
            <ul className="flex flex-wrap gap-1.5">
              {mine.map((t) => (
                <li
                  key={t}
                  className="inline-flex items-center gap-1 rounded-full border bg-background py-0.5 pl-2.5 pr-1 text-xs"
                >
                  #{t}
                  <PlainButton
                    aria-label={`Take the tag ${t} off`}
                    className="rounded-full p-0.5 hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring"
                    onClick={() => void setTag(t, false).then(() => useTagStore.getState().load())}
                  >
                    <X className="size-3" aria-hidden />
                  </PlainButton>
                </li>
              ))}
            </ul>
          )}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (text.trim() !== "") add(text);
            }}
          >
            <Input
              aria-label="Add a tag"
              placeholder="+ Add a tag. Enter adds it."
              value={text}
              autoComplete="off"
              onChange={(e) => {
                setText(e.target.value);
                setProblem(null);
              }}
            />
          </form>
          {problem !== null && (
            <p role="alert" className="text-xs text-destructive">
              {problem}
            </p>
          )}
          {offered.length > 0 && (
            <div className="flex flex-col gap-1">
              <span className="text-xs text-muted-foreground">
                {text.trim() === "" ? "Use a tag you already have" : "Tags you already have"}
              </span>
              <ul className="flex flex-wrap gap-1.5">
                {offered.map((t) => (
                  <li key={t.tag}>
                    <PlainButton
                      aria-label={`Add the tag ${t.tag}`}
                      className="rounded-full border border-dashed bg-background px-2.5 py-0.5 text-xs hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring"
                      onClick={() => {
                        add(t.tag);
                      }}
                    >
                      #{t.tag} <span className="opacity-60">{t.count}</span>
                    </PlainButton>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {inText.length > 0 && (
            <p className="text-xs text-muted-foreground">
              In the text: {inText.map((t) => `#${t}`).join(" ")}
            </p>
          )}
        </div>
        <DialogFooter>
          <Button onClick={onClose}>Done</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** A tag chip above a note: Mimer's own filled with a mark and what it does, the person's outlined. */
export function TagChip({ tag, onTakeOff }: { tag: string; onTakeOff: () => void }) {
  const system = NOTE_TAGS.find((t) => t.tag === tag);
  const label = system?.label ?? `#${tag}`;
  return (
    <span
      title={system?.does}
      className={
        system
          ? "inline-flex items-center gap-1 rounded-full border border-primary/30 bg-accent py-0.5 pl-2 pr-1 text-xs font-semibold text-accent-foreground"
          : "inline-flex items-center gap-1 rounded-full border bg-background py-0.5 pl-2.5 pr-1 text-xs"
      }
    >
      {system && <Diamond className="size-2.5" aria-hidden />}
      {label}
      <PlainButton
        aria-label={`Take the tag ${system?.label ?? tag} off`}
        className="rounded-full p-0.5 hover:bg-background/60 focus-visible:ring-2 focus-visible:ring-ring"
        onClick={onTakeOff}
      >
        <X className="size-3" aria-hidden />
      </PlainButton>
    </span>
  );
}
