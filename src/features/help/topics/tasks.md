## Tasks and epic tasks

A task in Mimer is an ordinary line in an ordinary note: `- [ ] Renew the licence`. Mimer reads these lines in **every** note. Press the **Tasks** icon at the left edge, or **Ctrl/Cmd+Shift+T**. The notes stay yours: without Mimer the lines are still a checklist in any Markdown editor.

### Epic tasks

An **epic task** is a note with tasks in it. The list is one outline: each epic is a box with a bar and "2 of 4" that you can **fold** to one line, and **Fold all** / **Unfold all** do every epic at once (Mimer remembers what is folded). A task with steps has a small arrow: unfold it to tick its steps, or add one, right in the list. **+ Add a task to …** at the bottom of an open epic adds a task to it. When every task in an epic is done, it moves to **Done** at the bottom. The left panel lists the epic tasks so they are one click away.

**Put things in your own order.** Hold the mouse over an epic, a task or a step: the small arrows move it one place up or down (or press **Alt+↑** / **Alt+↓** on it). A task moves with its steps, note and log, and keeps its place in the note, so the file has the same order. The **Inbox** stays at the top; the order of the epics is kept in the vault.

There are no due dates, no Today and no Later: a task is there to keep track of the work and its steps. Each task shows the day it was made.

- **New epic task** asks for a name and makes a note in the folder **Tasks** (shown in Landing). The tasks are written in that note, so it also works in any other editor.
- A task you make from a note elsewhere (**As a task** over selected text, or **Find tasks in a note**) goes into an epic of its own for that note: a note in **Tasks** with a `source:` line that points back. The note you were in is not changed. A note where you typed `- [ ]` yourself is an epic too.
- Open an epic to add tasks, **Go to the epic's note**, go to the note it **Came from**, or **Suggest steps from the note**: the AI reads the note (and the note it came from) and suggests the next tasks, and only the ones you choose are added.
- Delete the note and the epic and its tasks disappear from the lists (History still has the note).
- A task typed in the write-it-down box without an epic goes into the epic **Inbox**.

### One task

Press a task to open it. On the left is what you write (the note, the steps and what has happened); the card on the right has the **status** (To do, Doing, Waiting), the day it was **made**, and buttons to its epic task and its note. The way back at the top goes to its epic task.

- **Note** is a few lines about the task that are not part of the log: what it is about, who to ask. It is saved when you leave the box. An epic task has a note too.
- **Steps** are small tasks under the task. The next step is marked. Click a step's text to change it (Enter saves, Esc puts it back), and use the arrows to move it. Press **Break it down** and the AI suggests steps; you choose which ones stay, and nothing is written until you press Add. It needs a local AI that is running.
- **What has happened** is a log. Write a line and it gets today's date. A change of status is written there too. It reads as a timeline. Hold the mouse over a line: the **pencil** changes its text and date, the **bin** deletes it (History of the note still has it). **Write a status line from the log** asks the AI for one line about where the task stands, from the log, the steps and the note.
- Click the **title** to rename the task. **Show Markdown** shows its lines as written. In the card, **Epic task: …** opens its epic task and **Open the note** opens the note the task is written in.

### How it looks in the file

```
- [ ] Renew the Acme licence #acme status:waiting made:2026-10-12
  Only for the Acme office.
  - [x] Send the price list
  - [ ] Ask Peter about a discount
  - 2026-10-14 Mette wants 40 users.
  - 2026-10-16 Waiting for Peter.
```

Under a task, indented: plain text is its **note**, checklist lines are its **steps**, and list items that start with a date are **what has happened**. Each is on its own line in any Markdown editor. `status:` is a plain word you can type yourself; `made:` is written by Mimer when it makes a task (a task you write by hand simply has no date). Older files with `>` lines for the note and the log, or words like `due:`, still work: Mimer reads them and leaves them as they are. If you change a task in the note while the list is open, press the Tasks icon again to read the list again.

### Find tasks in a note

Open a note and press **Find tasks in a note** in the task list (or use the command palette). The local AI reads the note and suggests tasks. You choose which ones to keep, and only those are added to the epic task of that note. Tasks it already has are not added twice.

### Ideas

**Ideas** is its own area, next to Files, Search and Tasks: press the light bulb at the left edge. The panel on the left lists your ideas (Open, Used, Archived); pick one to read and change it in the middle, with its title and a small note. Write an idea in the panel, or press **Ctrl/Cmd+Shift+N** from anywhere. An idea is a dated line in the note `Ideas` in the vault root (hidden from the file tree), for example `- 2026-10-19 Use Mimer for the weekly status #work`, with its note indented under it.

- **Make a task** puts the idea in the epic task **Inbox**, with the idea's note as the task's note. **Make a note** makes a note in Quick notes with the idea's note in it, and opens it. The idea stays under _Used_, so nothing is lost.
- **Archive** takes an idea out of the way; **Bring back** makes it open again.
- Select text in a note and choose **As a task** or **As an idea** in the bar that appears, to write it down without leaving the note.

### Write it down from anywhere

**Ctrl/Cmd+Shift+N** (also **File → Write something down…**, and the command palette) opens a small box. Choose **Task**, **Idea** or **Note** and write. A task goes into the epic task **Inbox**; a note gets a title and goes to Quick notes. The note you are writing is not changed.

### Focus

Press **Focus** on a task, or on an epic task. Everything else is hidden. You see the whole epic task as one outline: the task you work on is open and marked **Working on it** (its status becomes Doing), with its note, its steps (the next one marked **Now**) and what has happened. The other tasks are folded; unfold one to read it, tick a step or write a line, and press **Work on this** to move the mark to it. **Fold the rest** folds them all again.

- **What has happened** under the marked task: write a line and press Enter. It is added to the log with today's date, and you stay in Focus.
- **Done, next step** on the right ticks the Now step. After the last step it asks if the task is done too; then the next open task in the epic is marked. When every task is done, Focus says so and takes you back to the task list.
- The timer (15, 25 or 45 minutes) is for you; nothing happens when it ends except a message.
- **Help me start** is for when you sit and cannot begin. The AI suggests one tiny first step, something under five minutes, for example "open the file and write the heading". It is only added to the task if you press Add it as a step.
- **Something popped into your head?** Use the same box as above: choose Task, Idea or Note and write it. A task goes into the Inbox. You stay in Focus.
- **Esc** or **Leave focus** leaves focus.

## New note from a starter

**New → From a starter…** above the file tree, **File → New note from a starter…**, the command palette, or the button on the empty editor screen makes a note from a few questions: **Meeting**, **Status update**, **Reply to an e-mail** or **Idea**. You answer, Mimer writes the note, and you see it while you write. Parts in `[brackets]` are blanks to fill in. A meeting note goes into the meetings folder; the others into the quick notes folder. No AI is used.
