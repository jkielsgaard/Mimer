# Toast

A short message at the bottom right after something finished or failed (`src/components/layout/Toasts.tsx`): `card`, `radius-md`, `shadow-menu`, a `success` or `destructive` border.

- Say what was done, in the past tense: "Saved the task in Work."
- One action when it helps: **Open** (the thing just made) or **Undo**.
- An error says what to do. Errors stay 8 s, toasts with an action 15 s, others 4 s.
- Something that must not be missed (a name already taken) is a dialog (`NoticeDialog`), not a toast.
