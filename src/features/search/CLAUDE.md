# Search

Full-text search (SQLite FTS5 in `.vault/index.db`, `src-tauri/src/search/`) with `tag:` and `path:` filters, the search panel, and search by meaning with local embeddings (`src-tauri/src/embeddings/`).

- The index is rebuilt when it is missing or broken; it is never committed.
- Embeddings only use a provider on this computer.
- `notes_with_tag` serves the tag-based lists (epics, meetings, pinned); a new kind of tagged note uses it too.
