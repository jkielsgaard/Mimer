# ActivityRail

The narrow bar of icons at the left edge (`src/components/layout/ActivityRail.tsx`), `rail-width` (44px) on `sidebar`. Each icon is a 32px button with a `title` and `aria-label`; the open one is `accent`.

- Order: Start (the house), Files, Search, Ideas, Tasks, Meetings, then Settings at the bottom.
- Pressing the open panel's icon hides the panel; another icon shows it.
- A new area adds its icon here and follows the area pattern: left panel with a `PanelHeader`, middle page with a `ViewHeader`.
- The right rail mirrors it for the note panels (Outline, Links, History, Images) and the chat.
