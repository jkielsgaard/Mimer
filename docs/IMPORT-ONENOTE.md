# Moving your notes from OneNote to Mimer

OneNote keeps notes in its own format and cannot save them as Markdown. So the move has two steps:

1. **Turn the notebook into a folder of Markdown files** with a free tool (outside Mimer).
2. **Import that folder** with **File → Import → Notes from a folder…** in Mimer.

Plan for 30–60 minutes for a normal notebook. You can try it first on one small notebook.

> **Work notebooks.** If the notebook belongs to your employer, check your IT and security rules before you copy it to a personal vault. Also remember that Mimer's cloud AI sends note text to a cloud service. Put such notes in a project marked **Local AI only**, or use LM Studio, so nothing leaves your computer.

> **About the tools below.** They are made by other people and change over time. We have not tested them for you. Read each tool's own page for the current steps, and try a small notebook before you trust it with everything.

## Step 1 – Get a folder of Markdown files

### Route A – Windows with desktop OneNote (recommended)

Use **OneNoteMdExporter** (find it by searching for `onenote-md-exporter` on GitHub). It uses the OneNote program that is installed on your computer, so it also works for notebooks you open from work (SharePoint or OneDrive) as long as they open in desktop OneNote.

What you need (check the tool's page for the current list): Windows 10 or later, the **desktop** version of OneNote (not the Microsoft Store app), and Word installed.

1. Open OneNote and make sure the notebook you want is open and has finished syncing. Close other OneNote windows.
2. Download and unzip OneNoteMdExporter, then start it.
3. Choose the notebook to export. If it asks for a Markdown flavour, choose the one meant for **Obsidian** (it uses `[[wiki-links]]`, which Mimer understands).
4. Wait until it says it is finished. It makes a folder with one sub-folder per section, your pages as `.md` files, and the images and attachments next to them.

### Route B – No desktop OneNote (Mac, Linux, or only the web version)

Some tools read the `.one` files that OneDrive keeps, or work on the OneNote web page. They are newer than Route A and less proven, so check that they work for you and that you trust them with your notes. One example is a converter called `onenote-to-markdown` on GitHub. Always test on a small notebook first.

### Route C – By hand (a few pages only)

In OneNote, export a page or section as a Word document, then convert the Word file with a converter such as Pandoc. Images and layout are often lost. Use this only for a handful of pages.

## Step 2 – Import the folder into Mimer

1. Open the vault you want the notes in. A throw-away test vault is a good place to try first.
2. Choose **File → Import → Notes from a folder…**.
3. Click **Choose folder…** and pick the folder the tool made.
4. Mimer looks through the folder and shows what it found:
   - how many notes and attachments (images, PDFs and so on),
   - **Names that will change** – characters that Windows does not allow in file names, such as `: ? " < > | *`, become `-`,
   - **Left out** – hidden files and other things that are not notes or attachments.
5. Choose which folder in your vault the notes go into. The default is `Imported/<name of the folder>`.
6. Click **Import**. A progress bar shows how far it has come. **Cancel import** stops after the current file; what was already copied stays.
7. When it is done you get a short report. Your notes are in the folder you chose.

What Mimer does for your safety:

- The folder you picked is **only read**. It is never changed or deleted.
- **Nothing in your vault is overwritten.** If a name is taken, the new file gets a number (`Plan 1.md`).
- Anything you had not saved yet is saved in version history first, and the whole import is **one entry** in the History tab.

## After the import

- Open a few notes. Check headings, lists, tables, images and links.
- Links that point at a note that is not in the vault show as unresolved links. The report says how many. Clicking one creates the note.
- Things OneNote can do that Markdown cannot: ink and drawings, free placement of text boxes on the page, audio recordings, and some table layouts. They are lost or simplified. Keep the notebook in OneNote until you are happy.
- Move or rename the imported folders as you like. Mimer can update links when you move notes.

## Undo, and importing again

- **Undo:** open the History tab and restore the earlier state, or delete the imported folder. Everything is also in Git history, so nothing is lost.
- **Importing again:** a second import of the same folder adds copies with a number. To redo an import, delete the first import folder first.

## If something goes wrong

| What you see                                 | What to do                                                                                                                                |
| -------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| "Choose a folder outside the vault"          | Pick the exporter's folder, not a folder inside your vault.                                                                               |
| "Enter a folder name for the imported notes" | Type a folder name in the "Put them in this vault folder" box.                                                                            |
| Few or no notes are found                    | Open the exporter's folder and check that it has `.md` files. If it only has `.docx` or `.pdf` files, the export was in the wrong format. |
| Images are missing                           | Check that the images are in the exporter's folder, next to the notes. Only normal picture formats are imported.                          |
| The import is slow                           | Large notebooks take time. You can cancel and import section by section.                                                                  |
