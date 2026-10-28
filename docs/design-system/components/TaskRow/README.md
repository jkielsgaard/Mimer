# TaskRow

The pattern for a row you can act on (`src/features/tasks/TaskRow.tsx`): a checkbox, the name in `row-strong`, then the row's tools, a spacer, the facts in `small` `muted-foreground` and the status chip at the right end.

- The pencil and the bin (`RowActions`) and the up/down arrows (`MoveButtons`, Alt+Up/Down) show on hover or focus, so text is never a field you hit by accident. While a page is being arranged (Customize) the arrows always show.
- A done row is struck through in `muted-foreground`.
- A click on the name opens the thing; the pencil renames it in place (Enter or the tick saves, Esc cancels).
