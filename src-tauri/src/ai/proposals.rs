//! Proposed AI changes: queueing, merging, change detection and applying.

use crate::error::{AppError, AppResult};
use crate::git::{CommitKind, CommitReason};
use crate::vault::{fs_ops, ops, paths, OpenVault};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::collections::HashMap;
use ts_rs::TS;
use uuid::Uuid;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "lowercase")]
#[ts(export)]
pub enum ProposalAction {
    Edit,
    Create,
    Move,
    Delete,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct Proposal {
    pub id: Uuid,
    pub action: ProposalAction,
    /// Target path (for `move`: the source).
    pub path: String,
    /// Destination for `move`.
    pub new_path: Option<String>,
    /// New content for `edit` / `create`.
    pub content: Option<String>,
    /// Content when the proposal was made (for the diff).
    pub original: Option<String>,
    pub original_hash: Option<String>,
    pub reason: String,
}

#[derive(Debug, Clone)]
pub struct ProposalSet {
    pub id: Uuid,
    pub scope: Option<String>,
    pub proposals: Vec<Proposal>,
}

#[derive(Debug, Clone, Serialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct ProposalView {
    pub proposal: Proposal,
    pub changed_since_proposal: bool,
}

#[derive(Debug, Clone, Serialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct ProposalSetView {
    pub id: Uuid,
    pub proposals: Vec<ProposalView>,
}

#[derive(Debug, Clone, Serialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct SkippedProposal {
    pub path: String,
    pub reason: String,
}

#[derive(Debug, Clone, Serialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct ApplyResult {
    pub applied: Vec<String>,
    pub applied_ids: Vec<Uuid>,
    pub skipped: Vec<SkippedProposal>,
    pub commit_sha: Option<String>,
}

/// SHA-256 hex of a string.
pub fn hash(s: &str) -> String {
    let mut h = Sha256::new();
    h.update(s.as_bytes());
    h.finalize().iter().map(|b| format!("{b:02x}")).collect()
}

impl ProposalSet {
    /// Creates an empty proposal set for a chat turn; `scope` limits writes to a folder.
    pub fn new(scope: Option<String>) -> Self {
        Self {
            id: Uuid::new_v4(),
            scope,
            proposals: Vec::new(),
        }
    }

    /// Adds a proposal. Several proposals for the same path are merged (last edit wins).
    pub fn add(&mut self, mut p: Proposal) {
        let Some(pos) = self.proposals.iter().position(|e| e.path == p.path) else {
            self.proposals.push(p);
            return;
        };
        let old = self.proposals[pos].clone();
        use ProposalAction::*;
        match (old.action, p.action) {
            (Create, Edit) => {
                p.action = Create;
                p.original = None;
                p.original_hash = None;
            }
            (Create, Delete) => {
                self.proposals.remove(pos);
                return;
            }
            (Edit, Edit) | (Edit, Delete) => {
                p.original = old.original;
                p.original_hash = old.original_hash;
            }
            (Delete, Create) => {
                p.action = Edit;
                p.original = old.original;
                p.original_hash = old.original_hash;
            }
            _ => {}
        }
        self.proposals[pos] = p;
    }

    /// `AI: <first reason, 60 chars> (+N more)`.
    pub fn summary(proposals: &[&Proposal]) -> String {
        let first = proposals
            .first()
            .map(|p| p.reason.trim())
            .filter(|r| !r.is_empty())
            .unwrap_or("Apply changes");
        let mut s: String = first.chars().take(60).collect();
        if proposals.len() > 1 {
            s.push_str(&format!(" (+{} more)", proposals.len() - 1));
        }
        s
    }
}

fn current_hash(root: &std::path::Path, rel: &str) -> Option<String> {
    let abs = paths::resolve(root, rel, None).ok()?;
    let bytes = std::fs::read(abs).ok()?;
    Some(hash(&String::from_utf8_lossy(&bytes)))
}

/// True if the target changed on disk after the proposal was made.
pub fn changed_since(root: &std::path::Path, p: &Proposal) -> bool {
    match p.action {
        ProposalAction::Create => paths::resolve(root, &p.path, None)
            .map(|a| a.exists())
            .unwrap_or(true),
        _ => current_hash(root, &p.path) != p.original_hash,
    }
}

/// View with change detection for the review UI.
pub fn view(root: &std::path::Path, set: &ProposalSet) -> ProposalSetView {
    ProposalSetView {
        id: set.id,
        proposals: set
            .proposals
            .iter()
            .map(|p| ProposalView {
                proposal: p.clone(),
                changed_since_proposal: changed_since(root, p),
            })
            .collect(),
    }
}

fn order(a: ProposalAction) -> u8 {
    match a {
        ProposalAction::Move => 0,
        ProposalAction::Edit => 1,
        ProposalAction::Create => 2,
        ProposalAction::Delete => 3,
    }
}

/// Applies the accepted proposals: snapshot commit, apply in order (moves, edits, creates,
/// deletes), update the index, one `AI:` commit. Proposals that changed on disk need
/// their id in `confirmed_changed`.
pub fn apply(
    v: &OpenVault,
    set: &ProposalSet,
    accepted: &[Uuid],
    confirmed_changed: &[Uuid],
) -> AppResult<ApplyResult> {
    let mut selected: Vec<&Proposal> = set
        .proposals
        .iter()
        .filter(|p| accepted.contains(&p.id))
        .collect();
    selected.sort_by_key(|p| order(p.action));
    let summary = ProposalSet::summary(&selected);
    v.commit(
        CommitReason::new(CommitKind::SnapshotBeforeAi, Some(summary.clone())),
        None,
    )?;

    let scope = set.scope.as_deref();
    let mut applied: Vec<&Proposal> = Vec::new();
    let mut skipped = Vec::new();
    let mut commit_paths: Vec<String> = Vec::new();
    let skip = |p: &Proposal, reason: &str| SkippedProposal {
        path: p.path.clone(),
        reason: reason.to_string(),
    };

    for p in selected {
        if paths::resolve(&v.root, &p.path, scope).is_err()
            || p.new_path
                .as_deref()
                .is_some_and(|n| paths::resolve(&v.root, n, scope).is_err())
        {
            skipped.push(skip(p, "Outside the allowed folder"));
            continue;
        }
        if changed_since(&v.root, p) && !confirmed_changed.contains(&p.id) {
            skipped.push(skip(
                p,
                "Changed since the proposal was made; confirm to apply",
            ));
            continue;
        }
        let result: AppResult<()> = (|| {
            match p.action {
                ProposalAction::Move => {
                    let to = p
                        .new_path
                        .as_deref()
                        .ok_or_else(|| AppError::InvalidPath("Move without destination".into()))?;
                    let (_, paths) = ops::rename_no_commit(v, &p.path, to, true)?;
                    commit_paths.extend(paths);
                }
                ProposalAction::Edit => {
                    let c = p.content.as_deref().unwrap_or("");
                    if !paths::resolve(&v.root, &p.path, None)?.exists() {
                        return Err(AppError::NotFound(format!("{} no longer exists", p.path)));
                    }
                    ops::write_note(v, &p.path, c)?;
                    commit_paths.push(p.path.clone());
                }
                ProposalAction::Create => {
                    if paths::resolve(&v.root, &p.path, None)?.exists() {
                        return Err(AppError::AlreadyExists(format!(
                            "{} already exists",
                            p.path
                        )));
                    }
                    ops::write_note(v, &p.path, p.content.as_deref().unwrap_or(""))?;
                    v.refresh_files();
                    commit_paths.push(p.path.clone());
                }
                ProposalAction::Delete => {
                    fs_ops::delete(&v.root, &p.path)?;
                    v.with_index(|c| crate::search::remove_note(c, &p.path))?;
                    v.refresh_files();
                    commit_paths.push(p.path.clone());
                }
            }
            Ok(())
        })();
        match result {
            Ok(()) => applied.push(p),
            Err(e) => skipped.push(skip(p, &e.to_string())),
        }
    }
    v.refresh_files();
    commit_paths.sort();
    commit_paths.dedup();
    let sha = if applied.is_empty() {
        None
    } else {
        let summary = ProposalSet::summary(&applied);
        v.commit(
            CommitReason::new(CommitKind::Ai, Some(summary)),
            Some(&commit_paths),
        )?
    };
    Ok(ApplyResult {
        applied: applied.iter().map(|p| p.path.clone()).collect(),
        applied_ids: applied.iter().map(|p| p.id).collect(),
        skipped,
        commit_sha: sha,
    })
}

/// Removes applied proposals from their set; drops the set once nothing is left to review.
pub fn forget_applied(sets: &mut HashMap<Uuid, ProposalSet>, set_id: &Uuid, applied: &[Uuid]) {
    if let Some(s) = sets.get_mut(set_id) {
        s.proposals.retain(|p| !applied.contains(&p.id));
        if s.proposals.is_empty() {
            sets.remove(set_id);
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::vault::open_for_test;

    fn prop(
        action: ProposalAction,
        path: &str,
        content: Option<&str>,
        original: Option<&str>,
    ) -> Proposal {
        Proposal {
            id: Uuid::new_v4(),
            action,
            path: path.into(),
            new_path: None,
            content: content.map(str::to_string),
            original: original.map(str::to_string),
            original_hash: original.map(hash),
            reason: format!("{action:?} {path}"),
        }
    }

    #[test]
    fn merging_last_edit_wins_and_create_edit_stays_create() {
        let mut s = ProposalSet::new(None);
        s.add(prop(ProposalAction::Edit, "a.md", Some("1"), Some("orig")));
        s.add(prop(ProposalAction::Edit, "a.md", Some("2"), Some("1")));
        assert_eq!(s.proposals.len(), 1);
        assert_eq!(s.proposals[0].content.as_deref(), Some("2"));
        assert_eq!(
            s.proposals[0].original.as_deref(),
            Some("orig"),
            "keeps the true original"
        );

        s.add(prop(ProposalAction::Create, "n.md", Some("x"), None));
        s.add(prop(ProposalAction::Edit, "n.md", Some("y"), None));
        let n = s.proposals.iter().find(|p| p.path == "n.md").unwrap();
        assert_eq!(
            (n.action, n.content.as_deref()),
            (ProposalAction::Create, Some("y"))
        );

        s.add(prop(ProposalAction::Delete, "n.md", None, None));
        assert!(
            s.proposals.iter().all(|p| p.path != "n.md"),
            "create + delete cancel out"
        );
    }

    #[test]
    fn summary_truncates_and_counts() {
        let mut a = prop(ProposalAction::Edit, "a.md", Some(""), Some(""));
        a.reason = "r".repeat(100);
        let b = prop(ProposalAction::Edit, "b.md", Some(""), Some(""));
        let s = ProposalSet::summary(&[&a, &b]);
        assert_eq!(s, format!("{} (+1 more)", "r".repeat(60)));
    }

    #[test]
    fn apply_order_selection_and_commit() {
        let d = tempfile::tempdir().unwrap();
        let v = open_for_test(d.path());
        ops::write_note(&v, "Big.md", "# Big\ncontent").unwrap();
        ops::write_note(&v, "Gone.md", "bye").unwrap();
        v.refresh_files();
        let mut set = ProposalSet::new(None);
        set.add(prop(
            ProposalAction::Create,
            "Part1.md",
            Some("part one"),
            None,
        ));
        set.add(prop(
            ProposalAction::Create,
            "Part2.md",
            Some("part two"),
            None,
        ));
        set.add(prop(
            ProposalAction::Edit,
            "Big.md",
            Some("# Big\n[[Part1]]"),
            Some("# Big\ncontent"),
        ));
        set.add(prop(ProposalAction::Delete, "Gone.md", None, Some("bye")));
        let accept: Vec<Uuid> = set
            .proposals
            .iter()
            .filter(|p| p.path != "Part2.md")
            .map(|p| p.id)
            .collect();
        let r = apply(&v, &set, &accept, &[]).unwrap();
        assert_eq!(r.applied.len(), 3);
        assert!(d.path().join("Part1.md").exists());
        assert!(
            !d.path().join("Part2.md").exists(),
            "rejected proposal must not be applied"
        );
        assert!(!d.path().join("Gone.md").exists());
        assert_eq!(
            std::fs::read_to_string(d.path().join("Big.md")).unwrap(),
            "# Big\n[[Part1]]"
        );
        assert!(r.commit_sha.is_some());
        // Nothing is lost: the snapshot commit still has the old content.
        let msgs: Vec<String> = v
            .with_repo(|repo| {
                let mut w = repo.revwalk()?;
                w.push_head()?;
                Ok(w.filter_map(|o| repo.find_commit(o.ok()?).ok())
                    .map(|c| c.message().unwrap_or("").to_string())
                    .collect())
            })
            .unwrap();
        assert!(msgs[0].starts_with("AI: "));
        assert!(msgs[1].starts_with("Snapshot before AI"));
    }

    #[test]
    fn changed_files_need_confirmation() {
        let d = tempfile::tempdir().unwrap();
        let v = open_for_test(d.path());
        ops::write_note(&v, "A.md", "original").unwrap();
        let mut set = ProposalSet::new(None);
        set.add(prop(
            ProposalAction::Edit,
            "A.md",
            Some("ai version"),
            Some("original"),
        ));
        std::fs::write(d.path().join("A.md"), "user edited meanwhile").unwrap();
        assert!(view(&v.root, &set).proposals[0].changed_since_proposal);
        let id = set.proposals[0].id;
        let r = apply(&v, &set, &[id], &[]).unwrap();
        assert!(r.applied.is_empty() && r.skipped.len() == 1);
        assert_eq!(
            std::fs::read_to_string(d.path().join("A.md")).unwrap(),
            "user edited meanwhile"
        );
        let r = apply(&v, &set, &[id], &[id]).unwrap();
        assert_eq!(r.applied.len(), 1);
        assert_eq!(
            std::fs::read_to_string(d.path().join("A.md")).unwrap(),
            "ai version"
        );
    }

    #[test]
    fn out_of_scope_proposals_are_rejected_on_apply() {
        let d = tempfile::tempdir().unwrap();
        let v = open_for_test(d.path());
        std::fs::create_dir_all(d.path().join("Proj")).unwrap();
        let mut set = ProposalSet::new(Some("Proj".into()));
        set.add(prop(
            ProposalAction::Create,
            "Elsewhere.md",
            Some("x"),
            None,
        ));
        let id = set.proposals[0].id;
        let r = apply(&v, &set, &[id], &[]).unwrap();
        assert_eq!(r.skipped.len(), 1);
        assert!(!d.path().join("Elsewhere.md").exists());
    }

    #[test]
    fn moves_update_links() {
        let d = tempfile::tempdir().unwrap();
        let v = open_for_test(d.path());
        ops::write_note(&v, "Old.md", "x").unwrap();
        ops::write_note(&v, "Ref.md", "[[Old]]").unwrap();
        v.refresh_files();
        let mut set = ProposalSet::new(None);
        let mut m = prop(ProposalAction::Move, "Old.md", None, Some("x"));
        m.new_path = Some("New.md".into());
        set.add(m);
        let id = set.proposals[0].id;
        apply(&v, &set, &[id], &[]).unwrap();
        assert_eq!(
            std::fs::read_to_string(d.path().join("Ref.md")).unwrap(),
            "[[New]]"
        );
    }

    #[test]
    fn forget_applied_keeps_rejected_proposals_and_drops_empty_sets() {
        let mut set = ProposalSet::new(None);
        set.add(prop(ProposalAction::Create, "a.md", Some("a"), None));
        set.add(prop(ProposalAction::Create, "b.md", Some("b"), None));
        let first = set.proposals[0].id;
        let second = set.proposals[1].id;
        let id = set.id;
        let mut sets = HashMap::from([(id, set)]);

        forget_applied(&mut sets, &id, &[first]);
        assert_eq!(sets[&id].proposals.len(), 1);
        assert_eq!(sets[&id].proposals[0].id, second);

        forget_applied(&mut sets, &id, &[second]);
        assert!(sets.is_empty());

        // Unknown sets are ignored.
        forget_applied(&mut sets, &Uuid::new_v4(), &[first]);
    }
}
