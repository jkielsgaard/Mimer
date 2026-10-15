# Proposal 14 – A clearer file panel (folders, projects and notes)

> **Status: implemented (see below).** **Built in 0.5.0:** the _Recommended_ package (1, 2, 3, 4, 5, 7, 9). **Not built yet:** Pinned (6), titles instead of file names (8) and multi-select (10). See DECISIONS.md, _Version 0.5.0_.

## What is hard today

- Folders, projects and notes look almost the same, so a project is easy to miss.
- Only one tree: no quick way back to what you worked on, or to the notes you use all the time.
- Notes are shown by file name; there is no overview of how big a folder is.
- The toolbar is a row of small icons with no labels.

## Sketch of the proposal

```
┌ Files ────────────────────────┐
│ [+ New ▾] [⌄⌄] [↕ Sort] [⌖]    │  one New menu, collapse all, sort, reveal open note
│ 🔎 Filter…                     │  filters the whole tree as you type
├───────────────────────────────┤
│ ★ PINNED                      │  notes and folders you pinned
│   Weekly plan                 │
│   Security docs  🔒           │
│ 🕘 RECENT                      │  the last notes you opened
│   2026-10-13 Weekly sync      │
│   Policy                      │
│ ▣ PROJECTS                     │  every project, with lock and number of notes
│   Security docs  🔒  14       │
│   Website  8                  │
├───────────────────────────────┤
│ ALL FILES                     │
│ ▸ 📁 Meetings            3    │
│ ▾ ▣ Security docs 🔒    14    │  projects have their own colour and icon
│     📄 Policy                 │
│     📄 Firewall rules         │
│   📁 Quick notes         5    │
│   📄 Home                     │
└───────────────────────────────┘
```

## Building blocks (each can be picked on its own)

| #   | Idea                                                                                                                   | What it gives you                                                     | Size |
| --- | ---------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------- | ---- |
| 1   | **One "New" menu** with New note, Meeting note, Quick note, Folder, Project; icons get labels and tooltips             | Everything for creating things in one clear place                     | S    |
| 2   | **Filter box** above the tree                                                                                          | Find a note in a big vault without opening search                     | S    |
| 3   | **Distinct icons and colours**: folder, project (colour + lock for Local-AI-only), note, image; note counts on folders | Projects stand out; you see how big things are                        | S–M  |
| 4   | **Collapse all / Reveal open note / Sort** (name, last changed)                                                        | Quick control over a long tree                                        | S    |
| 5   | **Recent** section (last 5–10 notes opened)                                                                            | Quick way back to your work                                           | S    |
| 6   | **Pinned** section (right-click → Pin; stored in the vault so it follows it)                                           | Always-at-hand notes and folders                                      | M    |
| 7   | **Projects** section above the tree                                                                                    | A project is one click away, wherever it sits in the tree             | S    |
| 8   | **Show titles instead of file names** (first heading) as an option                                                     | Readable names for notes made with the Title-first idea (proposal 15) | M    |
| 9   | **Breadcrumb** above the editor: `Security docs › Policies › Policy`                                                   | You always see where a note lives; each part is clickable             | S    |
| 10  | **Multi-select** (Ctrl/Shift-click) with move and delete for several notes                                             | Tidy up many notes at once                                            | M–L  |

## Suggested packages

- **Minimal (about 2 days):** 1, 2, 3, 4. A clearer toolbar, a filter, better icons.
- **Recommended (about 5–6 days):** the minimal package plus 5, 7, 9. Recent notes, a Projects list and a breadcrumb: the biggest gain in "where am I and where is my stuff".
- **Full (about 9–11 days):** everything, including Pinned, titles instead of file names and multi-select.

## Design rules for all of it

- Everything works with the keyboard (arrow keys, Enter, `F2` rename, `Delete`), and nothing relies on colour alone (icons and text too).
- Pinned and Recent are stored per vault, never sent anywhere.
- The tree keeps working exactly as today for drag and drop and the right-click menu.

## Questions for you

1. Which package: Minimal, Recommended or Full?
2. Should **Projects** be a separate list above the tree (7), or only look different inside the tree (3)?
3. Do you want notes shown by **title** instead of file name (8)? This fits best together with proposal 15.
