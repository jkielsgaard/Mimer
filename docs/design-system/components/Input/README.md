# Input

Text field, text box and select share one look (`input.tsx`, `textarea.tsx`, `select.tsx`): `control-height`, `radius-md`, an `input` border, a 2px `ring` on focus, `muted-foreground` placeholders.

- A `Label` above the field, in sentence case. Placeholders show an example ("Mette, Peter"), not the label again.
- A box where notes are written gets `indent`, so Tab and Shift+Tab indent like the editor.
- Times use `TimeInput`, which reads `14:30`, `1430` and `2:30 pm` and shows the format chosen in Settings.
- Enter saves a one-line field; Ctrl/Cmd+Enter saves a text box.
