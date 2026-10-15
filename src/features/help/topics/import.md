## Move your notes from OneNote or another app

OneNote cannot save notes as Markdown, so it takes two steps:

1. **Turn the notebook into a folder of Markdown files** with a free tool, for example OneNoteMdExporter (search for `onenote-md-exporter` on GitHub).
2. In Mimer choose **File → Import notes from folder…**, pick that folder, check the preview, choose where in your vault the notes go, and click **Import**.

## What Mimer does for you

- The folder you import from is **only read**, never changed.
- **Nothing in your vault is overwritten.** A taken name gets a number.
- Names a computer does not allow are cleaned.
- The whole import is **one entry in the version history**, after a snapshot. You can undo it.
- You can **cancel** while it runs.

Notes from a work notebook may be confidential. Check your rules first, and use **Local AI only** for such notes.

The full step-by-step guide is in `docs/IMPORT-ONENOTE.md` in the Mimer folder.
