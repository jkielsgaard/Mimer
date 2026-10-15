# Proposal 15 – Name the note by typing its title

> **Status: implemented (see below).** **Built in 0.5.0** as option A. For question 2: no, only notes still called `Untitled` follow the heading. See DECISIONS.md, _Version 0.5.0_.

## The problem

A new note is called `Untitled.md`. To give it a real name you must rename the file in the tree, which is easy to forget and breaks your flow. You want the **title first**, written in the note itself.

## Options

### A. The first heading names the file (recommended)

A new note starts with `# ` and the cursor right after it. You type the title as the heading. When you pause for about a second, the file is renamed to match (`# Weekly sync` → `Weekly sync.md`). This is how Bear, Notion and Apple Notes feel, and it needs no extra screen.

- Only notes that are **still called `Untitled`** follow the heading. As soon as you rename a note yourself in the tree, or it has a real name, Mimer stops touching its name.
- A small padlock in the note header shows "File name follows the title" and lets you turn it off or on for that note.
- Characters Windows does not allow are removed. A name that exists gets ` 2`. An empty heading keeps `Untitled`.
- The rename is safe: tabs follow the new path, links to the note (there are none yet) are not an issue, and it is one small commit `Rename Untitled.md → Weekly sync.md` (only the first time).
- Works with frontmatter: the heading after the properties block is used.

### B. A title field above the note

A large "Title" input above the editor. It is the file name, and writes the `# Heading` for you. More obvious, but takes space and means two places that show the same text.

### C. Ask for the name first

`New note` opens a small dialog "Name your note" before anything is created (the tree's right-click menu already works like this). Simple and robust, but one extra step each time, and `Ctrl/Cmd+N` becomes slower.

**Recommendation: A**, with C kept for the right-click menu as it is. B can be added later if you want a bigger title.

## Details for A

- `Ctrl/Cmd+N`, the New note button and templates create the note, open it and put the cursor on the title line. Templates that already name the note (meeting notes, daily notes) are not renamed.
- Tracking which notes follow their title is kept in memory for the open tabs; a note is "following" from creation until it gets a name other than `Untitled…`.
- The rename uses the existing rename code (so the file tree, tabs and the search index follow), with link updating off because a brand-new note has no links.
- If the rename fails (for example a read-only folder), the note keeps its name and a short message says so; nothing is lost.

## Size

A: medium (about 3 days: editor hook, rename rules, tests). B: medium. C: small.

## Questions for you

1. Option A, B or C?
2. For A: should the file name also change if you later edit the heading of a note you named yourself? (Proposal: no; only `Untitled` notes follow.)
