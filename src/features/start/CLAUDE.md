# Start page

The start page (the house; also shown when no note is open): widgets the person arranges with Customize (`src/lib/startLayout.ts`, `src/stores/startStore.ts`, kept per computer), `widgets.tsx` with the twelve widgets, the New menu, and the data hooks in `useStartData.ts` (recent notes, pinned notes with the tag `pinned`).

- A widget shows only the person's own data and an empty state that says what will appear; one that needs AI says why it is off.
- A new widget is one entry in `WIDGETS` and one component; the default layout stays Continue, Recent, Pinned.
- The page is shown without side panels.
