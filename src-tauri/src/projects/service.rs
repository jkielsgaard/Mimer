//! Project operations used by the Tauri commands: validation, saving and Git commits.

use super::{file_path, now, remove_file, save, Project};
use crate::error::{AppError, AppResult};
use crate::git::{CommitKind, CommitReason};
use crate::vault::{fs_ops, OpenVault};
use uuid::Uuid;

/// Fails when another project already has this name (ignoring upper/lower case): two projects
/// with the same name look the same under Projects.
fn ensure_unique_name(projects: &[Project], name: &str, except_id: Option<&str>) -> AppResult<()> {
    let wanted = name.trim().to_lowercase();
    match projects
        .iter()
        .find(|p| Some(p.id.as_str()) != except_id && p.name.trim().to_lowercase() == wanted)
    {
        Some(p) => Err(AppError::AlreadyExists(format!(
            "A project called “{}” already exists (folder {}).",
            p.name, p.folder
        ))),
        None => Ok(()),
    }
}

/// Creates a project: a new folder called `name` in the vault root, and the project for it.
/// A project is never made from an existing folder, and never inside another folder: the name
/// must not already be used by anything in the root (a folder, a note or another project).
pub fn create(
    v: &OpenVault,
    name: &str,
    instructions: String,
    provider_id: Option<String>,
) -> AppResult<Project> {
    let name = name.trim().to_string();
    ensure_unique_name(&v.project_list(), &name, None)?;
    // Creates the folder and refuses a name that is taken or not allowed in a folder name.
    let folder = fs_ops::create_folder(&v.root, "", &name)?;
    let stamp = now();
    let project = Project {
        schema_version: 1,
        id: Uuid::new_v4().to_string(),
        name,
        folder: folder.clone(),
        instructions,
        provider_id,
        local_only: false,
        created_at: stamp.clone(),
        updated_at: stamp,
    };
    let saved = save(&v.root, &project).and_then(|()| {
        v.reload_projects();
        commit(v, &project)
    });
    if let Err(e) = saved {
        // Do not leave an empty folder behind for a project that was not made.
        let _ = std::fs::remove_dir(v.root.join(&folder));
        return Err(e);
    }
    v.refresh_files();
    Ok(project)
}

/// Updates a project's settings. The folder and creation time cannot change here.
pub fn update(v: &OpenVault, project: Project) -> AppResult<Project> {
    let existing = v
        .project_list()
        .into_iter()
        .find(|p| p.id == project.id)
        .ok_or_else(|| AppError::NotFound("Project not found".into()))?;
    ensure_unique_name(&v.project_list(), &project.name, Some(&project.id))?;
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
        let p = create(&v, "  Work  ", "rules".into(), None).unwrap();
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
        assert!(create(&v, "   ", String::new(), None).is_err());
        let ghost = Project {
            schema_version: 1,
            id: "nope".into(),
            name: "x".into(),
            folder: "Work".into(),
            instructions: String::new(),
            provider_id: None,
            local_only: false,
            created_at: String::new(),
            updated_at: String::new(),
        };
        assert!(matches!(update(&v, ghost), Err(AppError::NotFound(_))));
    }

    #[test]
    fn a_project_is_a_new_folder_in_the_root_named_like_the_project() {
        let d = tempfile::tempdir().unwrap();
        let v = open_for_test(d.path());
        let p = create(&v, "Docs", String::new(), None).unwrap();
        assert_eq!(p.folder, "Docs");
        assert!(v.root.join("Docs").is_dir(), "the folder is made on disk");
        assert!(v.root.join(super::file_path(&p.id)).is_file());
    }

    #[test]
    fn a_project_cannot_be_made_with_a_name_that_is_already_used_in_the_root() {
        let d = tempfile::tempdir().unwrap();
        let v = open_for_test(d.path());
        std::fs::create_dir_all(v.root.join("Test")).unwrap();
        std::fs::write(v.root.join("Plan.md"), "x").unwrap();
        for name in ["Test", "test", "Plan"] {
            let err = create(&v, name, String::new(), None).unwrap_err();
            assert!(matches!(err, AppError::AlreadyExists(_)), "{name}: {err}");
        }
        assert!(v.project_list().is_empty(), "nothing was made");
        assert!(!v.root.join("test").exists() || v.root.join("Test").exists());
        // A name with a slash would put the project inside a folder.
        assert!(create(&v, "Test/Inner", String::new(), None).is_err());
        assert!(create(&v, "../out", String::new(), None).is_err());
        assert!(!v.root.join("Test/Inner").exists());
    }

    #[test]
    fn two_projects_cannot_have_the_same_name() {
        let d = tempfile::tempdir().unwrap();
        let v = open_for_test(d.path());
        let first = create(&v, "Docs", String::new(), None).unwrap();
        let err = create(&v, " docs ", String::new(), None).unwrap_err();
        assert!(matches!(err, AppError::AlreadyExists(_)));
        let other = create(&v, "Home", String::new(), None).unwrap();
        let mut clash = other.clone();
        clash.name = "DOCS".into();
        assert!(matches!(update(&v, clash), Err(AppError::AlreadyExists(_))));
        // Saving a project under its own name is fine.
        assert!(update(&v, first).is_ok());
    }
}
