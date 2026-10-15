//! Vector store in `.vault/embeddings.db` (separate from the search index on purpose).

use crate::error::{AppError, AppResult};
use rusqlite::{params, Connection, OptionalExtension};
use std::collections::HashMap;
use std::path::Path;

const VERSION: i32 = 1;

const SCHEMA: &str = "
CREATE TABLE files (path TEXT PRIMARY KEY, mtime INTEGER NOT NULL, model TEXT NOT NULL);
CREATE TABLE chunks (
  id INTEGER PRIMARY KEY,
  path TEXT NOT NULL,
  idx INTEGER NOT NULL,
  heading TEXT NOT NULL,
  text TEXT NOT NULL,
  hash TEXT NOT NULL,
  model TEXT NOT NULL,
  vector BLOB NOT NULL
);
CREATE INDEX chunks_path ON chunks(path);
";

/// A chunk as it is stored (text without vectors is shown in results).
#[derive(Debug, Clone)]
pub struct ChunkRow {
    pub index: u32,
    pub heading: String,
    pub text: String,
    pub hash: String,
}

/// A chunk with its vector, as loaded for search.
#[derive(Debug, Clone)]
pub struct StoredChunk {
    pub path: String,
    pub heading: String,
    pub text: String,
    pub vector: Vec<f32>,
}

fn create(conn: &Connection) -> AppResult<()> {
    conn.execute_batch(SCHEMA)?;
    conn.pragma_update(None, "user_version", VERSION)?;
    Ok(())
}

/// Opens the store. A corrupt or other-version file is deleted and recreated (it can always be rebuilt).
pub fn open(path: &Path) -> AppResult<Connection> {
    if let Ok(conn) = try_open(path) {
        return Ok(conn);
    }
    for suffix in ["", "-wal", "-shm", "-journal"] {
        let _ = std::fs::remove_file(format!("{}{}", path.display(), suffix));
    }
    try_open(path)
}

fn try_open(path: &Path) -> AppResult<Connection> {
    if let Some(dir) = path.parent() {
        std::fs::create_dir_all(dir)?;
    }
    let conn = Connection::open(path)?;
    let version: i32 = conn.pragma_query_value(None, "user_version", |r| r.get(0))?;
    if version == 0 {
        create(&conn)?;
    } else if version != VERSION {
        return Err(AppError::Search("Embedding store version changed".into()));
    }
    conn.query_row("SELECT count(*) FROM chunks", [], |r| r.get::<_, i64>(0))?;
    Ok(conn)
}

/// In-memory store (tests).
pub fn open_memory() -> AppResult<Connection> {
    let conn = Connection::open_in_memory()?;
    create(&conn)?;
    Ok(conn)
}

/// `(mtime, model)` of a note when it was last indexed.
pub fn file_state(conn: &Connection, path: &str) -> AppResult<Option<(i64, String)>> {
    Ok(conn
        .query_row(
            "SELECT mtime, model FROM files WHERE path = ?1",
            [path],
            |r| Ok((r.get(0)?, r.get(1)?)),
        )
        .optional()?)
}

/// Vectors of a note's existing chunks, keyed by content hash (so unchanged chunks are not re-embedded).
pub fn existing_vectors(
    conn: &Connection,
    path: &str,
    model: &str,
) -> AppResult<HashMap<String, Vec<u8>>> {
    let mut stmt =
        conn.prepare("SELECT hash, vector FROM chunks WHERE path = ?1 AND model = ?2")?;
    let rows = stmt.query_map(params![path, model], |r| {
        Ok((r.get::<_, String>(0)?, r.get::<_, Vec<u8>>(1)?))
    })?;
    Ok(rows.collect::<Result<_, _>>()?)
}

/// Replaces all chunks of a note in one transaction.
pub fn replace_file(
    conn: &mut Connection,
    path: &str,
    mtime: i64,
    model: &str,
    chunks: &[(ChunkRow, Vec<u8>)],
) -> AppResult<()> {
    let tx = conn.transaction()?;
    tx.execute("DELETE FROM chunks WHERE path = ?1", [path])?;
    for (c, blob) in chunks {
        tx.execute(
            "INSERT INTO chunks (path, idx, heading, text, hash, model, vector) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
            params![path, c.index, c.heading, c.text, c.hash, model, blob],
        )?;
    }
    tx.execute(
        "INSERT INTO files (path, mtime, model) VALUES (?1, ?2, ?3) ON CONFLICT(path) DO UPDATE SET mtime = excluded.mtime, model = excluded.model",
        params![path, mtime, model],
    )?;
    tx.commit()?;
    Ok(())
}

/// Forgets a note entirely.
pub fn remove_file(conn: &mut Connection, path: &str) -> AppResult<()> {
    let tx = conn.transaction()?;
    tx.execute("DELETE FROM chunks WHERE path = ?1", [path])?;
    tx.execute("DELETE FROM files WHERE path = ?1", [path])?;
    tx.commit()?;
    Ok(())
}

/// Deletes vectors made with any other model (they are not comparable).
pub fn remove_other_models(conn: &mut Connection, model: &str) -> AppResult<()> {
    let tx = conn.transaction()?;
    tx.execute("DELETE FROM chunks WHERE model <> ?1", [model])?;
    tx.execute("DELETE FROM files WHERE model <> ?1", [model])?;
    tx.commit()?;
    Ok(())
}

/// Deletes everything.
pub fn clear(conn: &mut Connection) -> AppResult<()> {
    let tx = conn.transaction()?;
    tx.execute("DELETE FROM chunks", [])?;
    tx.execute("DELETE FROM files", [])?;
    tx.commit()?;
    Ok(())
}

/// All indexed note paths.
pub fn all_paths(conn: &Connection) -> AppResult<Vec<String>> {
    let mut stmt = conn.prepare("SELECT path FROM files")?;
    let rows = stmt.query_map([], |r| r.get::<_, String>(0))?;
    let paths: Vec<String> = rows.collect::<Result<_, _>>()?;
    Ok(paths)
}

/// Number of indexed notes and chunks for one model.
pub fn stats(conn: &Connection, model: &str) -> AppResult<(u32, u32)> {
    let notes: i64 = conn.query_row(
        "SELECT count(*) FROM files WHERE model = ?1",
        [model],
        |r| r.get(0),
    )?;
    let chunks: i64 = conn.query_row(
        "SELECT count(*) FROM chunks WHERE model = ?1",
        [model],
        |r| r.get(0),
    )?;
    Ok((
        u32::try_from(notes).unwrap_or(u32::MAX),
        u32::try_from(chunks).unwrap_or(u32::MAX),
    ))
}

/// Loads every chunk with its vector for one model.
pub fn load_all(conn: &Connection, model: &str) -> AppResult<Vec<StoredChunk>> {
    let mut stmt = conn.prepare(
        "SELECT path, heading, text, vector FROM chunks WHERE model = ?1 ORDER BY path, idx",
    )?;
    let rows = stmt.query_map([model], |r| {
        Ok((
            r.get::<_, String>(0)?,
            r.get::<_, String>(1)?,
            r.get::<_, String>(2)?,
            r.get::<_, Vec<u8>>(3)?,
        ))
    })?;
    let mut out = Vec::new();
    for row in rows {
        let (path, heading, text, blob) = row?;
        if let Some(vector) = super::vector::from_blob(&blob) {
            out.push(StoredChunk {
                path,
                heading,
                text,
                vector,
            });
        }
    }
    Ok(out)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn row(i: u32, hash: &str) -> (ChunkRow, Vec<u8>) {
        (
            ChunkRow {
                index: i,
                heading: "H".into(),
                text: format!("text {i}"),
                hash: hash.into(),
            },
            vec![0u8; 8],
        )
    }

    #[test]
    fn replace_file_keeps_only_new_rows() {
        let mut c = open_memory().unwrap();
        replace_file(&mut c, "a.md", 1, "m", &[row(0, "h1"), row(1, "h2")]).unwrap();
        replace_file(&mut c, "a.md", 2, "m", &[row(0, "h3")]).unwrap();
        assert_eq!(stats(&c, "m").unwrap(), (1, 1));
        assert_eq!(file_state(&c, "a.md").unwrap(), Some((2, "m".into())));
        assert!(existing_vectors(&c, "a.md", "m")
            .unwrap()
            .contains_key("h3"));
    }

    #[test]
    fn other_models_are_removed_and_clear_empties_everything() {
        let mut c = open_memory().unwrap();
        replace_file(&mut c, "a.md", 1, "old", &[row(0, "h")]).unwrap();
        replace_file(&mut c, "b.md", 1, "new", &[row(0, "h")]).unwrap();
        remove_other_models(&mut c, "new").unwrap();
        assert_eq!(all_paths(&c).unwrap(), vec!["b.md"]);
        clear(&mut c).unwrap();
        assert!(all_paths(&c).unwrap().is_empty());
    }

    #[test]
    fn corrupt_file_is_recreated() {
        let d = tempfile::tempdir().unwrap();
        let p = d.path().join("embeddings.db");
        std::fs::write(&p, b"this is not a database at all, really not").unwrap();
        let c = open(&p).unwrap();
        assert_eq!(stats(&c, "m").unwrap(), (0, 0));
    }
}
