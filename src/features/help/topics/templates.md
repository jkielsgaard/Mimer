## Meeting notes and quick notes

**New → Quick note** opens the Quick note box. Write a thought, give it a name if you like, and press Save. It goes to **Quick notes** and the note you are working on stays open.

**New → Meeting note…** (also under File) asks for a title, a day and time, who is with you and an agenda, and every question is optional. **Create** saves the note in the meetings folder and leaves you where you are; **Create and start** opens the meeting at once. The note is an ordinary Markdown note: the day and the people are properties at the top, the agenda is a checklist, and each agenda item has its own part under **Notes**.

**Start meeting** (a button above any note in the meetings folder, or **Start** on the meeting line at the top of Landing) opens the meeting screen: the agenda on the left, one item at a time, with the notes for that item in the middle. **Next item** ticks the item and moves on. Everything is written into the note as you go, and **Esc** leaves the meeting. The box on the right writes down a task, idea or note without changing the meeting's notes.

**After the meeting**, **Prepare next meeting…** (next to **Start meeting**) opens the meeting window filled in: the same title and people, a week later, with the agenda items you did not reach. Tasks from the meeting are written in the box on the right: choose the epic of the meeting (made when the first task is saved), another epic, or a new one. No AI is used.

The meeting line at the top of **Landing** shows the next meeting, today or tomorrow, with **Start**. **+2** shows the others. When no meeting is coming, nothing is shown, and all meetings are still in the Meetings folder.

A new vault starts with the folders and templates. In an older vault, use **Settings → Vault → Add standard folders and templates**. Existing templates are never overwritten.

## The Meetings area

The **calendar clock** at the left edge opens Meetings, an area like Tasks. A note is a meeting when it has the tag **Meeting**, wherever it is. On the left, a calendar with a dot on every day that has a meeting; below it **Today** (the day's meetings), **Upcoming** and **Past**. Pick a day in the calendar to see only that day. In the middle, the chosen meeting: its agenda (tick an item to write it in the note), the tasks written in the note and what was written under each item, with **Start meeting**, **Prepare next…** and **Open the note**. Nothing is stored apart from the notes.

## Daily note

Press **Ctrl/Cmd+Shift+D** for today's note. It is created from your daily template the first time and opened after that.

## How new meeting, quick and daily notes start

Meeting notes, quick notes and daily notes start from the notes **Meeting**, **Quick note** and the daily template in `.vault/templates/`. You can change them there (any Markdown editor works).

| Write this in a template | Mimer fills in              |
| ------------------------ | --------------------------- |
| `{{title}}`              | the name of the note        |
| `{{date}}`               | today's date                |
| `{{time}}`               | the time                    |
| `{{datetime}}`           | date and time               |
| `{{weekday}}`            | the day of the week         |
| `{{date:%d/%m/%Y}}`      | the date in your own format |

Folders and the daily note format are in **Settings → Vault**.
