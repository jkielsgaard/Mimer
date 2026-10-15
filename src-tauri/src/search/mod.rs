//! SQLite FTS5 search index (`.vault/index.db`).

use crate::error::{AppError, AppResult};
use crate::links::resolve::{note_stem, LinkResolver};
use crate::markdown::{self, frontmatter, links::parse_wikilinks, tags::extract_tags};
use crate::vault::fs_ops::mtime_ms;
use crate::vault::paths::resolve;
use crate::vault::tree::{is_markdown, list_files};
use rusqlite::{params, params_from_iter, Connection};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::path::Path;
use ts_rs::TS;

const SCHEMA_VERSION: i32 = 1;

const SCHEMA: &str = "
CREATE TABLE notes (path TEXT PRIMARY KEY, title TEXT, mtime INTEGER);
CREATE VIRTUAL TABLE notes_fts USING fts5(
  path UNINDEXED, title, body, tags,
  tokenize = 'unicode61 remove_diacritics 2'
);
CREATE TABLE links (src TEXT, target_raw TEXT, target_path TEXT);
CREATE TABLE tags (path TEXT, tag TEXT);
CREATE INDEX links_target ON links(target_path);
CREATE INDEX links_src ON links(src);
CREATE INDEX tags_tag ON tags(tag);
CREATE INDEX tags_path ON tags(path);
";

/// Search request from the UI or the AI tools.
#[derive(Debug, Clone, Default, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase", default)]
#[ts(export)]
pub struct SearchQuery {
    /// Free text; may contain `tag:<name>` and `path:<folder>` tokens.
    pub text: String,
    pub tag: Option<String>,
    pub folder: Option<String>,
}

#[derive(Debug, Clone, Serialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct SearchHit {
    pub path: String,
    pub title: String,
    /// Snippet with `<mark>` around matches.
    pub snippet: String,
}

#[derive(Debug, Clone, Serialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct Backlink {
    pub path: String,
    pub title: String,
    pub snippet: String,
}

#[derive(Debug, Clone, Serialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct TagCount {
    pub tag: String,
    #[ts(type = "number")]
    pub count: i64,
}

fn create_schema(conn: &Connection) -> AppResult<()> {
    conn.execute_batch(SCHEMA)?;
    conn.pragma_update(None, "user_version", SCHEMA_VERSION)?;
    Ok(())
}

/// Opens the index, rebuilding it from scratch if it is corrupt or has another schema.
pub fn open_index(path: &Path) -> AppResult<Connection> {
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
    let _ = conn.pragma_update(None, "journal_mode", "WAL");
    let _ = conn.pragma_update(None, "synchronous", "NORMAL");
    let version: i32 = conn.pragma_query_value(None, "user_version", |r| r.get(0))?;
    if version == 0 {
        create_schema(&conn)?;
    } else if version != SCHEMA_VERSION {
        return Err(AppError::Search("Index schema changed".into()));
    }
    // Probe: fails on a corrupt database.
    conn.query_row("SELECT count(*) FROM notes", [], |r| r.get::<_, i64>(0))?;
    conn.query_row("SELECT count(*) FROM notes_fts", [], |r| r.get::<_, i64>(0))?;
    Ok(conn)
}

/// In-memory index (tests).
pub fn open_memory() -> AppResult<Connection> {
    let conn = Connection::open_in_memory()?;
    create_schema(&conn)?;
    Ok(conn)
}

fn remove_note_inner(conn: &Connection, path: &str) -> AppResult<()> {
    if let Ok(rowid) = conn.query_row("SELECT rowid FROM notes WHERE path = ?1", [path], |r| {
        r.get::<_, i64>(0)
    }) {
        conn.execute("DELETE FROM notes_fts WHERE rowid = ?1", [rowid])?;
    }
    conn.execute("DELETE FROM notes WHERE path = ?1", [path])?;
    conn.execute("DELETE FROM links WHERE src = ?1", [path])?;
    conn.execute("DELETE FROM tags WHERE path = ?1", [path])?;
    Ok(())
}

/// Removes a note from the index.
pub fn remove_note(conn: &Connection, path: &str) -> AppResult<()> {
    remove_note_inner(conn, path)
}

/// Removes every note under a folder from the index.
pub fn remove_dir(conn: &Connection, folder: &str) -> AppResult<()> {
    let prefix = format!("{}/", folder.trim_end_matches('/'));
    let mut stmt = conn.prepare("SELECT path FROM notes")?;
    let paths: Vec<String> = stmt
        .query_map([], |r| r.get::<_, String>(0))?
        .filter_map(Result::ok)
        .filter(|p| p.starts_with(&prefix))
        .collect();
    drop(stmt);
    for p in paths {
        remove_note_inner(conn, &p)?;
    }
    Ok(())
}

/// Indexes (or re-indexes) one note.
pub fn index_note(
    conn: &Connection,
    resolver: &LinkResolver,
    path: &str,
    content: &str,
    mtime: i64,
) -> AppResult<()> {
    remove_note_inner(conn, path)?;
    let title = markdown::first_heading(content).unwrap_or_else(|| note_stem(path).to_string());
    let tags = extract_tags(content);
    let body_start = frontmatter::split(content).map(|f| f.end).unwrap_or(0);
    conn.execute(
        "INSERT INTO notes (path, title, mtime) VALUES (?1, ?2, ?3)",
        params![path, title, mtime],
    )?;
    let rowid = conn.last_insert_rowid();
    conn.execute(
        "INSERT INTO notes_fts (rowid, path, title, body, tags) VALUES (?1, ?2, ?3, ?4, ?5)",
        params![rowid, path, title, &content[body_start..], tags.join(" ")],
    )?;
    for l in parse_wikilinks(content) {
        let target_path = resolver.resolve(&l.target);
        conn.execute(
            "INSERT INTO links (src, target_raw, target_path) VALUES (?1, ?2, ?3)",
            params![path, l.target, target_path],
        )?;
    }
    for t in &tags {
        conn.execute(
            "INSERT INTO tags (path, tag) VALUES (?1, ?2)",
            params![path, t],
        )?;
    }
    Ok(())
}

/// Brings the index in line with the files on disk (incremental by mtime).
pub fn sync_vault(conn: &Connection, root: &Path) -> AppResult<()> {
    let files = list_files(root);
    let resolver = LinkResolver::new(&files);
    let mut stored: HashMap<String, i64> = HashMap::new();
    {
        let mut stmt = conn.prepare("SELECT path, mtime FROM notes")?;
        for row in stmt.query_map([], |r| Ok((r.get::<_, String>(0)?, r.get::<_, i64>(1)?)))? {
            let (p, m) = row?;
            stored.insert(p, m);
        }
    }
    conn.execute_batch("BEGIN")?;
    let result = (|| -> AppResult<()> {
        for f in files.iter().filter(|f| is_markdown(f)) {
            let abs = resolve(root, f, None)?;
            let mtime = mtime_ms(&abs);
            if stored.remove(f) == Some(mtime) {
                continue;
            }
            let content = String::from_utf8_lossy(&std::fs::read(&abs)?).into_owned();
            index_note(conn, &resolver, f, &content, mtime)?;
        }
        for gone in stored.keys() {
            remove_note_inner(conn, gone)?;
        }
        Ok(())
    })();
    match result {
        Ok(()) => conn.execute_batch("COMMIT")?,
        Err(e) => {
            let _ = conn.execute_batch("ROLLBACK");
            return Err(e);
        }
    }
    Ok(())
}

struct ParsedQuery {
    terms: Vec<String>,
    tags: Vec<String>,
    folders: Vec<String>,
}

fn parse_query(q: &SearchQuery) -> ParsedQuery {
    let mut p = ParsedQuery {
        terms: vec![],
        tags: vec![],
        folders: vec![],
    };
    for tok in q.text.split_whitespace() {
        if let Some(t) = tok.strip_prefix("tag:") {
            let t = t.trim_start_matches('#').to_lowercase();
            if !t.is_empty() {
                p.tags.push(t);
            }
        } else if let Some(f) = tok.strip_prefix("path:") {
            let f = f.trim_matches('/').to_string();
            if !f.is_empty() {
                p.folders.push(f);
            }
        } else {
            p.terms.push(tok.to_string());
        }
    }
    if let Some(t) = &q.tag {
        p.tags.push(t.trim_start_matches('#').to_lowercase());
    }
    if let Some(f) = &q.folder {
        let f = f.trim_matches('/');
        if !f.is_empty() {
            p.folders.push(f.to_string());
        }
    }
    p
}

/// Builds an FTS5 MATCH expression: every term quoted, last term prefix-matched, ANDed.
pub fn fts_expression(terms: &[String]) -> String {
    let n = terms.len();
    terms
        .iter()
        .enumerate()
        .map(|(i, t)| {
            let quoted = format!("\"{}\"", t.replace('"', "\"\""));
            if i + 1 == n {
                format!("{quoted}*")
            } else {
                quoted
            }
        })
        .collect::<Vec<_>>()
        .join(" AND ")
}

fn escape_like(s: &str) -> String {
    s.replace('\\', "\\\\")
        .replace('%', "\\%")
        .replace('_', "\\_")
}

/// Runs a search. Ranked by bm25 (title 5, body 1, tags 3), limit 50.
pub fn search(conn: &Connection, query: &SearchQuery) -> AppResult<Vec<SearchHit>> {
    let q = parse_query(query);
    if q.terms.is_empty() && q.tags.is_empty() && q.folders.is_empty() {
        return Ok(Vec::new());
    }
    let mut params: Vec<String> = Vec::new();
    let mut filters = String::new();
    let path_col = if q.terms.is_empty() {
        "n.path"
    } else {
        "notes_fts.path"
    };
    for t in &q.tags {
        params.push(t.clone());
        filters.push_str(&format!(
            " AND EXISTS (SELECT 1 FROM tags t WHERE t.path = {path_col} AND t.tag = ?{})",
            params.len()
        ));
    }
    for f in &q.folders {
        params.push(format!("{}/%", escape_like(f)));
        filters.push_str(&format!(
            " AND {path_col} LIKE ?{} ESCAPE '\\'",
            params.len()
        ));
    }
    let sql = if q.terms.is_empty() {
        format!("SELECT n.path, n.title, '' FROM notes n WHERE 1=1{filters} ORDER BY n.title COLLATE NOCASE LIMIT 50")
    } else {
        params.insert(0, fts_expression(&q.terms));
        // Re-number placeholders: the MATCH expression is ?1, so shift filter placeholders.
        let shifted = shift_placeholders(&filters);
        format!(
            "SELECT notes_fts.path, notes_fts.title, snippet(notes_fts, 2, '<mark>', '</mark>', '…', 16) \
             FROM notes_fts WHERE notes_fts MATCH ?1{shifted} \
             ORDER BY bm25(notes_fts, 0.0, 5.0, 1.0, 3.0) LIMIT 50"
        )
    };
    let mut stmt = conn
        .prepare(&sql)
        .map_err(|e| AppError::Search(e.to_string()))?;
    let rows = stmt
        .query_map(params_from_iter(params.iter()), |r| {
            Ok(SearchHit {
                path: r.get(0)?,
                title: r.get(1)?,
                snippet: r.get(2)?,
            })
        })
        .map_err(|e| AppError::Search(e.to_string()))?;
    Ok(rows.filter_map(Result::ok).collect())
}

fn shift_placeholders(sql: &str) -> String {
    let mut out = String::new();
    let mut chars = sql.chars().peekable();
    while let Some(c) = chars.next() {
        if c == '?' {
            let mut num = String::new();
            while let Some(d) = chars.peek().filter(|d| d.is_ascii_digit()) {
                num.push(*d);
                chars.next();
            }
            let n: usize = num.parse().unwrap_or(0);
            out.push_str(&format!("?{}", n + 1));
        } else {
            out.push(c);
        }
    }
    out
}

/// Notes linking to `path`, with a one-line context snippet.
pub fn backlinks(
    conn: &Connection,
    resolver: &LinkResolver,
    root: &Path,
    path: &str,
) -> AppResult<Vec<Backlink>> {
    let stem = note_stem(path).to_lowercase();
    let pattern = format!("%{}%", escape_like(&stem));
    let mut stmt = conn.prepare(
        "SELECT DISTINCT src, target_raw FROM links WHERE lower(target_raw) LIKE ?1 ESCAPE '\\' ORDER BY src",
    )?;
    let rows: Vec<(String, String)> = stmt
        .query_map([pattern], |r| Ok((r.get(0)?, r.get(1)?)))?
        .filter_map(Result::ok)
        .collect();
    let mut out: Vec<Backlink> = Vec::new();
    for (src, raw) in rows {
        if src == path
            || out.iter().any(|b| b.path == src)
            || resolver.resolve(&raw).as_deref() != Some(path)
        {
            continue;
        }
        let title = conn
            .query_row("SELECT title FROM notes WHERE path = ?1", [&src], |r| {
                r.get::<_, String>(0)
            })
            .unwrap_or_else(|_| note_stem(&src).to_string());
        let snippet = resolve(root, &src, None)
            .and_then(|abs| std::fs::read_to_string(abs).map_err(Into::into))
            .ok()
            .and_then(|c| {
                parse_wikilinks(&c)
                    .into_iter()
                    .find(|l| resolver.resolve(&l.target).as_deref() == Some(path))
                    .map(|l| {
                        let ls = c[..l.start].rfind('\n').map_or(0, |i| i + 1);
                        let le = c[l.end..].find('\n').map_or(c.len(), |i| l.end + i);
                        let line = c[ls..le].trim();
                        line.chars().take(160).collect::<String>()
                    })
            })
            .unwrap_or_default();
        out.push(Backlink {
            path: src,
            title,
            snippet,
        });
    }
    Ok(out)
}

/// All tags with usage counts.
pub fn all_tags(conn: &Connection) -> AppResult<Vec<TagCount>> {
    let mut stmt = conn.prepare("SELECT tag, COUNT(*) FROM tags GROUP BY tag ORDER BY tag")?;
    let rows = stmt.query_map([], |r| {
        Ok(TagCount {
            tag: r.get(0)?,
            count: r.get(1)?,
        })
    })?;
    Ok(rows.filter_map(Result::ok).collect())
}

fn subsequence(needle: &str, hay: &str) -> bool {
    let mut it = hay.chars();
    needle.chars().all(|c| it.any(|h| h == c))
}

/// Link-target suggestions for `[[` autocomplete (fuzzy on name and path).
pub fn link_targets(files: &[String], resolver: &LinkResolver, prefix: &str) -> Vec<String> {
    let p = prefix.to_lowercase();
    let mut out: Vec<(usize, String)> = files
        .iter()
        .filter(|f| !p.is_empty() || is_markdown(f))
        .filter(|f| p.is_empty() || subsequence(&p, &f.to_lowercase()))
        .map(|f| {
            let form = resolver.shortest_form(f);
            let rank = if form.to_lowercase().starts_with(&p) {
                0
            } else if form.to_lowercase().contains(&p) {
                1
            } else {
                2
            };
            (rank, form)
        })
        .collect();
    out.sort();
    out.dedup();
    out.into_iter().take(50).map(|(_, f)| f).collect()
}

#[cfg(test)]
mod tests;
