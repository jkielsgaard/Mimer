# Button

The one button of Mimer, in five looks and three sizes (`src/components/ui/button.tsx`).

- **primary** (`default` in code): the one main action of a view or dialog, placed last on the right. One per view.
- **outline**: other actions in a header (Fold all, Prepare next…, Customize when it matters).
- **ghost**: Cancel, quiet actions, icon buttons in panels.
- **destructive**: only the confirm button of a delete dialog.
- **link**: an inline action in text.

Sizes: default `control-height` (32px) in dialogs and pages, `sm` (28px, 12px text) in headers and panels, `icon` (28px square) for an icon alone, which must have an `aria-label` that names the thing ("More for this note"). Icons are 16px, before the label. The label says what happens ("Save task", not "OK"). Disabled buttons keep their place and get a `title` that says why.
