## Tasks

A task in Mimer is an ordinary line in an ordinary note: `- [ ] Renew the licence`. Mimer reads these lines in **every** note and shows them in one list. Press the **Tasks** icon at the left edge, or **Ctrl/Cmd+Shift+T**. The notes stay yours: without Mimer the lines are still a checklist in any Markdown editor.

### The list

- **Today** is on top: the things you chose for today, or that are due today. Press **Today** on a task to put it there, **Later** to push it away. Three is plenty.
- **Moved from earlier** shows what was not finished, without blame. Choose Today, Later or drop it. Nothing is lost.
- **This week** and **Later** hold the rest. Group the list by **When**, **Note** or **Tag**.
- Type in the box at the top to add a task. Without a date it is for today (that is why you wrote it); end with `later` to put it away. A date at the end becomes its due date: `tomorrow`, `fri`, `in 3 days`, `2026-11-01`. `~15m` is the time it takes. A new task goes into the note `Tasks` in the vault root.
- The first time each day a short note asks what matters today. Close it, and it stays away until tomorrow.

### One task

Press a task to open it. There you set the **status** (To do, Doing, Waiting), the **due date** and the time it takes, and **put it on today's list**.

- **Steps** are small tasks under the task. The next step is marked. Press **Break it down** and the AI suggests steps; you choose which ones stay, and nothing is written until you press Add. It needs a local AI that is running.
- **What has happened** is a log. Write a line and it gets today's date. A change of status is written there too. It reads as a timeline.
- **See the file** opens the note the task is in.

### How it looks in the file

```
- [ ] Renew the Acme licence #acme due:2026-11-01 status:waiting est:1h30m
  - [x] Send the price list
  - [ ] Ask Peter about a discount
  > 2026-10-14 Mette wants 40 users.
  > 2026-10-16 Waiting for Peter.
```

Steps are indented checklist lines. The log lines start with `>` and a date. `due:`, `plan:`, `status:` and `est:` are plain words you can type yourself. If you change a task in the note while the list is open, press the Tasks icon again to read the list again.

### Find tasks in a note

Open a note and press **Find tasks in a note** in the task list (or use the command palette). The local AI reads the note and suggests tasks. You choose which ones to keep, and only those are added to the end of the note as checklist lines. Tasks the note already has are not added twice.

### Ideas

**Ideas** is its own area, next to Files, Search and Tasks: press the light bulb at the left edge. The panel on the left lists your ideas (Open, Used, Archived); pick one to read and change it in the middle, with its title and a small note. Write an idea in the panel, or press **Ctrl/Cmd+Shift+N** from anywhere. An idea is a dated line in the note `Ideas` in the vault root (hidden from the file tree), for example `- 2026-10-19 Use Mimer for the weekly status #work`, with its note indented under it.

- **Make a task** puts the idea in your task list under Later, with its note in the task's log. **Make a note** makes a note in Quick notes with the idea's note in it, and opens it. The idea stays under _Used_, so nothing is lost.
- **Archive** takes an idea out of the way; **Bring back** makes it open again.
- Select text in a note and choose **As a task** or **As an idea** in the bar that appears, to write it down without leaving the note.

### Write it down from anywhere

**Ctrl/Cmd+Shift+N** (also File → Write something down, and the command palette) opens a small box. Choose **Task**, **Idea** or **Note** and write. A task for today unless you write a date; a note gets a title and goes to Quick notes. The note you are writing is not changed.

### Focus

Press **Focus** on a task. Everything else is hidden. You see one step, a timer (15, 25 or 45 minutes) and what to do now.

- **Done, next step** ticks the step and shows the next one.
- **Help me start** is for when you sit and cannot begin. The AI suggests one tiny first step, something under five minutes, for example "open the file and write the heading". It is only added to the task if you press Add it as a step.
- **Something popped into your head?** Use the same box as above: choose Task, Idea or Note and write it. A task goes under Later, so it does not crowd today. You stay in Focus.
- **Esc** or **Back to the task** leaves focus. The timer is for you; nothing happens when it ends except a message.

## New note from a starter

**New → From a starter…** above the file tree, **File → New note from a starter…**, the command palette, or the button on the empty editor screen makes a note from a few questions: **Meeting**, **Status update**, **Reply to an e-mail** or **Idea**. You answer, Mimer writes the note, and you see it while you write. Parts in `[brackets]` are blanks to fill in. A meeting note goes into the meetings folder; the others into the quick notes folder. No AI is used.
