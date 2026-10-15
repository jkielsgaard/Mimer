//! Meaning-based search: rank stored chunks by similarity, and fuse with keyword results.

use super::store::StoredChunk;
use super::vector::{dot, top_k};
use crate::error::AppResult;
use crate::vault::paths::is_inside;

/// Hits below this similarity are noise.
pub const MIN_SCORE: f32 = 0.2;
/// Reciprocal-rank-fusion constant.
const RRF_K: f32 = 60.0;

/// One note found by meaning.
#[derive(Debug, Clone, PartialEq, serde::Serialize, ts_rs::TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct SemanticHit {
    pub path: String,
    pub title: String,
    pub heading: String,
    pub snippet: String,
    pub score: f32,
}

/// Title of a note from its chunk text (`"Title > heading\n…"`).
fn title_of(text: &str) -> String {
    let first = text.lines().next().unwrap_or("");
    first.split(" > ").next().unwrap_or(first).to_string()
}

/// Body of a chunk without its title line, cut to 240 characters.
fn snippet_of(text: &str) -> String {
    let body = text.split_once('\n').map(|(_, b)| b).unwrap_or(text);
    let flat: String = body.split_whitespace().collect::<Vec<_>>().join(" ");
    flat.chars().take(240).collect()
}

/// Ranks chunks for a (normalised) query vector. One hit per note, best chunk first.
pub fn rank(
    chunks: &[StoredChunk],
    query: &[f32],
    folder: Option<&str>,
    limit: usize,
) -> Vec<SemanticHit> {
    let scores = chunks
        .iter()
        .enumerate()
        .filter(|(_, c)| folder.is_none_or(|f| is_inside(&c.path, f)))
        .map(|(i, c)| (i, dot(query, &c.vector)))
        .filter(|(_, s)| *s >= MIN_SCORE);
    let mut out: Vec<SemanticHit> = Vec::new();
    for (i, score) in top_k(scores, limit.saturating_mul(4).max(1)) {
        let Some(c) = chunks.get(i) else { continue };
        if out.iter().any(|h| h.path == c.path) {
            continue;
        }
        out.push(SemanticHit {
            path: c.path.clone(),
            title: title_of(&c.text),
            heading: c.heading.clone(),
            snippet: snippet_of(&c.text),
            score,
        });
        if out.len() >= limit {
            break;
        }
    }
    out
}

/// Reciprocal rank fusion of two ranked path lists (best first).
pub fn fuse(keyword: &[String], semantic: &[String], limit: usize) -> Vec<String> {
    let mut score: Vec<(String, f32)> = Vec::new();
    for list in [keyword, semantic] {
        for (rank, path) in list.iter().enumerate() {
            let add = 1.0 / (RRF_K + rank as f32 + 1.0);
            match score.iter_mut().find(|(p, _)| p == path) {
                Some((_, s)) => *s += add,
                None => score.push((path.clone(), add)),
            }
        }
    }
    // Stable sort keeps keyword order for ties.
    score.sort_by(|a, b| b.1.total_cmp(&a.1));
    score.into_iter().take(limit).map(|(p, _)| p).collect()
}

/// Merges keyword and meaning hits into one list (fused order), keeping the richest copy of each note.
pub fn merge_hybrid(
    keyword: &[crate::search::SearchHit],
    semantic: &[SemanticHit],
    limit: usize,
) -> Vec<crate::search::SearchHit> {
    let kw_paths: Vec<String> = keyword.iter().map(|h| h.path.clone()).collect();
    let sem_paths: Vec<String> = semantic.iter().map(|h| h.path.clone()).collect();
    fuse(&kw_paths, &sem_paths, limit)
        .into_iter()
        .filter_map(|path| {
            if let Some(h) = keyword.iter().find(|h| h.path == path) {
                return Some(h.clone());
            }
            semantic
                .iter()
                .find(|h| h.path == path)
                .map(|h| crate::search::SearchHit {
                    path: h.path.clone(),
                    title: h.title.clone(),
                    snippet: h.snippet.clone(),
                })
        })
        .collect()
}

/// Embeds a query. Errors come from the embedding server and are shown to the user.
pub async fn embed_query(embed: &super::client::EmbedFn, query: &str) -> AppResult<Vec<f32>> {
    let mut v = embed(vec![query.to_string()]).await?.pop().ok_or_else(|| {
        crate::error::AppError::Provider("The embedding server returned nothing".into())
    })?;
    super::vector::normalize(&mut v);
    Ok(v)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn chunk(path: &str, text: &str, vector: Vec<f32>) -> StoredChunk {
        StoredChunk {
            path: path.into(),
            heading: String::new(),
            text: text.into(),
            vector,
        }
    }

    #[test]
    fn best_note_first_and_one_hit_per_note() {
        let chunks = vec![
            chunk("fw.md", "Firewall > Rules\nBlock inbound.", vec![1.0, 0.0]),
            chunk("fw.md", "Firewall\nSecond chunk.", vec![0.9, 0.1]),
            chunk("gar.md", "Garden\nTomatoes.", vec![0.0, 1.0]),
        ];
        let hits = rank(&chunks, &[1.0, 0.0], None, 5);
        assert_eq!(hits[0].path, "fw.md");
        assert_eq!(hits[0].title, "Firewall");
        assert_eq!(hits.iter().filter(|h| h.path == "fw.md").count(), 1);
        assert!(hits.iter().all(|h| h.path != "gar.md"), "below MIN_SCORE");
    }

    #[test]
    fn folder_scope_restricts_results() {
        let chunks = vec![
            chunk("Work/a.md", "A\nwork text here long enough", vec![1.0]),
            chunk("Home/b.md", "B\nhome text here long enough", vec![1.0]),
        ];
        let hits = rank(&chunks, &[1.0], Some("Work"), 5);
        assert_eq!(
            hits.iter().map(|h| h.path.as_str()).collect::<Vec<_>>(),
            vec!["Work/a.md"]
        );
    }

    #[test]
    fn fusion_rewards_items_in_both_lists() {
        let k = vec!["a.md".to_string(), "b.md".to_string()];
        let s = vec!["c.md".to_string(), "b.md".to_string()];
        let fused = fuse(&k, &s, 5);
        assert_eq!(fused[0], "b.md");
        assert_eq!(fuse(&[], &s, 5), s);
        assert!(fuse(&[], &[], 5).is_empty());
        assert_eq!(fuse(&k, &s, 1).len(), 1);
    }
}
