# Start page

The start page (the house): widgets the person arranges with Customize (`src/lib/startLayout.ts`, `src/stores/startStore.ts`, kept per computer), `widgets.tsx` with the eleven widgets, the New menu, and the data hooks in `useStartData.ts` (recent notes, pinned notes with the tag `pinned`).

- A widget shows only the person's own data and an empty state that says what will appear; one that needs AI says why it is off.
- The Notes page (`NotesPage`) is what the notes show when no note is open (recent notes, every note, a name filter); the start page is only the house. A new widget is one entry in `WIDGETS` and one component; the default layout stays Continue, Recent, Pinned.
- The page is shown without side panels.
