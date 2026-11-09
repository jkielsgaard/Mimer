## Backup

**Settings → Vault → Backup** copies your notes and their whole history to a folder you choose (an external disk, or a folder that is synced), so the history does not live only on one disk. Press **Back up now**, and tick **Back up when Mimer closes** if you like. The copy is a bare Git repository, `<vault name>.git`, in that folder; Mimer never overwrites a folder that holds another history. The status bar warns when the last backup is a week old or failed. To get the notes back, run `git clone` on that folder (or copy it) and open the result as a vault. The saved chats and the search index of meanings are not in the backup.

## Nothing is lost

Every vault keeps a **version history** (a Git repository inside the folder). Mimer saves a version when you save, when you switch notes, now and then while you work, and when you close the app. Before Mimer changes or deletes anything on its own, it saves a snapshot first.

## Look at an older version

Press the **History** icon at the right edge (or **Ctrl/Cmd+Shift+H**). Pick a version to see what changed, and click **Restore this version** to bring it back. Restoring never throws anything away: the version you replaced stays in the history.

## Bring back a deleted note

**File → Recover deleted notes…** lists notes that were deleted and can be restored.

## Good to know

- Names in the history tell what happened: _Save_, _Autosave_, _Snapshot before AI_, _AI: …_, _Rename …_, _Delete …_, _Import: …_.
- The history only grows. Mimer never rewrites it.
- Your name and how often it saves while idle are in **Settings → Version history**.
