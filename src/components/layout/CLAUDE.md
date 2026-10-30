# App shell

The window around the areas: `AppShell` (the resizable columns), `ActivityRail` and `RightRail` (icon bars), `Header` (menus), `StatusBar`, `Toasts`, plus `src/App.tsx` (start-up, shortcuts, global dialogs), `src/stores/uiStore.ts` (what is open where), the tabs and split view (`src/features/workspace/`), quick open and the command palette (`src/features/quickOpen/`).

- `uiStore.centerView` decides what fills the middle; `leftTab`/`rightTab` the side panels. The start page (`"start"`) hides both side panels; asking for a panel leaves it.
- A new area adds an icon to `ActivityRail` and follows the area pattern of the UX guide (left panel with `PanelHeader`, middle page with `ViewHeader`).
- Shortcuts live in `src/App.tsx` (`useShortcuts`) and are listed in the help topic `shortcuts.md`.
