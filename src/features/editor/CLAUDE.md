# Editor

The note editor (CodeMirror 6): live preview (`extensions/livePreview.ts`, markers hidden off the cursor line, tables, images, Mermaid), wiki-links and tags with suggestions, the toolbar, the `···` note menu (`NoteMenu`), Tab/Shift+Tab (`extensions/listIndent.ts`), pasting images, and the note panels on the right (outline, links, images).

- Edits are written to disk after 1 s (`useNoteSession`); commits happen elsewhere (History). Flush pending writes (`flushPendingWrites`) before anything else reads or writes the note.
- The editor shows Markdown; it never changes a note's text on its own except what the person types or a command they chose.
- Indent rules are shared with every text box for notes (`src/lib/indentText.ts`); change both together.
