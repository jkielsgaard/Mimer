//! The standard folders and templates every vault starts with: meeting notes and quick notes.

use super::{read, render, DIR};
use crate::error::AppResult;
use crate::git::{CommitKind, CommitReason};
use crate::import::sanitize_name;
use crate::vault::paths::{resolve_dir, resolve_internal};
use crate::vault::{fs_ops, ops, OpenVault};
use chrono::{DateTime, Local};
use serde::{Deserialize, Serialize};
use ts_rs::TS;

/// Template for meeting notes (name `Meeting`).
pub const MEETING_TEMPLATE: &str = "---
tags: [meeting]
---
# {{title}}

**Date:** {{date}} {{time}}
**Attendees:**
**Location or link:**

## Agenda

- 

## Notes

## Decisions

- 

## Action items

- [ ] Task, owner, due date

## Next meeting

";

/// Template for quick notes (name `Quick note`).
pub const QUICK_NOTE_TEMPLATE: &str = "---
tags: [quick]
---
# {{title}}

{{datetime}}

";

/// The kinds of note the \"New meeting note\" and \"Quick note\" buttons create.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub enum StandardKind {
    Meeting,
    Quick,
}

/// What [`seed_defaults`] added.
#[derive(Debug, Clone, Default, Serialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct SeedReport {
    pub added_folders: Vec<String>,
    pub added_templates: Vec<String>,
}

/// Creates the meeting and quick-note folders and the two templates when they are missing.
/// Existing folders and templates (also ones the user has edited) are never touched, and the
/// new templates are committed.
pub fn seed_defaults(v: &OpenVault) -> AppResult<SeedReport> {
    let cfg = v.config();
    let mut report = SeedReport::default();
    for folder in [&cfg.meetings_folder, &cfg.quick_notes_folder] {
        if folder.is_empty() {
            continue;
        }
        let dir = resolve_dir(&v.root, folder, None)?;
        if !dir.exists() {
            std::fs::create_dir_all(&dir)?;
            report.added_folders.push(folder.clone());
        }
    }
    let mut written = Vec::new();
    for (name, text) in [
        ("Meeting", MEETING_TEMPLATE),
        ("Quick note", QUICK_NOTE_TEMPLATE),
    ] {
        let rel = format!("{DIR}/{name}.md");
        let abs = resolve_internal(&v.root, &rel)?;
        if abs.exists() {
            continue;
        }
        fs_ops::write_atomic(&abs, text.as_bytes())?;
        report.added_templates.push(name.to_string());
        written.push(rel);
    }
    if !written.is_empty() {
        v.commit(
            CommitReason::new(CommitKind::Template, "standard templates".to_string()),
            Some(&written),
        )?;
    }
    v.refresh_files();
    Ok(report)
}

/// A file stem that is free in `folder`: `stem`, then `stem 2`, `stem 3` …
fn free_stem(v: &OpenVault, folder: &str, stem: &str) -> AppResult<String> {
    let dir = resolve_dir(&v.root, folder, None)?;
    let mut candidate = stem.to_string();
    let mut n = 2;
    while dir.join(format!("{candidate}.md")).exists() {
        candidate = format!("{stem} {n}");
        n += 1;
    }
    Ok(candidate)
}

/// Creates a meeting note (`<date> <title>`) or a quick note (`<date> <hh-mm>`) in its folder
/// from the vault's template (or the built-in one when the template is missing). A taken name
/// gets a number. Returns the new note's path.
pub fn create_standard_note(
    v: &OpenVault,
    kind: StandardKind,
    title: Option<&str>,
    now: &DateTime<Local>,
) -> AppResult<String> {
    let cfg = v.config();
    let date = now.format("%Y-%m-%d");
    let (folder, template, builtin, stem) = match kind {
        StandardKind::Meeting => {
            let title = title
                .map(str::trim)
                .filter(|t| !t.is_empty())
                .unwrap_or("Meeting");
            (
                cfg.meetings_folder,
                "Meeting",
                MEETING_TEMPLATE,
                format!("{date} {}", sanitize_name(title)),
            )
        }
        StandardKind::Quick => (
            cfg.quick_notes_folder,
            "Quick note",
            QUICK_NOTE_TEMPLATE,
            format!("{date} {}", now.format("%H-%M")),
        ),
    };
    let folder = folder.trim_matches('/').to_string();
    let stem = free_stem(v, &folder, &stem)?;
    let text = read(&v.root, template).unwrap_or_else(|_| builtin.to_string());
    let content = render::render(&text, &stem, now);
    let created = fs_ops::create_note(&v.root, &folder, Some(&stem))?;
    ops::write_note(v, &created, &content)?;
    v.refresh_files();
    Ok(created)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::vault::open_for_test;
    use chrono::TimeZone;

    fn vault() -> (tempfile::TempDir, OpenVault) {
        let dir = tempfile::tempdir().unwrap();
        let v = open_for_test(dir.path());
        (dir, v)
    }

    fn at(h: u32, m: u32, s: u32) -> DateTime<Local> {
        Local.with_ymd_and_hms(2026, 10, 13, h, m, s).unwrap()
    }

    fn commit_count(v: &OpenVault) -> usize {
        v.with_repo(|r| {
            let mut w = r.revwalk()?;
            w.push_head()?;
            Ok(w.count())
        })
        .unwrap()
    }

    #[test]
    fn seeding_creates_both_folders_and_templates_in_one_commit() {
        let (_d, v) = vault();
        let before = commit_count(&v);
        let report = seed_defaults(&v).unwrap();
        assert_eq!(report.added_folders, vec!["Meetings", "Quick notes"]);
        assert_eq!(report.added_templates, vec!["Meeting", "Quick note"]);
        assert!(v.root.join("Meetings").is_dir());
        assert!(v.root.join("Quick notes").is_dir());
        assert!(v.root.join(".vault/templates/Meeting.md").is_file());
        assert!(v.root.join(".vault/templates/Quick note.md").is_file());
        assert_eq!(commit_count(&v), before + 1);
    }

    #[test]
    fn seeding_again_changes_nothing_and_never_overwrites_edits() {
        let (_d, v) = vault();
        seed_defaults(&v).unwrap();
        let path = v.root.join(".vault/templates/Meeting.md");
        std::fs::write(&path, "my own meeting template").unwrap();
        let before = commit_count(&v);
        let report = seed_defaults(&v).unwrap();
        assert!(report.added_folders.is_empty());
        assert!(report.added_templates.is_empty());
        assert_eq!(
            std::fs::read_to_string(path).unwrap(),
            "my own meeting template"
        );
        assert_eq!(commit_count(&v), before, "no empty commit");
    }

    #[test]
    fn a_meeting_note_is_named_after_the_date_and_title_and_filled_from_the_template() {
        let (_d, v) = vault();
        seed_defaults(&v).unwrap();
        let path = create_standard_note(
            &v,
            StandardKind::Meeting,
            Some("Weekly sync"),
            &at(9, 30, 0),
        )
        .unwrap();
        assert_eq!(path, "Meetings/2026-10-13 Weekly sync.md");
        let text = std::fs::read_to_string(v.root.join(&path)).unwrap();
        assert!(text.contains("# 2026-10-13 Weekly sync"));
        assert!(text.contains("**Date:** 2026-10-13 09:30"));
        assert!(text.contains("## Action items"));
        assert!(text.contains("tags: [meeting]"));
    }

    #[test]
    fn a_meeting_without_a_title_is_called_meeting_and_bad_characters_are_cleaned() {
        let (_d, v) = vault();
        let a = create_standard_note(&v, StandardKind::Meeting, None, &at(9, 0, 0)).unwrap();
        assert_eq!(a, "Meetings/2026-10-13 Meeting.md");
        let b = create_standard_note(&v, StandardKind::Meeting, Some("Q1: plan?"), &at(9, 0, 0))
            .unwrap();
        assert_eq!(b, "Meetings/2026-10-13 Q1- plan-.md");
    }

    #[test]
    fn the_same_title_on_the_same_day_gets_a_number() {
        let (_d, v) = vault();
        let one =
            create_standard_note(&v, StandardKind::Meeting, Some("Sync"), &at(9, 0, 0)).unwrap();
        let two =
            create_standard_note(&v, StandardKind::Meeting, Some("Sync"), &at(10, 0, 0)).unwrap();
        assert_eq!(one, "Meetings/2026-10-13 Sync.md");
        assert_eq!(two, "Meetings/2026-10-13 Sync 2.md");
    }

    #[test]
    fn a_quick_note_is_named_after_the_time_and_two_in_a_minute_do_not_clash() {
        let (_d, v) = vault();
        let a = create_standard_note(&v, StandardKind::Quick, None, &at(14, 32, 5)).unwrap();
        let b = create_standard_note(&v, StandardKind::Quick, None, &at(14, 32, 40)).unwrap();
        assert_eq!(a, "Quick notes/2026-10-13 14-32.md");
        assert_eq!(b, "Quick notes/2026-10-13 14-32 2.md");
        let text = std::fs::read_to_string(v.root.join(&a)).unwrap();
        assert!(text.contains("tags: [quick]"));
        assert!(text.contains("2026-10-13 14:32"));
    }

    #[test]
    fn the_vaults_own_template_is_used_and_a_missing_one_falls_back_to_the_built_in() {
        let (_d, v) = vault();
        // No template yet: the built-in text is used.
        let a = create_standard_note(&v, StandardKind::Quick, None, &at(8, 0, 0)).unwrap();
        assert!(std::fs::read_to_string(v.root.join(a))
            .unwrap()
            .contains("tags: [quick]"));
        // A customised template wins.
        std::fs::create_dir_all(v.root.join(".vault/templates")).unwrap();
        std::fs::write(
            v.root.join(".vault/templates/Quick note.md"),
            "Mine: {{title}}",
        )
        .unwrap();
        let b = create_standard_note(&v, StandardKind::Quick, None, &at(8, 5, 0)).unwrap();
        assert_eq!(
            std::fs::read_to_string(v.root.join(b)).unwrap(),
            "Mine: 2026-10-13 08-05"
        );
    }

    #[test]
    fn the_folders_come_from_the_vault_settings() {
        let (_d, v) = vault();
        let mut cfg = v.config();
        cfg.meetings_folder = "Work/Meetings".into();
        std::fs::create_dir_all(v.root.join("Work")).unwrap();
        v.set_config(cfg).unwrap();
        let path =
            create_standard_note(&v, StandardKind::Meeting, Some("A"), &at(9, 0, 0)).unwrap();
        assert_eq!(path, "Work/Meetings/2026-10-13 A.md");
    }
}
