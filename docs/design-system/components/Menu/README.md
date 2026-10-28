# Menu

Every drop-down and right-click menu has one look (`src/components/ui/menuStyles.ts`): `card`, `radius-md`, `shadow-menu`, items with `radius-sm`, the highlighted item in `accent`, a shortcut as a small key on the right, separators between groups.

- `···` (MoreHorizontal) holds the actions of one thing.
- **New ▾** lists what can be made (Note, Meeting, Quick note, Task, Idea).
- An item that opens a dialog ends with "…". An item that toggles says what it will do ("Pin to the start page" / "Unpin from the start page").
