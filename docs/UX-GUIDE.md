# Mimer UX guide

The rules every screen in Mimer follows, so the app looks and works the same everywhere. Read it before designing or building a UI change. The values behind it are in [`design-system/tokens.json`](design-system/tokens.json) (the same values as `src/index.css`), and each component has a page under [`design-system/components/`](design-system/components/) with its rules and a static preview (`preview.html`, styled by `components/bundle.css` with the token names as CSS variables).

When the app changes a colour, a size or a pattern, change it here in the same commit.

Mimer is a desktop app for Markdown notes with a local AI. It is calm and dense: a working tool for one person, with plain English and no decoration. Use this book for every new screen, so Mimer looks and works the same everywhere. When a choice has been made before, reuse it; when it has not, decide it here first.

## Working rules

- **Show a design before building a UI change**, and build what was approved.
- **Reuse before inventing.** Find the screen that already does something similar (an area, a dialog, a row, a menu) and copy its parts and its words.
- **Everything works without AI.** An AI button is disabled with the reason as its tooltip (`useAiBlocked`), never hidden in a way that breaks the screen.
- **The AI only proposes.** Nothing the AI writes reaches a note before the person accepts it.
- **Nothing is lost.** Deleting asks first and says that the thing stays in the version history.
- **Tags decide what a note is** (`epic`, `meeting`, `pinned` in its properties), never the folder.
- **Say what, get only that.** An entry that names a kind (New → Task) opens only that kind's box. A choice of kind is asked only where nothing was chosen (Ctrl/Cmd+Shift+N: T, I, N).

## Content fundamentals

- **English, sentence case** in every button, label and title: "Make an epic", "Pin to the start page", "Open the start page when Mimer starts".
- **Write from the person's side.** Name things as they see them: "Quick notes", "the hardware parts", "Working on"; never internal names (`captureKind`, EP).
- **A button says exactly what happens**: "Save task", "Delete", "Download and find my hardware". The toast after it says what was done: "Saved the task in Work." with **Open**.
- **Short, plain sentences.** No exclamation marks, no emoji, no apologies. An error says what went wrong and what to do: "Put Mimer to sleep before downloading another model".
- **Confirm titles are questions with the name in curly quotes**: "Delete the meeting “Weekly with Mette”?". The description says what goes and what is kept: "…they stay in the version history, so they can be brought back."
- **Empty states name what will appear and how to add the first**: "No meetings yet. A meeting is a note with the tag `meeting`. Press **New meeting**…".
- **Help text** lives in a `?` (InfoHint) next to the thing, with "Read more" to the guide. Do not put paragraphs on the screen when a `?` will do.
- **Times** follow Settings → General → Time format (`formatTime`); dates read `Thu 29 Oct` (`shortDate`), and "yesterday", "09:05 today" for recent changes.

## The window

Header (`sidebar`) on top, status bar at the bottom. Left edge: the icon rail (`rail-width`, Start first, then Files, Search, Ideas, Tasks, Meetings, Settings at the bottom). Then the left panel, the middle, the right panel and the right rail (note panels and the chat). Panels are resizable and remember their size.

- **An area** (Tasks, Ideas, Meetings) is its rail icon + a left panel (`PanelHeader`, lists) + a middle page (`ViewHeader`, the chosen thing). A click in the panel shows the thing in the middle.
- **The start page** (the house) fills the window: both side panels hide while it is shown and come back as they were.
- **Middle pages** start with a `ViewHeader`: title left, the page's buttons right, the main action last as the primary button. The page below has the `space-5` gutter.
- **Narrow widths** stack to one column (start page under 640px, the calendar's short names under 230px; `useNarrow`).

## Visual foundations

- **Colour** comes only from the tokens. `primary` marks the one main action and the current day; `accent` marks what is selected (the current row, the open rail icon, a pressed filter); `muted` is hover. Status: Doing = `accent`, Waiting = `warning` at 25% under `foreground`, Dropped = `muted` and struck through.
- **Surfaces**: `background` for the middle, `sidebar` for panels, rails, header and status bar, `card` for anything raised (dialogs, menus, toasts, epic boxes, widgets). A dialog sits over a 50% black overlay with `shadow-dialog`; menus and toasts use `shadow-menu`. Nothing else has a shadow.
- **Borders** are hairlines in `border` (`input` for controls). A dashed border means "drop or add here" (+ Add a task, Pin a note from its ··· menu) or "being arranged" (Customize).
- **Type** is the system font stack, `body` 14px. Hierarchy comes from weight and `muted-foreground`, not size: `page-title` 16px semibold, `row-strong` for task and epic names, `small` 12px for facts, `section-label` 11px uppercase over groups.
- **Radii**: `radius-md` for controls and rows, `radius-lg` for dialogs and boxes, `radius-xl` for widgets, `radius-full` for chips.
- **Spacing** steps are 4px: `space-2` between buttons, `space-3` inside panels, `space-4` inside dialogs and widgets, `space-5` page gutter.
- **Focus**: every control shows a 2px `ring`. Keep text at 4.5:1; the light `warning` as text misses this, so use it as a ground.
- **Motion**: none beyond colour transitions on hover.

## Iconography

Icons are `lucide-react`, 16px (`icon`), stroke style, in `currentColor`, before the label in a button. Reused meanings: House = Start, Files, Search, Lightbulb = Ideas, ListChecks = Tasks, CalendarClock = Meetings, Plus = new/add, Pencil = edit, Trash2 = delete, X = close/remove, ChevronUp/Down = move, MoreHorizontal (···) = more for this thing, Star = pinned, Target = Focus, Sparkles = AI, Presentation = Start meeting. No emoji.

## The parts a screen is built from

Every control comes from `src/components/ui`, so a change to how one looks is made once and reaches every screen (lint refuses a raw `<button>`, `<input>`, `<textarea>` or `<select>` in a feature):

- `Button`: anything that looks like a button. `PlainButton`: a button whose look belongs to the row, chip, tab or rail icon it is.
- `Input` (a field in a form), `InlineInput` (a field inside a row or list: + Add a step, renaming in place, the file filter), `TimeInput`.
- `Textarea` (with `indent` where notes are written), `Select`, `Checkbox`, `Radio`, `Label`.
- `Dialog`, `ConfirmDialog`, `PromptDialog`, the menus (`menuStyles`), `ViewHeader`, `PanelHeader`, `RowActions`, `MoveButtons`, `InfoHint`, `MonthCalendar`.

## Interaction patterns

- **Rows**: the pencil and the bin show on hover or focus (`RowActions`); the arrows to move show the same way (`MoveButtons`, also Alt+Up/Down), and always while a page is being arranged.
- **Menus**: `···` holds the actions of one thing (a note: Rename, History, Pin, Tags, Export). **New ▾** lists what can be made. Same look everywhere (`menuStyles`).
- **Dialogs**: one question, Cancel as a ghost button, the action as the primary (or destructive) button on the right. Enter saves a one-line field; Ctrl/Cmd+Enter saves a multi-line one; Esc closes.
- **Text boxes for notes** take Tab and Shift+Tab to indent (`Textarea indent`), like the editor.
- **Toasts** confirm a finished action, bottom right, with one action (Open, Undo) when it helps. Errors stay longer.
- **Choices remembered per computer** (time format, start page layout, the start page at launch) are kept in browser storage, wrapped in try/catch, and the screen works without them.
