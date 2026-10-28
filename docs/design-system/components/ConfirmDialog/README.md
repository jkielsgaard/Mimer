# ConfirmDialog

The yes/no question before anything is removed or replaced (`src/components/ConfirmDialog.tsx`), on the shared `Dialog` (`card`, `radius-lg`, `space-4`, `shadow-dialog`, 50% black overlay, a close cross, Esc).

- Title: a question with the thing's name in curly quotes.
- Description: what goes, and that it stays in the version history.
- Footer: Cancel (ghost) then the action (destructive for a delete, primary otherwise), which has the focus.

Other dialogs follow the same frame: a title that names what it makes ("New task", "Change the meeting"), the fields, then Cancel and the primary action. `PromptDialog` asks for one name.
