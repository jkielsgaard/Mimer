# Proposal 13 – Images in notes

> **Status: implemented (see below).** **Built in 0.5.0** with: Markdown link as default and a setting for `![[name]]`; the Insert image button, drag from the file tree, size control and the Images tab (all of items 1–5). See DECISIONS.md, _Version 0.5.0_.

## What already works

- Paste an image (a screenshot) or drag a picture into a note: Mimer saves it in the vault's **attachments folder** (default `attachments/`, changeable in Settings → Vault) and inserts `![](../attachments/pasted-20261013-150000.png)`. The editor shows the picture when the cursor is off the line.
- Files imported from another app keep their folder, so their image links keep working.

So the idea "all images in one folder, with a tag that shows them" is how Mimer already works. What is missing is that it is **hard to discover and not very convenient**: there is no button, no size control, and no overview of the images.

## Options for the link form (the "tag")

| Option                         | Looks like                      | For                                                                                                               | Against                                                                  |
| ------------------------------ | ------------------------------- | ----------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| **A. Markdown path** (today)   | `![](../attachments/photo.png)` | Works in every Markdown editor and on GitHub; fits the principle that a vault works without Mimer.                | Long; the path is rewritten when a note moves (Mimer does this for you). |
| **B. Short embed** (your idea) | `![[photo.png]]`                | Short and readable; keeps working when a note moves, because the file is found by its name anywhere in the vault. | Only Obsidian-style editors understand it; other tools show the text.    |

Both are already **displayed** by Mimer. **Recommendation:** keep A as the default and add a setting in Settings → Vault, "Insert images as: Markdown path / short name", so you can choose B.

## Proposed additions (in order of value)

1. **Insert image button** in the editor toolbar: opens a file picker (several files at once), copies them into the attachments folder (never overwriting; duplicates get `-1`, `-2`) and inserts the links. The button, pasting and dragging all use the same code.
2. **Size control**: click a picture in the note and choose Small / Medium / Large / Original. It is stored as `![alt|400](path)` (the `|400` is understood by Mimer and Obsidian; other editors show it as part of the alt text).
3. **Drag from the file tree** into a note to insert the link.
4. **Images panel** (new tab next to Backlinks): all images in the vault as thumbnails, which notes use each one, and **Unused images** with a "Move to trash" that asks first (the deletion is committed, so it can be restored from History).
5. **Alt text**: when inserting, the file name is used as alt text so the picture has a caption for screen readers.

## What will not change

- Pictures stay plain files in the vault; nothing is embedded in the note text.
- The AI never gets image content (text models), and image files are not sent anywhere.

## Size

Items 1 and 3: small (1–2 days). Item 2: medium (2–3 days, editor widget). Item 4: medium (3 days). Tests: the insert logic and the unused-image scan are pure and easy to test.

## Questions for you

1. Link form: keep Markdown paths as the default, or default to the short `![[name]]`?
2. Do you want the Images panel (item 4), or are the toolbar button and size control enough?
