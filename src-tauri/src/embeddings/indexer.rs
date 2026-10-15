//! Background indexing: embeds new or changed chunks, reuses vectors of unchanged ones, and
//! keeps notes that must stay local out of the cloud.

use super::chunker::chunk_note;
use super::client::EmbedFn;
use super::store::{self, ChunkRow};
use super::vector::{normalize, to_blob};
use crate::error::AppResult;
use crate::vault::fs_ops::mtime_ms;
use rusqlite::Connection;
use std::collections::HashSet;
use std::path::Path;
use tokio_util::sync::CancellationToken;

/// Maximum characters per chunk (before the title prefix).
pub const MAX_CHARS: usize = 1000;

/// What one indexing run did.
#[derive(Debug, Clone, Copy, Default, PartialEq, Eq)]
pub struct IndexReport {
    pub notes_indexed: u32,
    pub notes_skipped: u32,
    pub chunks_embedded: u32,
    pub cancelled: bool,
}

/// Indexes the given notes. `excluded` notes are never read or sent (local-only projects when a
/// cloud provider is used). Stores that are no longer needed are removed.
// Nine inputs are all required; a struct would only move them around.
#[allow(clippy::too_many_arguments)]
pub async fn run_index(
    root: &Path,
    conn: &mut Connection,
    files: &[String],
    excluded: &HashSet<String>,
    embed: &EmbedFn,
    model: &str,
    rebuild: bool,
    cancel: &CancellationToken,
    progress: &(dyn Fn(u32, u32) + Send + Sync),
) -> AppResult<IndexReport> {
    if rebuild {
        store::clear(conn)?;
    }
    store::remove_other_models(conn, model)?;
    let wanted: Vec<&String> = files.iter().filter(|f| !excluded.contains(*f)).collect();
    let wanted_set: HashSet<&String> = wanted.iter().copied().collect();
    for stale in store::all_paths(conn)? {
        if !wanted_set.contains(&stale) {
            store::remove_file(conn, &stale)?;
        }
    }

    let total = u32::try_from(wanted.len()).unwrap_or(u32::MAX);
    let mut report = IndexReport::default();
    for (done, path) in wanted.iter().enumerate() {
        progress(u32::try_from(done).unwrap_or(u32::MAX), total);
        if cancel.is_cancelled() {
            report.cancelled = true;
            break;
        }
        let abs = crate::vault::paths::resolve(root, path, None)?;
        let mtime = mtime_ms(&abs);
        if store::file_state(conn, path)? == Some((mtime, model.to_string())) {
            report.notes_skipped += 1;
            continue;
        }
        let content = String::from_utf8_lossy(&std::fs::read(&abs)?).into_owned();
        let title = crate::markdown::first_heading(&content)
            .unwrap_or_else(|| crate::links::resolve::note_stem(path).to_string());
        let chunks = chunk_note(&title, &content, MAX_CHARS);
        let existing = store::existing_vectors(conn, path, model)?;
        let fresh: Vec<&str> = chunks
            .iter()
            .filter(|c| !existing.contains_key(&c.hash))
            .map(|c| c.text.as_str())
            .collect();
        let mut new_vectors = if fresh.is_empty() {
            Vec::new()
        } else {
            embed(fresh.iter().map(|s| (*s).to_string()).collect()).await?
        };
        report.chunks_embedded += u32::try_from(new_vectors.len()).unwrap_or(u32::MAX);
        new_vectors.reverse();
        let mut rows: Vec<(ChunkRow, Vec<u8>)> = Vec::with_capacity(chunks.len());
        for c in &chunks {
            let blob = match existing.get(&c.hash) {
                Some(b) => b.clone(),
                None => {
                    let mut v = new_vectors.pop().unwrap_or_default();
                    normalize(&mut v);
                    to_blob(&v)
                }
            };
            rows.push((
                ChunkRow {
                    index: c.index,
                    heading: c.heading.clone(),
                    text: c.text.clone(),
                    hash: c.hash.clone(),
                },
                blob,
            ));
        }
        store::replace_file(conn, path, mtime, model, &rows)?;
        report.notes_indexed += 1;
    }
    if !report.cancelled {
        progress(total, total);
    }
    Ok(report)
}

/// Notes in local-only projects, if the embedding provider is a cloud service.
pub fn excluded_notes(
    files: &[String],
    projects: &[crate::projects::Project],
    cloud: bool,
) -> HashSet<String> {
    if !cloud {
        return HashSet::new();
    }
    files
        .iter()
        .filter(|f| crate::projects::for_path(projects, f).is_some_and(|p| p.local_only))
        .cloned()
        .collect()
}

#[cfg(test)]
pub(crate) mod test_support {
    use super::*;
    use futures_util::future::BoxFuture;
    use std::sync::{Arc, Mutex};

    /// Fake embedder: bag of words into 32 buckets. Records every text it was asked to embed.
    pub fn fake(seen: Arc<Mutex<Vec<String>>>) -> EmbedFn {
        Arc::new(move |texts: Vec<String>| {
            let seen = seen.clone();
            Box::pin(async move {
                let mut out = Vec::new();
                for t in &texts {
                    seen.lock().unwrap().push(t.clone());
                    let mut v = vec![0f32; 32];
                    for w in t
                        .to_lowercase()
                        .split(|c: char| !c.is_alphanumeric())
                        .filter(|w| !w.is_empty())
                    {
                        let h = w
                            .bytes()
                            .fold(0usize, |a, b| a.wrapping_mul(31).wrapping_add(b as usize));
                        v[h % 32] += 1.0;
                    }
                    out.push(v);
                }
                Ok(out)
            }) as BoxFuture<'static, AppResult<Vec<Vec<f32>>>>
        })
    }
}

#[cfg(test)]
mod tests {
    use super::test_support::fake;
    use super::*;
    use crate::projects::Project;
    use std::sync::{Arc, Mutex};

    fn write(root: &Path, rel: &str, text: &str) {
        let p = root.join(rel);
        std::fs::create_dir_all(p.parent().unwrap()).unwrap();
        std::fs::write(p, text).unwrap();
    }

    fn project(folder: &str, local_only: bool) -> Project {
        Project {
            schema_version: 1,
            id: "p".into(),
            name: "P".into(),
            folder: folder.into(),
            instructions: String::new(),
            provider_id: None,
            local_only,
            created_at: String::new(),
            updated_at: String::new(),
        }
    }

    #[tokio::test]
    async fn incremental_indexing_skips_and_reuses() {
        let d = tempfile::tempdir().unwrap();
        write(
            d.path(),
            "a.md",
            "# A\nFirewall rules for the office network are documented here.",
        );
        write(
            d.path(),
            "b.md",
            "# B\nPasswords must be rotated every ninety days by policy.",
        );
        let files = vec!["a.md".to_string(), "b.md".to_string()];
        let mut conn = store::open_memory().unwrap();
        let seen = Arc::new(Mutex::new(Vec::new()));
        let embed = fake(seen.clone());
        let cancel = CancellationToken::new();
        let r1 = run_index(
            d.path(),
            &mut conn,
            &files,
            &HashSet::new(),
            &embed,
            "m",
            false,
            &cancel,
            &|_, _| {},
        )
        .await
        .unwrap();
        assert_eq!(r1.notes_indexed, 2);
        let first_calls = seen.lock().unwrap().len();
        assert!(first_calls > 0);
        let r2 = run_index(
            d.path(),
            &mut conn,
            &files,
            &HashSet::new(),
            &embed,
            "m",
            false,
            &cancel,
            &|_, _| {},
        )
        .await
        .unwrap();
        assert_eq!(r2.notes_skipped, 2);
        assert_eq!(
            seen.lock().unwrap().len(),
            first_calls,
            "nothing re-embedded"
        );
    }

    #[tokio::test]
    async fn editing_one_note_embeds_only_changed_chunks() {
        let d = tempfile::tempdir().unwrap();
        write(d.path(), "a.md", "# One\nFirst section text that is long enough to keep.\n\n# Two\nSecond section text that is long enough to keep.");
        let files = vec!["a.md".to_string()];
        let mut conn = store::open_memory().unwrap();
        let seen = Arc::new(Mutex::new(Vec::new()));
        let embed = fake(seen.clone());
        let cancel = CancellationToken::new();
        run_index(
            d.path(),
            &mut conn,
            &files,
            &HashSet::new(),
            &embed,
            "m",
            false,
            &cancel,
            &|_, _| {},
        )
        .await
        .unwrap();
        seen.lock().unwrap().clear();
        write(d.path(), "a.md", "# One\nFirst section text that is long enough to keep.\n\n# Two\nA completely different second section with new words.");
        // Make sure the mtime changes even on coarse file systems.
        let later = std::time::SystemTime::now() + std::time::Duration::from_secs(5);
        std::fs::File::options()
            .write(true)
            .open(d.path().join("a.md"))
            .unwrap()
            .set_modified(later)
            .unwrap();
        run_index(
            d.path(),
            &mut conn,
            &files,
            &HashSet::new(),
            &embed,
            "m",
            false,
            &cancel,
            &|_, _| {},
        )
        .await
        .unwrap();
        let embedded = seen.lock().unwrap().clone();
        assert_eq!(embedded.len(), 1, "{embedded:?}");
        assert!(embedded[0].contains("different"));
    }

    #[tokio::test]
    async fn deleted_notes_are_removed_from_the_store() {
        let d = tempfile::tempdir().unwrap();
        write(
            d.path(),
            "a.md",
            "# A\nSome text in note a that is long enough to keep.",
        );
        let mut conn = store::open_memory().unwrap();
        let embed = fake(Arc::new(Mutex::new(Vec::new())));
        let cancel = CancellationToken::new();
        run_index(
            d.path(),
            &mut conn,
            &["a.md".into()],
            &HashSet::new(),
            &embed,
            "m",
            false,
            &cancel,
            &|_, _| {},
        )
        .await
        .unwrap();
        run_index(
            d.path(),
            &mut conn,
            &[],
            &HashSet::new(),
            &embed,
            "m",
            false,
            &cancel,
            &|_, _| {},
        )
        .await
        .unwrap();
        assert!(store::all_paths(&conn).unwrap().is_empty());
    }

    #[tokio::test]
    async fn local_only_notes_are_never_sent_to_a_cloud_provider() {
        let d = tempfile::tempdir().unwrap();
        write(
            d.path(),
            "Secret/plan.md",
            "# Secret\nThe launch codename is ZEBRA-42 and it must stay private.",
        );
        write(
            d.path(),
            "Open/note.md",
            "# Open\nA public note about gardening and tomatoes in summer.",
        );
        let files = vec!["Secret/plan.md".to_string(), "Open/note.md".to_string()];
        let excluded = excluded_notes(&files, &[project("Secret", true)], true);
        assert!(excluded.contains("Secret/plan.md"));
        let seen = Arc::new(Mutex::new(Vec::new()));
        let embed = fake(seen.clone());
        let mut conn = store::open_memory().unwrap();
        let cancel = CancellationToken::new();
        run_index(
            d.path(),
            &mut conn,
            &files,
            &excluded,
            &embed,
            "m",
            false,
            &cancel,
            &|_, _| {},
        )
        .await
        .unwrap();
        let sent = seen.lock().unwrap().join("\n");
        assert!(
            !sent.contains("ZEBRA-42"),
            "secret text reached the embedder"
        );
        assert!(sent.contains("gardening"));
        // A local provider may index the same note.
        assert!(excluded_notes(&files, &[project("Secret", true)], false).is_empty());
    }

    #[tokio::test]
    async fn cancel_stops_the_run() {
        let d = tempfile::tempdir().unwrap();
        write(
            d.path(),
            "a.md",
            "# A\nFirst note text that is long enough to keep.",
        );
        write(
            d.path(),
            "b.md",
            "# B\nSecond note text that is long enough to keep.",
        );
        let files = vec!["a.md".to_string(), "b.md".to_string()];
        let mut conn = store::open_memory().unwrap();
        let embed = fake(Arc::new(Mutex::new(Vec::new())));
        let cancel = CancellationToken::new();
        let c2 = cancel.clone();
        let report = run_index(
            d.path(),
            &mut conn,
            &files,
            &HashSet::new(),
            &embed,
            "m",
            false,
            &cancel,
            &move |done, _| {
                if done == 1 {
                    c2.cancel();
                }
            },
        )
        .await
        .unwrap();
        assert!(report.cancelled);
        assert_eq!(report.notes_indexed, 1);
    }

    #[tokio::test]
    async fn changing_model_clears_old_vectors() {
        let d = tempfile::tempdir().unwrap();
        write(
            d.path(),
            "a.md",
            "# A\nSome text in note a that is long enough to keep.",
        );
        let mut conn = store::open_memory().unwrap();
        let embed = fake(Arc::new(Mutex::new(Vec::new())));
        let cancel = CancellationToken::new();
        run_index(
            d.path(),
            &mut conn,
            &["a.md".into()],
            &HashSet::new(),
            &embed,
            "old",
            false,
            &cancel,
            &|_, _| {},
        )
        .await
        .unwrap();
        run_index(
            d.path(),
            &mut conn,
            &["a.md".into()],
            &HashSet::new(),
            &embed,
            "new",
            false,
            &cancel,
            &|_, _| {},
        )
        .await
        .unwrap();
        assert_eq!(store::stats(&conn, "old").unwrap(), (0, 0));
        assert_eq!(store::stats(&conn, "new").unwrap().0, 1);
    }
}
