# PanelHeader

The top row of every side panel, left or right (`src/components/PanelHeader.tsx`): `panel-header-height` (36px), `space-3` sides, `panel-title`, then the panel's small buttons. An optional "· about" names the note the panel is about.

Under it, groups get a `section-label` ("Today", "Upcoming", "Done · 3"), and rows are list rows: hover `muted`, the current one `accent` with `aria-current`. A count sits at the right in `small` `muted-foreground`, with tabular figures.
