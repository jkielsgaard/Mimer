// Registry of "write the pending editor buffer now" functions, one per open editor, so that
// commits never miss unsaved edits.
type Flusher = () => Promise<void>;

const flushers = new Set<Flusher>();

/** Each editor registers its flush function. Returns an unregister function. */
export function registerFlusher(fn: Flusher): () => void {
  flushers.add(fn);
  return () => {
    flushers.delete(fn);
  };
}

/** Writes every pending debounced editor write to disk. */
export async function flushPendingWrites(): Promise<void> {
  await Promise.all([...flushers].map((f) => f()));
}
