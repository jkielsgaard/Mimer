# Chip

Small rounded labels (`radius-full`, `small` 12px semibold).

- **Tag** (`accent`): a tag the note has (Meeting, Epic, Pinned) beside the `···` menu, with a cross that takes it off.
- **Status** (`StatusChip` in `TaskRow.tsx`): at the right end of a task row. Doing `accent`, Waiting `warning` 25% under `foreground`, Dropped `muted` struck through. No status, no chip.
- **Filter**: a row of toggles above a list (Recent: All, Notes, Meetings, Epics); the pressed one is `primary` with `aria-pressed`.
- **Fact** (`muted`): what a row is (Note, Epic, Meeting, Daily).

Never put a sentence in a chip, and never use colour alone: the word is always there.
