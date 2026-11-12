## Plans: break something big down

A big thing is hard to start. Writing it down as parts, and the parts as smaller parts, makes it smaller. A **plan** is where you do that. It is an ordinary note (with the tag `plan`, kept in the folder `Plans`) whose list of ideas is a tree, so you can open it in any other editor too. There is no timer and no deadline: a plan goes on for as long as you like.

### Plans and projects

A **project** is a folder with its own AI rules (see Projects). When you make a plan, the box **Make a project for it** makes one: a folder with the name of the plan, with the plan in it. The epics and notes you make from the plan are kept inside it, in the folders `Epics` and `Notes`, so everything about the plan is in one place. Without the box, the plan is kept in the folder Plans.

A project that is already there can be made a plan: press **Plan from a project…** at the top of the plans list, or right-click the project in Files and choose **Make a plan of this project**. Mimer adds a plan note to the project's folder and can start it with the project's notes and epics as ideas, linked. Nothing in the project is moved or changed, and a project never becomes a plan unless you ask.

### Make a plan

Press **+** at the top of the plans list (or **New plan**). **Break it down** takes you through three short steps, and everything is saved as you go, so you can stop and come back:

1. **What is it?** Write what you want to get done.
2. **What are the parts?** Write the parts as they come, and press **Break it down** on a part to write smaller ones under it. **Suggest parts** lets the AI propose parts; you tick the ones you want.
3. **Where to start.** Choose the one smallest thing to begin with, and make it a task now, or leave it for later.

### The outline and the map

**Outline** shows the ideas as an indented list you can fold. Click an idea to choose it, double-click to change its words, and press **···** for more. **Map** shows the plan as a box at the top, and the ideas below it as boxes with lines. Choose a box and its buttons are at the right, or right-click it for the same menu; double-click it to change its words. They are the same list: a change in one shows in the other. Under the outline, **A small place to start** points at the first open task.

### Write it all down first

In the outline, the field **+ Add an idea** takes ideas one after the other: **Enter** adds one and stays, **Tab** makes the next one a smaller part of the one you just wrote, and **Shift+Tab** goes back up a level. You can also paste a list (one idea on each line, indented for smaller parts) and it becomes a tree at once. Nothing has to be tied to anything yet: come back later and tie only the ideas you want to.

### Tie an idea to the rest of Mimer

Press **···** on an idea:

- **Break it down…** asks the AI for parts of the idea (you tick which to add).
- **Add a sub-idea** writes a smaller part under it.
- **Link or make an epic…** links an epic that is already there, or makes a new one: its name is the idea's, and the sub-ideas you tick become its tasks. The idea shows **Epic · 2 of 5**, which opens it.
- **Link or make a task…** links a task that is already there, or makes a new one in the epic of the plan (an epic with the plan's name, made if it is not there). The idea shows **Task**.
- **Link or make a note…** links a note, or makes a new one with a link back to the plan. The idea shows **Note · name**.
- **Repeat these steps for…** is for things you do the same way more than once, such as asking several suppliers the same questions. Write the steps as sub-ideas, then give the names: each name gets its own branch with the same steps, and a task in the epic of the plan, whose steps are those steps.

Nothing is copied: there is still one epic, one task and one note, and the plan only points at them.

### Finish a plan, or carry on

**Finish…** lets you finish the plan, or carry the open ideas over to a new plan (the old one keeps a line, “Moved to …”). A finished plan is listed under **Finished**, stays readable, and **Open it again** brings it back.

### In the file

A plan is a note like any other: the properties (`tags: [plan]`), a heading, a few lines if you like, and the ideas as a list (`- idea`, indented for a smaller part, with `[[links]]`). Mimer only changes the list, and keeps everything else in the note as it was. A line that starts with `- [ ]` is a task, not an idea.
