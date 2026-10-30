# MarkdownField

The text box for text of more than one line: a note, a task's or epic's note, an idea's note, the notes of a meeting item, the text of a quick note, a log line (`src/features/editor/MarkdownField.tsx`). It is the note editor in a small box: Markdown with live preview (the marks `**` and `_` show only on the line with the cursor), lists, Tab and Shift+Tab, Ctrl/Cmd+B and Ctrl/Cmd+I.

- **Multi-line text is a `MarkdownField`; one line is an `Input`.** A title, a task, a step, a name or a search is never Markdown. Text for the AI (instructions, the chat) and the agenda in the meeting window are plain text too, because they are not notes.
- What saves is chosen per place: when the box is left (`onBlur`, a note), Enter (`submitKey="enter"`, a log line; Shift+Enter is then a new line, or nothing in a `singleLine` box), or Ctrl/Cmd+Enter (`submitKey="mod-enter"`, a quick note).
- `singleLine` is for where the text is kept on one line in the file (a task's log line): Markdown marks work, a new line cannot be written.
- The box has a name for the screen reader (`label`); it grows with the text between `rows` and `maxRows`.
- The saved text is shown with `MarkdownText` (bold, italic, lists, links, code; line breaks kept), never as raw text.
