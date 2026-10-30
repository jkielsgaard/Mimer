# Shared UI

The parts every screen is built from: `ui/` (Button, Input, Textarea, Select, Label, Dialog, menus), and `ConfirmDialog`, `PromptDialog`, `NoticeDialog`, `ViewHeader`, `PanelHeader`, `RowActions`, `MoveButtons`, `InfoHint`, `MonthCalendar`, `TimeInput`, `NoteBox` and others here. Tokens are in `src/index.css`; the rules in `docs/UX-GUIDE.md` and `docs/design-system/`.

- A change here changes every screen that uses it. Name that in the change plan, and check the screens (search for the component's name).
- A feature never makes its own button, field, select, dialog or menu look; it uses these. Lint refuses raw `<button>`, `<input>`, `<textarea>` and `<select>` outside `src/components/`.
- A new shared component gets a page in `docs/design-system/components/<Name>/` (README and preview) and a line in the UX guide.
- Colours only from the tokens; text 4.5:1 in light and dark.
