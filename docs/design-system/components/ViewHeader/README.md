# ViewHeader

The top row of every page in the middle: Tasks, an epic, a task, Ideas, Meetings, the start page (`src/components/ViewHeader.tsx`). `view-header-height` (48px), the `space-5` gutter, a bottom `border`.

- Title on the left in `page-title`; it is the name of the thing shown (the meeting's title, "Welcome back").
- The page's buttons on the right, size `sm`; the main action last, as the primary button.
- An optional way back inside the area ("← Back to the epic") comes first. The way to the notes is the Files icon, not a back button.
