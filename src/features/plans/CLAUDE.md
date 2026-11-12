# Plans

The area for breaking something big down: a **plan** is an ordinary note (tag `plan`, in the folder `Plans/`) whose nested list is a tree of ideas. It is shown as an outline or as a map (the same list), and an idea can be tied to an epic, a task and a note.

- The note is the data. `src/lib/planTree.ts` reads and writes only the list; the properties, the heading and every line around the list are kept as they were. A checklist line (`- [ ]`) is a task, not an idea.
- An idea is tied to something by a `[[link]]` in its line: a link to an epic note shows the epic and how far it has come; a link to another note shows the note. A link `[[note#task title]]` ties the idea to a task (any epic). A new task is added to the epic Mimer makes for the plan (`epicFor`, named after the plan) and linked this way; an idea with the same words as a task of that epic shows it too. Every tie can be an existing thing or a new one. "Repeat these steps" makes one task per name in that epic, with the steps as the task's steps. The map is drawn from the top down. Nothing is copied: there is still one epic, one task, one note.
- A plan can live in a project (a folder with its own AI rules, made with the plan or already there). Then `planHome` (in `planStore`) says where its epics (`<project>/Epics`) and notes (`<project>/Notes`) go; other plans use `Tasks/` and the folder of the plan. "Plan from a project" only adds a plan note to the project's folder.
- A finished plan has the tag `plan-finished` as well. Carrying ideas over moves them to a new plan and leaves a line "Moved to [[…]]".
- No timer, no dates. The name of the area is `PLANS_LABEL` in `planTree.ts`.
- The AI only proposes: "Suggest parts" shows a list to tick, and only the ticked parts are written.
- Every change goes through `usePlanStore.edit`, which reads the note again, changes its list and writes it.
