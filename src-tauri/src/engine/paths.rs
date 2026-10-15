//! Where the built-in AI keeps its files.
//!
//! One folder, `mimer-ai`, with `engine/` (the program), `models/` (the model files) and `logs/`.
//! On Windows it sits next to the installed program, so uninstalling Mimer can remove it. Where
//! that is not possible (Linux packages, `pnpm tauri dev`, a program folder that cannot be written
//! to) it is in the user's own data folder.

use super::catalog::ENGINE_BUILD;
use super::hardware::Backend;
use crate::error::{AppError, AppResult};
use std::path::{Path, PathBuf};
use tauri::{AppHandle, Manager, Runtime};

/// The name of the folder.
pub const FOLDER: &str = "mimer-ai";

/// The folders of the built-in AI.
#[derive(Debug, Clone)]
pub struct Dirs {
    pub root: PathBuf,
    /// One sub-folder per engine build and graphics backend.
    pub engine: PathBuf,
    pub models: PathBuf,
    pub logs: PathBuf,
    /// Why the files are not next to the program, when that was expected.
    pub note: Option<String>,
}

/// True when files can be created in `dir` (it is made if it is missing).
pub fn is_writable(dir: &Path) -> bool {
    if std::fs::create_dir_all(dir).is_err() {
        return false;
    }
    let probe = dir.join(".write-test");
    let ok = std::fs::write(&probe, b"x").is_ok();
    let _ = std::fs::remove_file(probe);
    ok
}

/// Chooses the root folder: inside `install_dir` when there is one and it can be written to,
/// otherwise inside `data_dir`.
pub fn choose_root(install_dir: Option<&Path>, data_dir: &Path) -> (PathBuf, Option<String>) {
    if let Some(install) = install_dir {
        let beside = install.join(FOLDER);
        if is_writable(&beside) {
            return (beside, None);
        }
        return (
            data_dir.join(FOLDER),
            Some(format!(
                "Mimer cannot write to its program folder ({}), so the built-in AI is kept in your user data folder instead. It is not removed when Mimer is uninstalled: use Remove files first.",
                install.display()
            )),
        );
    }
    (data_dir.join(FOLDER), None)
}

/// True when `exe` lives in a Microsoft Store (MSIX) package folder (`...\WindowsApps\...`).
/// Such a program folder is read-only, and the package's data is removed when the app is.
pub fn is_packaged_path(exe: &Path) -> bool {
    // Split on both kinds of slash so a Windows path is recognised wherever this runs.
    exe.to_string_lossy()
        .split(['/', '\\'])
        .any(|part| part.eq_ignore_ascii_case("WindowsApps"))
}

/// True when Mimer runs as a Microsoft Store package.
pub fn is_packaged() -> bool {
    cfg!(windows)
        && std::env::current_exe()
            .ok()
            .is_some_and(|p| is_packaged_path(&p))
}

/// The folders for this computer. Does not create them.
pub fn dirs<R: Runtime>(app: &AppHandle<R>) -> AppResult<Dirs> {
    let data = app
        .path()
        .app_data_dir()
        .map_err(|e| AppError::Io(format!("Cannot find the user data folder: {e}")))?;
    // Only a release build on Windows lives in its own program folder. A Store package does not:
    // its program folder is read-only, so the data folder is used, and it goes with the app.
    let install = if cfg!(windows) && !cfg!(debug_assertions) && !is_packaged() {
        std::env::current_exe()
            .ok()
            .and_then(|p| p.parent().map(Path::to_path_buf))
    } else {
        None
    };
    let (root, note) = choose_root(install.as_deref(), &data);
    Ok(Dirs {
        engine: root.join("engine"),
        models: root.join("models"),
        logs: root.join("logs"),
        root,
        note,
    })
}

/// The folder an engine build is unpacked into.
pub fn engine_dir(dirs: &Dirs, backend: Backend) -> PathBuf {
    dirs.engine.join(format!("{ENGINE_BUILD}-{}", backend.id()))
}

/// The name of the engine program.
pub const SERVER_NAME: &str = if cfg!(windows) {
    "llama-server.exe"
} else {
    "llama-server"
};

/// The full path of the engine program of a build.
pub fn server_path(dirs: &Dirs, backend: Backend) -> PathBuf {
    engine_dir(dirs, backend).join(SERVER_NAME)
}

/// The file that marks an engine build as completely installed and checked.
pub fn ready_marker(dirs: &Dirs, backend: Backend) -> PathBuf {
    engine_dir(dirs, backend).join("mimer-engine.ok")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn the_program_folder_is_used_when_it_can_be_written() {
        let install = tempfile::tempdir().unwrap();
        let data = tempfile::tempdir().unwrap();
        let (root, note) = choose_root(Some(install.path()), data.path());
        assert_eq!(root, install.path().join(FOLDER));
        assert!(note.is_none());
        assert!(root.is_dir());
    }

    #[test]
    fn a_store_package_folder_is_recognised() {
        assert!(is_packaged_path(Path::new(
            r"C:\Program Files\WindowsApps\Jkielsgaard.Mimer_0.8.1.0_x64__abc\mimer.exe"
        )));
        assert!(is_packaged_path(Path::new(
            "/x/windowsapps/Mimer/mimer.exe"
        )));
        assert!(!is_packaged_path(Path::new(
            r"C:\Users\me\AppData\Local\Mimer\mimer.exe"
        )));
        assert!(!is_packaged_path(Path::new("/usr/bin/mimer")));
    }

    #[test]
    fn the_data_folder_is_used_without_an_install_folder() {
        let data = tempfile::tempdir().unwrap();
        let (root, note) = choose_root(None, data.path());
        assert_eq!(root, data.path().join(FOLDER));
        assert!(note.is_none());
    }

    #[test]
    fn an_unwritable_program_folder_falls_back_and_says_why() {
        let data = tempfile::tempdir().unwrap();
        // A file where the folder should be makes the folder impossible to create.
        let blocker = tempfile::NamedTempFile::new().unwrap();
        let (root, note) = choose_root(Some(blocker.path()), data.path());
        assert_eq!(root, data.path().join(FOLDER));
        let note = note.unwrap();
        assert!(note.contains("cannot write"));
        assert!(note.contains("Remove files"));
    }

    #[test]
    fn engine_folders_are_named_after_build_and_backend() {
        let dirs = Dirs {
            root: "/r".into(),
            engine: "/r/engine".into(),
            models: "/r/models".into(),
            logs: "/r/logs".into(),
            note: None,
        };
        let d = engine_dir(&dirs, Backend::Vulkan);
        assert_eq!(d, PathBuf::from(format!("/r/engine/{ENGINE_BUILD}-vulkan")));
        assert!(server_path(&dirs, Backend::Cpu).ends_with(SERVER_NAME));
        assert!(ready_marker(&dirs, Backend::Cpu).ends_with("mimer-engine.ok"));
    }
}
