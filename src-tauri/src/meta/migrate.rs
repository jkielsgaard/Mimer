//! TEMPORARY, for version 0.23 only: moves what older versions wrote into the notes over to
//! `.vault/meta.json` (see the parent module), after the person has said yes.
//!
//! * a note with the tag `pinned` in its properties becomes a pinned note in the file, and the tag
//!   is taken off the note;
//! * a task line with the words `for:` or `after:` gets them in the file, and the words are taken
//!   off the line.
//!
//! Until it is done everything still works, because the old places are still read. The version
//! after this one stops reading them, and this module is removed with it. Everything is committed
//! first, so History has the notes as they were.

use super::{set_pinned, set_waiting, task_ref};
use crate::commands::tasks::{notes_with_front_tag, raw_tasks};
use crate::error::AppResult;
use crate::git::{CommitKind, CommitReason};
use crate::markdown::note_tags;
use crate::tasks::{self, MetaPatch};
use crate::vault::{fs_ops, ops, OpenVault};
use serde::Serialize;
use std::collections::BTreeMap;
use ts_rs::TS;

/// What there is to move, or what was moved.
#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct MigrationCount {
    /// Notes with the tag `pinned`.
    pub pinned: u32,
    /// Tasks with `for:` or `after:` in their line.
    pub tasks: u32,
}

fn count(n: usize) -> u32 {
    u32::try_from(n).unwrap_or(u32::MAX)
}

/// How much there is to move in the vault.
pub fn scan(v: &OpenVault) -> MigrationCount {
    MigrationCount {
        pinned: count(notes_with_front_tag(v, "pinned").len()),
        tasks: count(
            raw_tasks(v)
                .iter()
                .filter(|t| t.waiting_for.is_some() || t.after.is_some())
                .count(),
        ),
    }
}

/// Moves everything over. Returns how much was moved.
pub fn run(v: &OpenVault) -> AppResult<MigrationCount> {
    if let Err(e) = v.commit(CommitReason::new(CommitKind::Autosave, None), None) {
        tracing::warn!("commit before the move failed: {e}");
    }
    let mut moved = MigrationCount::default();

    for note in notes_with_front_tag(v, "pinned") {
        set_pinned(&v.root, &note.path, true)?;
        let new = note_tags::remove_tag(&note.content, "pinned");
        if new != note.content {
            ops::write_note(v, &note.path, &new)?;
        }
        moved.pinned += 1;
    }

    let mut by_note: BTreeMap<String, usize> = BTreeMap::new();
    for t in raw_tasks(v) {
        if t.waiting_for.is_some() || t.after.is_some() {
            *by_note.entry(t.path).or_default() += 1;
        }
    }
    for (path, n) in by_note {
        let mut content = fs_ops::read_note(&v.root, &path)?.content;
        for _ in 0..n + 2 {
            let Some(t) = tasks::parse(&path, &content)
                .into_iter()
                .find(|t| t.waiting_for.is_some() || t.after.is_some())
            else {
                break;
            };
            // What the file already says is kept; the old words only fill in what it lacks.
            let have = super::load(&v.root);
            let known = have.tasks.get(&task_ref(&path, &t.title));
            let waiting_for = known
                .is_none_or(|k| k.waiting_for.is_none())
                .then(|| t.waiting_for.clone())
                .flatten();
            let after = known
                .is_none_or(|k| k.after.is_none())
                .then(|| t.after.clone())
                .flatten();
            set_waiting(
                &v.root,
                &path,
                &t.title,
                waiting_for.map(Some),
                after.map(Some),
            )?;
            content = tasks::set_meta(
                &content,
                t.line,
                &t.key,
                &MetaPatch {
                    waiting_for: Some(None),
                    after: Some(None),
                    ..MetaPatch::default()
                },
            )?;
            moved.tasks += 1;
        }
        ops::write_note(v, &path, &content)?;
    }
    v.refresh_files();
    Ok(moved)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::vault::open_for_test;

    #[test]
    fn old_pins_and_waiting_words_move_to_the_file_and_leave_the_notes_clean() {
        let d = tempfile::tempdir().unwrap();
        let v = open_for_test(d.path());
        ops::write_note(&v, "Pin.md", "---\ntags: [pinned, mine]\n---\n# Pin\n").unwrap();
        ops::write_note(
            &v,
            "Epic.md",
            "---\ntags: [epic]\n---\n# E\n\n- [ ] Upgrade status:waiting for:\"the customer\" after:\"E#Test\"\n- [ ] Test\n- [ ] Plain\n",
        )
        .unwrap();
        v.refresh_files();
        assert_eq!(
            scan(&v),
            MigrationCount {
                pinned: 1,
                tasks: 1
            }
        );

        let moved = run(&v).unwrap();
        assert_eq!(
            moved,
            MigrationCount {
                pinned: 1,
                tasks: 1
            }
        );
        assert_eq!(scan(&v), MigrationCount::default());

        let pin = std::fs::read_to_string(d.path().join("Pin.md")).unwrap();
        assert!(!pin.contains("pinned") && pin.contains("mine"), "{pin}");
        let epic = std::fs::read_to_string(d.path().join("Epic.md")).unwrap();
        assert!(epic.contains("- [ ] Upgrade status:waiting\n"), "{epic}");
        assert!(!epic.contains("for:") && !epic.contains("after:"), "{epic}");

        let m = super::super::load(d.path());
        assert_eq!(m.pinned, vec!["Pin.md"]);
        assert_eq!(
            m.tasks["Epic#Upgrade"].waiting_for.as_deref(),
            Some("the customer")
        );
        assert_eq!(m.tasks["Epic#Upgrade"].after.as_deref(), Some("E#Test"));
        // Doing it again changes nothing.
        assert_eq!(run(&v).unwrap(), MigrationCount::default());
    }
}
