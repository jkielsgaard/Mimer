//! Note templates (`.vault/templates/*.md`), new notes from templates and daily notes.

pub mod render;
pub mod standard;

use crate::error::{AppError, AppResult};
use crate::git::{CommitKind, CommitReason};
use crate::vault::fs_ops;
use crate::vault::ops;
use crate::vault::paths::{resolve, resolve_internal};
use crate::vault::OpenVault;
use chrono::{DateTime, Local, NaiveDate, TimeZone};
use serde::Serialize;
use std::path::Path;
use ts_rs::TS;

/// Folder inside `.vault/` that holds the templates.
pub const DIR: &str = ".vault/templates";

/// A template file.
#[derive(Debug, Clone, Serialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct TemplateInfo {
    pub name: String,
    /// Vault-relative path, e.g. `.vault/templates/Meeting.md`.
    pub path: String,
}

/// Lists templates, sorted case-insensitively. Empty when the folder does not exist.
pub fn list(root: &Path) -> Vec<TemplateInfo> {
    let Ok(read) = std::fs::read_dir(root.join(DIR)) else {
        return Vec::new();
    };
    let mut out: Vec<TemplateInfo> = read
        .flatten()
        .filter_map(|e| {
            let name = e.file_name().to_string_lossy().into_owned();
            let stem = name.strip_suffix(".md")?;
            Some(TemplateInfo {
                name: stem.to_string(),
                path: format!("{DIR}/{name}"),
            })
        })
        .collect();
    out.sort_by_key(|t| t.name.to_lowercase());
    out
}

/// Turns a user-given template name into a validated name (no `.md`).
fn clean_name(name: &str) -> AppResult<String> {
    let trimmed = name.trim();
    let trimmed = trimmed.strip_suffix(".md").unwrap_or(trimmed);
    fs_ops::validate_name(trimmed)
}

fn template_rel(name: &str) -> AppResult<String> {
    Ok(format!("{DIR}/{}.md", clean_name(name)?))
}

/// Reads a template's content.
pub fn read(root: &Path, name: &str) -> AppResult<String> {
    let abs = resolve_internal(root, &template_rel(name)?)?;
    std::fs::read_to_string(abs)
        .map_err(|_| AppError::NotFound(format!("Template “{name}” does not exist")))
}

/// Saves a note as a template and commits it.
pub fn save_from_note(v: &OpenVault, note_path: &str, name: &str) -> AppResult<TemplateInfo> {
    let note = fs_ops::read_note(&v.root, note_path)?;
    let name = clean_name(name)?;
    let rel = format!("{DIR}/{name}.md");
    let abs = resolve_internal(&v.root, &rel)?;
    if abs.exists() {
        return Err(AppError::AlreadyExists(format!(
            "A template called “{name}” already exists"
        )));
    }
    if let Some(dir) = abs.parent() {
        std::fs::create_dir_all(dir)?;
    }
    fs_ops::write_atomic(&abs, note.content.as_bytes())?;
    v.commit(
        CommitReason::new(CommitKind::Template, Some(format!("added {name}"))),
        Some(std::slice::from_ref(&rel)),
    )?;
    Ok(TemplateInfo { name, path: rel })
}

/// Deletes a template and commits the removal.
pub fn delete(v: &OpenVault, name: &str) -> AppResult<()> {
    let rel = template_rel(name)?;
    let abs = resolve_internal(&v.root, &rel)?;
    if !abs.exists() {
        return Err(AppError::NotFound(format!(
            "Template “{name}” does not exist"
        )));
    }
    std::fs::remove_file(&abs)?;
    let clean = clean_name(name)?;
    v.commit(
        CommitReason::new(CommitKind::Template, Some(format!("removed {clean}"))),
        Some(std::slice::from_ref(&rel)),
    )?;
    Ok(())
}

/// Creates `<folder>/<name>.md`, filled from a template when given. Returns the new path.
pub fn create_note_from_template(
    v: &OpenVault,
    folder: &str,
    name: &str,
    template: Option<&str>,
    now: &DateTime<Local>,
) -> AppResult<String> {
    let name = clean_name(name)?;
    let content = match template.filter(|t| !t.trim().is_empty()) {
        Some(t) => render::render(&read(&v.root, t)?, &name, now),
        None => String::new(),
    };
    let target = if folder.is_empty() {
        format!("{name}.md")
    } else {
        format!("{}/{name}.md", folder.trim_matches('/'))
    };
    resolve(&v.root, &target, None)?;
    let created = fs_ops::create_note(&v.root, folder.trim_matches('/'), Some(&name))?;
    ops::write_note(v, &created, &content)?;
    v.refresh_files();
    Ok(created)
}

/// Returns today's (or `date`'s) daily note, creating it from the daily template if needed.
/// An existing note is never touched.
pub fn open_daily_note(
    v: &OpenVault,
    date: Option<NaiveDate>,
    now: &DateTime<Local>,
) -> AppResult<String> {
    let cfg = v.config();
    let date = date.unwrap_or_else(|| now.date_naive());
    let at = Local
        .from_local_datetime(&date.and_time(now.time()))
        .single()
        .unwrap_or(*now);
    let file_stem = render::format_time(&at, &cfg.daily_note_format)
        .ok_or_else(|| AppError::Settings("The daily note date format is not valid".into()))?;
    let stem = fs_ops::validate_name(&file_stem)?;
    let folder = cfg.daily_notes_folder.trim_matches('/').to_string();
    let rel = if folder.is_empty() {
        format!("{stem}.md")
    } else {
        format!("{folder}/{stem}.md")
    };
    if resolve(&v.root, &rel, None)?.exists() {
        return Ok(rel);
    }
    let template = if cfg.daily_template.is_empty() || read(&v.root, &cfg.daily_template).is_err() {
        None
    } else {
        Some(cfg.daily_template.as_str())
    };
    create_note_from_template(v, &folder, &stem, template, &at)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::vault::open_for_test;
    use chrono::TimeZone;

    fn now() -> DateTime<Local> {
        Local
            .with_ymd_and_hms(2026, 10, 13, 9, 30, 0)
            .single()
            .expect("valid time")
    }

    fn write_template(v: &OpenVault, name: &str, text: &str) {
        std::fs::create_dir_all(v.root.join(DIR)).unwrap();
        std::fs::write(v.root.join(DIR).join(format!("{name}.md")), text).unwrap();
    }

    #[test]
    fn templates_are_listed_sorted() {
        let d = tempfile::tempdir().unwrap();
        let v = open_for_test(d.path());
        write_template(&v, "zeta", "z");
        write_template(&v, "Alpha", "a");
        let names: Vec<_> = list(&v.root).into_iter().map(|t| t.name).collect();
        assert_eq!(names, vec!["Alpha", "zeta"]);
    }

    #[test]
    fn save_and_delete_each_make_one_commit() {
        let d = tempfile::tempdir().unwrap();
        let v = open_for_test(d.path());
        ops::write_note(&v, "Meet.md", "# {{title}}").unwrap();
        save_from_note(&v, "Meet.md", "Meeting").unwrap();
        assert!(save_from_note(&v, "Meet.md", "Meeting").is_err());
        assert_eq!(read(&v.root, "Meeting").unwrap(), "# {{title}}");
        delete(&v, "Meeting").unwrap();
        assert!(read(&v.root, "Meeting").is_err());
    }

    #[test]
    fn bad_template_names_are_rejected() {
        let d = tempfile::tempdir().unwrap();
        let v = open_for_test(d.path());
        ops::write_note(&v, "n.md", "x").unwrap();
        for name in ["../evil", "a/b", ".hidden", ""] {
            assert!(save_from_note(&v, "n.md", name).is_err(), "{name}");
            assert!(read(&v.root, name).is_err(), "{name}");
        }
    }

    #[test]
    fn create_from_template_renders_variables() {
        let d = tempfile::tempdir().unwrap();
        let v = open_for_test(d.path());
        write_template(&v, "Meeting", "# {{title}}\nDate: {{date}}");
        let path =
            create_note_from_template(&v, "Work/Meetings", "Kickoff", Some("Meeting"), &now())
                .unwrap();
        assert_eq!(path, "Work/Meetings/Kickoff.md");
        assert_eq!(
            std::fs::read_to_string(v.root.join(&path)).unwrap(),
            "# Kickoff\nDate: 2026-10-13"
        );
        assert!(create_note_from_template(&v, "Work/Meetings", "Kickoff", None, &now()).is_err());
    }

    #[test]
    fn daily_note_is_created_once_and_not_overwritten() {
        let d = tempfile::tempdir().unwrap();
        let v = open_for_test(d.path());
        write_template(&v, "Day", "Today is {{weekday}}");
        let mut cfg = v.config();
        cfg.daily_template = "Day".into();
        v.set_config(cfg).unwrap();
        let p1 = open_daily_note(&v, None, &now()).unwrap();
        assert_eq!(p1, "Daily/2026-10-13.md");
        assert_eq!(
            std::fs::read_to_string(v.root.join(&p1)).unwrap(),
            "Today is Tuesday"
        );
        std::fs::write(v.root.join(&p1), "my own text").unwrap();
        let p2 = open_daily_note(&v, None, &now()).unwrap();
        assert_eq!(p1, p2);
        assert_eq!(
            std::fs::read_to_string(v.root.join(&p1)).unwrap(),
            "my own text"
        );
    }

    #[test]
    fn missing_template_falls_back_to_empty_daily_note() {
        let d = tempfile::tempdir().unwrap();
        let v = open_for_test(d.path());
        let mut cfg = v.config();
        cfg.daily_template = "Gone".into();
        v.set_config(cfg).unwrap();
        let p = open_daily_note(&v, None, &now()).unwrap();
        assert_eq!(std::fs::read_to_string(v.root.join(p)).unwrap(), "");
    }

    #[test]
    fn invalid_daily_format_is_rejected_by_config_and_creation() {
        let d = tempfile::tempdir().unwrap();
        let v = open_for_test(d.path());
        let mut cfg = v.config();
        cfg.daily_note_format = "%Y/%m/%d".into();
        assert!(v.set_config(cfg.clone()).is_err());
        cfg.daily_note_format = "%Q".into();
        assert!(v.set_config(cfg).is_err());
    }

    #[test]
    fn old_config_files_still_load_with_defaults() {
        let d = tempfile::tempdir().unwrap();
        let v = open_for_test(d.path());
        std::fs::write(
            v.root.join(".vault/config.json"),
            r#"{"schemaVersion":1,"attachmentsFolder":"files","newNoteFolder":""}"#,
        )
        .unwrap();
        assert_eq!(v.config().attachments_folder, "files");
        assert_eq!(v.config().daily_notes_folder, "Daily");
    }

    #[test]
    fn config_rejects_escaping_folders() {
        let d = tempfile::tempdir().unwrap();
        let v = open_for_test(d.path());
        let mut cfg = v.config();
        cfg.daily_notes_folder = "../outside".into();
        assert!(v.set_config(cfg).is_err());
    }
}
