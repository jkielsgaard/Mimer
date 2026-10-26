## Meeting notes and quick notes

**New → Quick note** (also **Ctrl/Cmd+Shift+N**) opens a small box with the Note choice on. Write a thought, give it a name if you like, and press Save. It goes to **Quick notes** and the note you are working on stays open.

**New → Meeting note…** (also under File) asks for a title, a day and time, who is with you and an agenda, and every question is optional. **Create** saves the note in the meetings folder and leaves you where you are; **Create and start** opens the meeting at once. The note is an ordinary Markdown note: the day and the people are properties at the top, the agenda is a checklist, and each agenda item has its own part under **Notes**.

**Start meeting** (a button above any note in the meetings folder, or **Start** on the meeting line at the top of Landing) opens the meeting screen: the agenda on the left, one item at a time, with the notes for that item in the middle. **Decision**, **Action**, **Question** and **Park it** put a marked line in the notes. **Next item** ticks the item and moves on. Everything is written into the note as you go, and **Esc** leaves the meeting. The box on the right writes down a task, idea or note without changing the meeting's notes.

**After the meeting**, the small arrow next to **Start meeting** has two things. **Add actions to Tasks…** puts the lines marked **Action** into an epic task (by default one for the meeting) and marks them "(in Tasks)" in the note so they are not added twice; the meeting screen has the same button. **Prepare next meeting…** opens the meeting window filled in: the same title and people, a week later, with the agenda items you did not reach and the actions not yet in Tasks as "Follow up". No AI is used.

The meeting line at the top of **Landing** shows the next meeting, today or tomorrow, with **Start**. **+2** shows the others. When no meeting is coming, nothing is shown, and all meetings are still in the Meetings folder.

A new vault starts with the folders and templates. In an older vault, use **Settings → Vault → Add standard folders and templates**. Existing templates are never overwritten.

## Daily note

Press **Ctrl/Cmd+Shift+D** for today's note. It is created from your daily template the first time and opened after that.

## Your own templates

Templates are ordinary notes in `.vault/templates/`. Edit **Meeting** or **Quick note** there, or open a note you like and choose **File → Save the note as a template…**. Make a note from a template with **New → From a template…** or **File → From a template…**.

| Write this in a template | Mimer fills in              |
| ------------------------ | --------------------------- |
| `{{title}}`              | the name of the note        |
| `{{date}}`               | today's date                |
| `{{time}}`               | the time                    |
| `{{datetime}}`           | date and time               |
| `{{weekday}}`            | the day of the week         |
| `{{date:%d/%m/%Y}}`      | the date in your own format |

Folders and the daily note format are in **Settings → Vault**.
