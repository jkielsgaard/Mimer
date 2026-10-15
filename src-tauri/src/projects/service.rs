//! Project operations used by the Tauri commands: validation, saving and Git commits.

use super::{file_path, now, remove_file, save, validate_new, Project};
use crate::error::{AppError, AppResult};
use crate::git::{CommitKind, CommitReason};
use crate::vault::OpenVault;
use uuid::Uuid;

/// Creates a project for a folder and commits it.
pub fn create(
    v: &OpenVault,
    folder: &str,
    name: &str,
    instructions: String,
    provider_id: Option<String>,
) -> AppResult<Project> {
    let name = name.trim().to_string();
    if name.is_empty() {
        return Err(AppError::InvalidPath("Project name is empty".into()));
    }
    let folder = folder.trim_matches('/').to_string();
    validate_new(&v.root, &v.project_list(), &folder, None)?;
    let stamp = now();
    let project = Project {
        schema_version: 1,
        id: Uuid::new_v4().to_string(),
        name,
        folder,
        instructions,
        provider_id,
        created_at: stamp.clone(),
        updated_at: stamp,
    };
    save(&v.root, &project)?;
    v.reload_projects();
    commit(v, &project)?;
    Ok(project)
}

/// Updates a project's settings. The folder and creation time cannot change here.
pub fn update(v: &OpenVault, project: Project) -> AppResult<Project> {
    let existing = v
        .project_list()
        .into_iter()
        .find(|p| p.id == project.id)
        .ok_or_else(|| AppError::NotFound("Project not found".into()))?;
    let updated = Project {
        folder: existing.folder,
        created_at: existing.created_at,
        updated_at: now(),
        ..project
    };
    save(&v.root, &updated)?;
    v.reload_projects();
    commit(v, &updated)?;
    Ok(updated)
}

/// Removes a project's settings file. The folder and its notes are never touched.
pub fn delete(v: &OpenVault, id: &str) -> AppResult<()> {
    let name = v
        .project_list()
        .into_iter()
        .find(|p| p.id == id)
        .map(|p| p.name)
        .unwrap_or_default();
    remove_file(&v.root, id)?;
    v.reload_projects();
    v.commit(
        CommitReason::new(CommitKind::Project, Some(format!("{name} removed"))),
        Some(&[file_path(id)]),
    )?;
    Ok(())
}

fn commit(v: &OpenVault, project: &Project) -> AppResult<()> {
    v.commit(
        CommitReason::new(
            CommitKind::Project,
            Some(format!("{} updated", project.name)),
        ),
        Some(&[file_path(&project.id)]),
    )?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::vault::open_for_test;

    #[test]
    fn create_update_delete_each_commit_once() {
        let d = tempfile::tempdir().unwrap();
        let v = open_for_test(d.path());
        std::fs::create_dir_all(v.root.join("Work")).unwrap();
        let p = create(&v, "Work", "  Work  ", "rules".into(), None).unwrap();
        assert_eq!(p.name, "Work");
        assert_eq!(v.project_list().len(), 1);
        let mut changed = p.clone();
        changed.folder = "Elsewhere".into();
        changed.instructions = "new".into();
        let u = update(&v, changed).unwrap();
        assert_eq!(u.folder, "Work", "folder is not changed by update");
        assert_eq!(u.instructions, "new");
        delete(&v, &p.id).unwrap();
        assert!(v.project_list().is_empty());
        assert!(v.root.join("Work").is_dir(), "folder is never deleted");
    }

    #[test]
    fn empty_name_and_missing_project_are_rejected() {
        let d = tempfile::tempdir().unwrap();
        let v = open_for_test(d.path());
        std::fs::create_dir_all(v.root.join("Work")).unwrap();
        assert!(create(&v, "Work", "   ", String::new(), None).is_err());
        let ghost = Project {
            schema_version: 1,
            id: "nope".into(),
            name: "x".into(),
            folder: "Work".into(),
            instructions: String::new(),
            provider_id: None,
            created_at: String::new(),
            updated_at: String::new(),
        };
        assert!(matches!(update(&v, ghost), Err(AppError::NotFound(_))));
    }
}
