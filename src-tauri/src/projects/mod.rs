//! Projects: folders with their own AI instructions and provider rules.

use crate::error::{AppError, AppResult};
use crate::vault::paths::{is_inside, resolve, resolve_internal};
pub mod service;

use serde::{Deserialize, Serialize};
use std::path::Path;
use ts_rs::TS;

const PROJECTS_DIR: &str = ".vault/projects";

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct Project {
    pub schema_version: u32,
    pub id: String,
    pub name: String,
    pub folder: String,
    pub instructions: String,
    /// A local provider for this project (`None` = the default). A cloud provider is ignored:
    /// notes only ever go to local AI (see `ai::router`).
    pub provider_id: Option<String>,
    pub created_at: String,
    pub updated_at: String,
}

/// Vault-relative path of a project's JSON file.
pub fn file_path(id: &str) -> String {
    format!("{PROJECTS_DIR}/{id}.json")
}

/// Loads every project file.
pub fn load_all(root: &Path) -> Vec<Project> {
    let dir = root.join(PROJECTS_DIR);
    let Ok(read) = std::fs::read_dir(dir) else {
        return Vec::new();
    };
    let mut out: Vec<Project> = read
        .flatten()
        .filter(|e| e.path().extension().is_some_and(|x| x == "json"))
        .filter_map(|e| std::fs::read_to_string(e.path()).ok())
        .filter_map(|s| serde_json::from_str(&s).ok())
        .collect();
    out.sort_by_key(|p: &Project| p.name.to_lowercase());
    out
}

/// Writes a project file.
pub fn save(root: &Path, project: &Project) -> AppResult<()> {
    let abs = resolve_internal(root, &file_path(&project.id))?;
    if let Some(dir) = abs.parent() {
        std::fs::create_dir_all(dir)?;
    }
    crate::vault::fs_ops::write_atomic(&abs, serde_json::to_string_pretty(project)?.as_bytes())?;
    Ok(())
}

/// Removes a project file (never the folder).
pub fn remove_file(root: &Path, id: &str) -> AppResult<()> {
    let abs = resolve_internal(root, &file_path(id))?;
    match std::fs::remove_file(abs) {
        Ok(()) => Ok(()),
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(()),
        Err(e) => Err(e.into()),
    }
}

/// The project whose folder contains `path`.
pub fn for_path<'a>(projects: &'a [Project], path: &str) -> Option<&'a Project> {
    projects.iter().find(|p| is_inside(path, &p.folder))
}

/// Checks that `folder` can become a project (exists, not nested in or around another project).
pub fn validate_new(
    root: &Path,
    projects: &[Project],
    folder: &str,
    ignore_id: Option<&str>,
) -> AppResult<()> {
    let abs = resolve(root, folder, None)?;
    if !abs.is_dir() {
        return Err(AppError::NotFound(format!("{folder} is not a folder")));
    }
    for p in projects.iter().filter(|p| Some(p.id.as_str()) != ignore_id) {
        if is_inside(folder, &p.folder) {
            return Err(AppError::Conflict(format!(
                "{folder} is already inside the project “{}”",
                p.name
            )));
        }
        if is_inside(&p.folder, folder) {
            return Err(AppError::Conflict(format!(
                "{folder} contains the project “{}”",
                p.name
            )));
        }
    }
    Ok(())
}

/// Current time as RFC 3339 (UTC).
pub fn now() -> String {
    chrono::Utc::now().to_rfc3339_opts(chrono::SecondsFormat::Secs, true)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn project(id: &str, folder: &str) -> Project {
        Project {
            schema_version: 1,
            id: id.into(),
            name: id.into(),
            folder: folder.into(),
            instructions: String::new(),
            provider_id: None,
            created_at: now(),
            updated_at: now(),
        }
    }

    #[test]
    fn nesting_is_rejected() {
        let d = tempfile::tempdir().unwrap();
        std::fs::create_dir_all(d.path().join("Work/Security/Deep")).unwrap();
        std::fs::create_dir_all(d.path().join("Other")).unwrap();
        let ps = vec![project("a", "Work/Security")];
        assert!(validate_new(d.path(), &ps, "Work/Security/Deep", None).is_err());
        assert!(validate_new(d.path(), &ps, "Work", None).is_err());
        assert!(validate_new(d.path(), &ps, "Other", None).is_ok());
        assert!(validate_new(d.path(), &ps, "Work/Security", Some("a")).is_ok());
        assert!(validate_new(d.path(), &ps, "Missing", None).is_err());
    }

    #[test]
    fn save_load_and_lookup() {
        let d = tempfile::tempdir().unwrap();
        let p = project("3f6c", "Work");
        save(d.path(), &p).unwrap();
        let all = load_all(d.path());
        assert_eq!(all.len(), 1);
        assert!(for_path(&all, "Work/x.md").is_some());
        assert!(for_path(&all, "Workshop/x.md").is_none());
        remove_file(d.path(), "3f6c").unwrap();
        assert!(load_all(d.path()).is_empty());
    }

    #[test]
    fn project_files_from_older_versions_still_load() {
        // Versions before 0.7.0 stored a `localOnly` flag. It is ignored now.
        let d = tempfile::tempdir().unwrap();
        let dir = d.path().join(PROJECTS_DIR);
        std::fs::create_dir_all(&dir).unwrap();
        std::fs::write(
            dir.join("old.json"),
            r#"{"schemaVersion":1,"id":"old","name":"Old","folder":"Work","instructions":"",
                "providerId":null,"localOnly":true,"createdAt":"","updatedAt":""}"#,
        )
        .unwrap();
        let loaded = load_all(d.path());
        assert_eq!(loaded.len(), 1);
        assert_eq!(loaded[0].name, "Old");
        save(d.path(), &loaded[0]).unwrap();
        let text = std::fs::read_to_string(dir.join("old.json")).unwrap();
        assert!(
            !text.contains("localOnly"),
            "the old flag is dropped on save"
        );
    }
}
