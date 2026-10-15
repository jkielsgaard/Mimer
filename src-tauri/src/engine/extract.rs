//! Unpacks a downloaded engine archive (`.zip` on Windows, `.tar.gz` on Linux) into a folder.
//!
//! Paths in the archive are checked: nothing can be written outside the target folder. A single
//! top-level folder in the archive is removed, so the program ends up directly in the target.

use crate::error::{AppError, AppResult};
use std::io::Read;
use std::path::{Component, Path, PathBuf};

fn damaged(archive: &Path, e: impl std::fmt::Display) -> AppError {
    AppError::Io(format!(
        "Could not unpack {}: {e}. The download may be damaged: delete it with Remove files and download again.",
        archive.file_name().unwrap_or_default().to_string_lossy()
    ))
}

/// The path inside the target folder for an archive entry, or `None` when the entry is only the
/// top-level folder itself. Fails for paths that would leave the target folder.
fn target_path(
    dest: &Path,
    entry: &Path,
    strip: Option<&Path>,
    archive: &Path,
) -> AppResult<Option<PathBuf>> {
    let relative = match strip {
        Some(prefix) => entry.strip_prefix(prefix).unwrap_or(entry),
        None => entry,
    };
    let mut out = dest.to_path_buf();
    let mut any = false;
    for part in relative.components() {
        match part {
            Component::Normal(p) => {
                out.push(p);
                any = true;
            }
            Component::CurDir => {}
            _ => {
                return Err(damaged(
                    archive,
                    format!("it contains an unsafe path ({})", entry.display()),
                ))
            }
        }
    }
    Ok(any.then_some(out))
}

/// The single top-level folder all entries share, if there is one.
fn common_top(paths: &[PathBuf]) -> Option<PathBuf> {
    let first = paths.first()?.components().find_map(|c| match c {
        Component::Normal(p) => Some(p.to_os_string()),
        _ => None,
    })?;
    let all_inside = paths.iter().all(|p| {
        let mut parts = p.components().filter(|c| !matches!(c, Component::CurDir));
        parts.next().map(|c| c.as_os_str() == first).unwrap_or(false)
            // A file directly in the root would mean there is no common folder.
            && (p.components().count() > 1 || p.to_string_lossy().ends_with('/'))
    });
    all_inside.then(|| PathBuf::from(first))
}

#[cfg(unix)]
fn set_mode(path: &Path, mode: u32) {
    use std::os::unix::fs::PermissionsExt;
    // Keep the executable bits, and make sure the owner can read and write.
    let _ = std::fs::set_permissions(
        path,
        std::fs::Permissions::from_mode((mode & 0o777) | 0o600),
    );
}

#[cfg(not(unix))]
fn set_mode(_path: &Path, _mode: u32) {}

fn extract_zip(archive: &Path, dest: &Path) -> AppResult<()> {
    let file = std::fs::File::open(archive)?;
    let mut zip = zip::ZipArchive::new(file).map_err(|e| damaged(archive, e))?;
    let names: Vec<PathBuf> = (0..zip.len())
        .filter_map(|i| {
            let f = zip.by_index_raw(i).ok()?;
            let name = f.name().ok()?;
            Some(PathBuf::from(name.as_ref()))
        })
        .collect();
    let strip = common_top(&names);
    for i in 0..zip.len() {
        let mut entry = zip.by_index(i).map_err(|e| damaged(archive, e))?;
        let name = PathBuf::from(entry.name().map_err(|e| damaged(archive, e))?.as_ref());
        let Some(out) = target_path(dest, &name, strip.as_deref(), archive)? else {
            continue;
        };
        if entry.is_dir() {
            std::fs::create_dir_all(&out)?;
            continue;
        }
        if let Some(parent) = out.parent() {
            std::fs::create_dir_all(parent)?;
        }
        let mut f = std::fs::File::create(&out)?;
        std::io::copy(&mut entry, &mut f).map_err(|e| damaged(archive, e))?;
        if let Some(mode) = entry.unix_mode() {
            set_mode(&out, mode);
        }
    }
    Ok(())
}

fn tar_entries(archive: &Path) -> AppResult<tar::Archive<flate2::read::GzDecoder<std::fs::File>>> {
    let file = std::fs::File::open(archive)?;
    Ok(tar::Archive::new(flate2::read::GzDecoder::new(file)))
}

fn extract_tar_gz(archive: &Path, dest: &Path) -> AppResult<()> {
    let mut names = Vec::new();
    for e in tar_entries(archive)?
        .entries()
        .map_err(|e| damaged(archive, e))?
    {
        let e = e.map_err(|e| damaged(archive, e))?;
        let mut p = e.path().map_err(|e| damaged(archive, e))?.to_path_buf();
        if e.header().entry_type().is_dir() {
            p.push("");
        }
        names.push(p);
    }
    let strip = common_top(&names);
    for e in tar_entries(archive)?
        .entries()
        .map_err(|e| damaged(archive, e))?
    {
        let mut entry = e.map_err(|e| damaged(archive, e))?;
        let name = entry.path().map_err(|e| damaged(archive, e))?.to_path_buf();
        let Some(out) = target_path(dest, &name, strip.as_deref(), archive)? else {
            continue;
        };
        let kind = entry.header().entry_type();
        if kind.is_dir() {
            std::fs::create_dir_all(&out)?;
        } else if kind.is_symlink() {
            #[cfg(unix)]
            {
                let target = entry
                    .link_name()
                    .map_err(|e| damaged(archive, e))?
                    .map(|t| t.to_path_buf())
                    .unwrap_or_default();
                // Links point at a sibling file; anything else is refused.
                if target
                    .components()
                    .any(|c| !matches!(c, Component::Normal(_)))
                {
                    return Err(damaged(archive, "it contains an unsafe link"));
                }
                if let Some(parent) = out.parent() {
                    std::fs::create_dir_all(parent)?;
                }
                let _ = std::fs::remove_file(&out);
                std::os::unix::fs::symlink(&target, &out)?;
            }
        } else if kind.is_file() {
            if let Some(parent) = out.parent() {
                std::fs::create_dir_all(parent)?;
            }
            let mode = entry.header().mode().unwrap_or(0o644);
            let mut f = std::fs::File::create(&out)?;
            std::io::copy(&mut entry.by_ref().take(u64::MAX), &mut f)
                .map_err(|e| damaged(archive, e))?;
            set_mode(&out, mode);
        }
    }
    Ok(())
}

/// Unpacks `archive` into `dest` (created when missing). Merging several archives into the same
/// folder is fine: that is how the CUDA runtime is added to the program.
pub fn extract_archive(archive: &Path, dest: &Path) -> AppResult<()> {
    std::fs::create_dir_all(dest)?;
    let name = archive.to_string_lossy().to_lowercase();
    if name.ends_with(".zip") {
        extract_zip(archive, dest)
    } else if name.ends_with(".tar.gz") || name.ends_with(".tgz") {
        extract_tar_gz(archive, dest)
    } else {
        Err(AppError::Io(format!(
            "Unknown archive type: {}",
            archive.display()
        )))
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Write;

    fn make_zip(path: &Path, files: &[(&str, &[u8])]) {
        let mut w = zip::ZipWriter::new(std::fs::File::create(path).unwrap());
        let opts = zip::write::SimpleFileOptions::default().unix_permissions(0o755);
        for (name, body) in files {
            w.start_file(*name, opts).unwrap();
            w.write_all(body).unwrap();
        }
        w.finish().unwrap();
    }

    fn make_tar_gz(path: &Path, files: &[(&str, &[u8])], links: &[(&str, &str)]) {
        let gz = flate2::write::GzEncoder::new(
            std::fs::File::create(path).unwrap(),
            flate2::Compression::fast(),
        );
        let mut b = tar::Builder::new(gz);
        for (name, body) in files {
            let mut h = tar::Header::new_gnu();
            h.set_size(body.len() as u64);
            h.set_mode(0o755);
            h.set_cksum();
            b.append_data(&mut h, name, *body).unwrap();
        }
        for (name, target) in links {
            let mut h = tar::Header::new_gnu();
            h.set_entry_type(tar::EntryType::Symlink);
            h.set_size(0);
            h.set_mode(0o777);
            b.append_link(&mut h, name, target).unwrap();
        }
        b.into_inner().unwrap().finish().unwrap();
    }

    #[test]
    fn a_zip_with_a_top_folder_is_unpacked_flat() {
        let d = tempfile::tempdir().unwrap();
        let zip_path = d.path().join("a.zip");
        make_zip(
            &zip_path,
            &[
                ("build/llama-server.exe", b"exe"),
                ("build/ggml.dll", b"dll"),
            ],
        );
        let out = d.path().join("out");
        extract_archive(&zip_path, &out).unwrap();
        assert_eq!(std::fs::read(out.join("llama-server.exe")).unwrap(), b"exe");
        assert_eq!(std::fs::read(out.join("ggml.dll")).unwrap(), b"dll");
    }

    #[test]
    fn a_zip_without_a_top_folder_keeps_its_layout() {
        let d = tempfile::tempdir().unwrap();
        let zip_path = d.path().join("a.zip");
        make_zip(
            &zip_path,
            &[("llama-server.exe", b"exe"), ("lib/x.dll", b"x")],
        );
        let out = d.path().join("out");
        extract_archive(&zip_path, &out).unwrap();
        assert!(out.join("llama-server.exe").is_file());
        assert!(out.join("lib/x.dll").is_file());
    }

    #[test]
    fn two_archives_can_be_merged_into_one_folder() {
        let d = tempfile::tempdir().unwrap();
        let (a, b) = (d.path().join("a.zip"), d.path().join("b.zip"));
        make_zip(&a, &[("llama-server.exe", b"exe")]);
        make_zip(&b, &[("cudart64_12.dll", b"cuda")]);
        let out = d.path().join("out");
        extract_archive(&a, &out).unwrap();
        extract_archive(&b, &out).unwrap();
        assert!(out.join("llama-server.exe").is_file());
        assert!(out.join("cudart64_12.dll").is_file());
    }

    #[test]
    fn paths_that_leave_the_folder_are_refused() {
        let d = tempfile::tempdir().unwrap();
        let zip_path = d.path().join("bad.zip");
        make_zip(&zip_path, &[("../evil.txt", b"x")]);
        let out = d.path().join("out");
        let err = extract_archive(&zip_path, &out).unwrap_err().to_string();
        assert!(err.contains("unsafe path"), "{err}");
        assert!(!d.path().join("evil.txt").exists());
    }

    #[test]
    fn a_tar_gz_is_unpacked_flat_with_links_and_executable_files() {
        let d = tempfile::tempdir().unwrap();
        let tgz = d.path().join("a.tar.gz");
        make_tar_gz(
            &tgz,
            &[
                ("llama-b1/llama-server", b"bin"),
                ("llama-b1/libggml.so.0.1", b"lib"),
            ],
            &[("llama-b1/libggml.so.0", "libggml.so.0.1")],
        );
        let out = d.path().join("out");
        extract_archive(&tgz, &out).unwrap();
        assert_eq!(std::fs::read(out.join("llama-server")).unwrap(), b"bin");
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            let mode = std::fs::metadata(out.join("llama-server"))
                .unwrap()
                .permissions()
                .mode();
            assert!(mode & 0o111 != 0, "the program must stay executable");
            assert_eq!(std::fs::read(out.join("libggml.so.0")).unwrap(), b"lib");
        }
    }

    #[test]
    fn an_unknown_or_damaged_archive_gives_a_clear_error() {
        let d = tempfile::tempdir().unwrap();
        let bad = d.path().join("a.zip");
        std::fs::write(&bad, b"not a zip").unwrap();
        let err = extract_archive(&bad, &d.path().join("o"))
            .unwrap_err()
            .to_string();
        assert!(err.contains("may be damaged"), "{err}");
        let other = d.path().join("a.rar");
        std::fs::write(&other, b"x").unwrap();
        assert!(extract_archive(&other, &d.path().join("o2")).is_err());
    }

    #[test]
    fn common_top_needs_every_entry_inside_one_folder() {
        let p = |s: &str| PathBuf::from(s);
        assert_eq!(common_top(&[p("a/x"), p("a/y/z")]), Some(p("a")));
        assert_eq!(common_top(&[p("a/x"), p("b/y")]), None);
        assert_eq!(common_top(&[p("x")]), None);
        assert_eq!(common_top(&[]), None);
    }
}
