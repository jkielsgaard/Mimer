import { Send, Square } from "lucide-react";
import type { KeyboardEvent, ReactNode, RefObject } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

/** The message box of the chat: Enter sends, Shift+Enter makes a new line, Stop while it answers. */
export function ChatComposer({
  label,
  placeholder,
  value,
  onChange,
  onSelect,
  onKeyDown,
  onSend,
  onStop,
  streaming,
  disabled = false,
  inputRef,
  leading,
  children,
}: {
  label: string;
  placeholder: string;
  value: string;
  /** The new text and where the cursor is. */
  onChange: (v: string, caret: number) => void;
  onSelect?: (caret: number) => void;
  /** Return true when the key was handled (for example in a list that is open). */
  onKeyDown?: (e: KeyboardEvent<HTMLTextAreaElement>) => boolean;
  onSend: () => void;
  onStop: () => void;
  streaming: boolean;
  disabled?: boolean;
  inputRef?: RefObject<HTMLTextAreaElement | null>;
  /** A button before the box (for example the paperclip). */
  leading?: ReactNode;
  /** A line under the box, for example "Include the open note". */
  children?: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5 border-t p-2">
      <div className="flex items-end gap-2">
        {leading}
        <Textarea
          ref={inputRef}
          aria-label={label}
          rows={2}
          disabled={disabled}
          className="max-h-40 min-h-12 resize-none"
          placeholder={placeholder}
          value={value}
          onChange={(e) => {
            onChange(e.target.value, e.target.selectionStart);
          }}
          onSelect={(e) => {
            onSelect?.(e.currentTarget.selectionStart);
          }}
          onKeyDown={(e) => {
            if (onKeyDown?.(e) === true) return;
            if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
              e.preventDefault();
              if (!streaming) onSend();
            }
          }}
        />
        {streaming ? (
          <Button variant="destructive" size="icon" aria-label="Stop" onClick={onStop}>
            <Square />
          </Button>
        ) : (
          <Button
            size="icon"
            aria-label="Send"
            disabled={value.trim() === "" || disabled}
            onClick={onSend}
          >
            <Send />
          </Button>
        )}
      </div>
      {children}
    </div>
  );
}
