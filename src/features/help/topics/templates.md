## Meeting notes and quick notes

Above the file tree, **New → Meeting note…** asks for a title and makes `Meetings/2026-10-13 Title.md` with headings for attendees, agenda, notes, decisions and action items.

**New → Quick note** makes `Quick notes/2026-10-13 14-32.md` at once, so you can write down a thought without choosing a name.

A new vault starts with these two folders and templates. In an older vault, use **Settings → Vault → Add standard folders and templates**. Existing templates are never overwritten.

## Daily note

Press **Ctrl/Cmd+Shift+D** for today's note. It is created from your daily template the first time and opened after that.

## Your own templates

Templates are ordinary notes in `.vault/templates/`. Edit **Meeting** or **Quick note** there, or open a note you like and choose **File → Save the note as a template…**. Make a note from a template with **File → New note from template…**.

| Write this in a template | Mimer fills in              |
| ------------------------ | --------------------------- |
| `{{title}}`              | the name of the note        |
| `{{date}}`               | today's date                |
| `{{time}}`               | the time                    |
| `{{datetime}}`           | date and time               |
| `{{weekday}}`            | the day of the week         |
| `{{date:%d/%m/%Y}}`      | the date in your own format |

Folders and the daily note format are in **Settings → Vault**.
