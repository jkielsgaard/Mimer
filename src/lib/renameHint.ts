// A note that is renamed while it is open in the editor (a new note taking the name of its
// title) must keep its cursor and undo history. The rename records itself here, and the editor
// asks for the hint when it sees the path change, instead of reloading the note.

const renames = new Map<string, string>();

/** Records that the open note `from` is now called `to`. */
export function noteRename(from: string, to: string): void {
  renames.set(to, from);
}

/** The old path of a note that was just renamed to `to`, and forgets the hint. */
export function consumeRename(to: string): string | null {
  const from = renames.get(to) ?? null;
  renames.delete(to);
  return from;
}

/** Drops a hint whose rename did not happen. */
export function forgetRename(to: string): void {
  renames.delete(to);
}
