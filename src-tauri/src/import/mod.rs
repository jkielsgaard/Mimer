//! Import notes from a folder of Markdown files (for example the output of a OneNote exporter).
//!
//! The source folder is only read, never changed. Files are copied into one folder of the vault
//! with their structure kept, nothing is ever overwritten, and the whole import is one commit
//! (after a snapshot commit of anything the user had not saved yet).

use crate::error::{AppError, AppResult};
use crate::git::{CommitKind, CommitReason};
use crate::links::resolve::LinkResolver;
use crate::markdown::links::parse_wikilinks;
use crate::vault::fs_ops::write_atomic;
use crate::vault::tree::{is_markdown, is_visible_file};
use crate::vault::{paths, OpenVault};
use serde::Serialize;
use std::collections::HashSet;
use std::path::{Path, PathBuf};
use tokio_util::sync::CancellationToken;
use ts_rs::TS;

/// Largest single file that is imported (bytes).
pub const MAX_FILE_BYTES: u64 = 50 * 1024 * 1024;

/// Most files one import may contain.
pub const MAX_FILES: usize = 50_000;

/// Deepest folder nesting that is followed.
const MAX_DEPTH: usize = 40;

/// Names Windows does not allow for files.
const RESERVED: &[&str] = &[
    "CON", "PRN", "AUX", "NUL", "COM1", "COM2", "COM3", "COM4", "COM5", "COM6", "COM7", "COM8",
    "COM9", "LPT1", "LPT2", "LPT3", "LPT4", "LPT5", "LPT6", "LPT7", "LPT8", "LPT9",
];

/// Progress sent while an import runs.
#[derive(Debug, Clone, Serialize, TS)]
#[serde(
    tag = "type",
    rename_all = "camelCase",
    rename_all_fields = "camelCase"
)]
#[ts(export)]
pub enum ImportEvent {
    /// Files copied so far, out of all files.
    Progress { done: u32, total: u32 },
}

/// A file that will be copied.
#[derive(Debug, Clone, Serialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct ImportFile {
    /// Path inside the source folder, with `/`.
    pub path: String,
    pub size: u32,
    pub is_note: bool,
}

/// A file or folder that is left out, with the reason.
#[derive(Debug, Clone, Serialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct SkippedFile {
    pub path: String,
    pub reason: String,
}

/// A file whose name had to change.
#[derive(Debug, Clone, Serialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct RenamedFile {
    pub from: String,
    pub to: String,
}

/// What an import would do, found without touching the vault.
#[derive(Debug, Clone, Serialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct ImportPlan {
    /// Name of the source folder.
    pub source_name: String,
    pub files: Vec<ImportFile>,
    pub skipped: Vec<SkippedFile>,
    /// Names that are changed because the system does not allow them.
    pub renamed: Vec<RenamedFile>,
    pub notes: u32,
    pub attachments: u32,
    pub total_bytes: f64,
}

/// What an import did.
#[derive(Debug, Clone, Serialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct ImportReport {
    pub imported_notes: u32,
    pub imported_attachments: u32,
    /// Files whose name was changed, either by the system rules or because the name was taken.
    pub renamed: Vec<RenamedFile>,
    pub skipped: Vec<SkippedFile>,
    /// `[[wiki-links]]` in the imported notes that point at nothing in the vault.
    pub broken_links: u32,
    pub cancelled: bool,
    pub dest_folder: String,
    /// The commit that holds the import, if anything was imported.
    pub commit: Option<String>,
}

/// Makes one file or folder name safe on every platform: forbidden characters become `-`,
/// trailing dots and spaces are removed, and names Windows reserves (`CON`, `NUL` …) get a `_`.
pub fn sanitize_name(name: &str) -> String {
    let replaced: String = name
        .chars()
        .map(|c| {
            if matches!(c, '<' | '>' | ':' | '"' | '/' | '\\' | '|' | '?' | '*') || c.is_control() {
                '-'
            } else {
                c
            }
        })
        .collect();
    let trimmed = replaced.trim().trim_end_matches(['.', ' ']);
    if trimmed.is_empty() {
        return "_".into();
    }
    let (stem, rest) = match trimmed.split_once('.') {
        Some((stem, rest)) => (stem, format!(".{rest}")),
        None => (trimmed, String::new()),
    };
    if RESERVED.contains(&stem.to_uppercase().as_str()) {
        format!("{stem}_{rest}")
    } else {
        trimmed.to_string()
    }
}

/// [`sanitize_name`] for every segment of a `/` separated path.
pub fn sanitize_path(path: &str) -> String {
    path.split('/')
        .map(sanitize_name)
        .collect::<Vec<_>>()
        .join("/")
}

fn walk(dir: &Path, rel: &str, depth: usize, plan: &mut ImportPlan) -> AppResult<()> {
    let mut entries: Vec<_> = std::fs::read_dir(dir)?.flatten().collect();
    entries.sort_by_key(|e| e.file_name());
    for entry in entries {
        let name = entry.file_name().to_string_lossy().into_owned();
        let path = if rel.is_empty() {
            name.clone()
        } else {
            format!("{rel}/{name}")
        };
        let skip = |plan: &mut ImportPlan, reason: &str| {
            plan.skipped.push(SkippedFile {
                path: path.clone(),
                reason: reason.into(),
            });
        };
        let Ok(kind) = entry.file_type() else {
            skip(plan, "could not be read");
            continue;
        };
        if name.starts_with('.') || name == "node_modules" {
            skip(plan, "hidden");
        } else if kind.is_symlink() {
            skip(plan, "symbolic link (not followed)");
        } else if kind.is_dir() {
            if depth >= MAX_DEPTH {
                skip(plan, "folders are nested too deeply");
            } else {
                walk(&entry.path(), &path, depth + 1, plan)?;
            }
        } else if !is_visible_file(&name) {
            skip(plan, "file type is not imported");
        } else {
            let size = entry.metadata().map(|m| m.len()).unwrap_or(0);
            if size > MAX_FILE_BYTES {
                skip(plan, "larger than 50 MB");
                continue;
            }
            if plan.files.len() >= MAX_FILES {
                return Err(AppError::InvalidPath(format!(
                    "The folder has more than {MAX_FILES} files. Import a smaller folder."
                )));
            }
            let is_note = is_markdown(&name);
            let safe = sanitize_path(&path);
            if safe != path {
                plan.renamed.push(RenamedFile {
                    from: path.clone(),
                    to: safe,
                });
            }
            plan.files.push(ImportFile {
                path,
                size: u32::try_from(size).unwrap_or(u32::MAX),
                is_note,
            });
        }
    }
    Ok(())
}

/// Looks through a folder and lists what an import would copy, skip and rename.
pub fn scan(source: &Path) -> AppResult<ImportPlan> {
    let root = std::fs::canonicalize(source)
        .map_err(|_| AppError::NotFound(format!("Folder not found: {}", source.display())))?;
    if !root.is_dir() {
        return Err(AppError::InvalidPath(format!(
            "{} is not a folder",
            root.display()
        )));
    }
    let mut plan = ImportPlan {
        source_name: root
            .file_name()
            .map_or_else(|| "import".into(), |n| n.to_string_lossy().into_owned()),
        files: Vec::new(),
        skipped: Vec::new(),
        renamed: Vec::new(),
        notes: 0,
        attachments: 0,
        total_bytes: 0.0,
    };
    walk(&root, "", 0, &mut plan)?;
    plan.notes = u32::try_from(plan.files.iter().filter(|f| f.is_note).count()).unwrap_or(u32::MAX);
    plan.attachments = u32::try_from(plan.files.len())
        .unwrap_or(u32::MAX)
        .saturating_sub(plan.notes);
    plan.total_bytes = plan.files.iter().map(|f| f64::from(f.size)).sum();
    Ok(plan)
}

/// Fails when the source folder is inside the vault (importing a vault into itself would loop).
pub fn ensure_outside_vault(vault_root: &Path, source: &Path) -> AppResult<()> {
    let source = std::fs::canonicalize(source)
        .map_err(|_| AppError::NotFound(format!("Folder not found: {}", source.display())))?;
    if source.starts_with(vault_root) {
        return Err(AppError::InvalidPath(
            "Choose a folder outside the vault. Notes already in the vault do not need importing."
                .into(),
        ));
    }
    Ok(())
}

/// Checks a destination folder name and returns it cleaned: relative, with `/`, no `..`,
/// no hidden segments.
pub fn clean_dest(dest: &str) -> AppResult<String> {
    let dest = dest.trim().replace('\\', "/");
    let dest = dest.trim_matches('/');
    if dest.is_empty() {
        return Err(AppError::InvalidPath(
            "Enter a folder name for the imported notes".into(),
        ));
    }
    for seg in dest.split('/') {
        if seg.is_empty() || seg == "." || seg == ".." || seg.starts_with('.') {
            return Err(AppError::InvalidPath(format!(
                "“{dest}” is not a valid folder name for the import"
            )));
        }
    }
    Ok(dest
        .split('/')
        .map(sanitize_name)
        .collect::<Vec<_>>()
        .join("/"))
}

/// Creates a vault folder one level at a time, checking every level stays inside the vault.
fn ensure_dir(root: &Path, rel: &str) -> AppResult<()> {
    let mut current = String::new();
    for seg in rel.split('/').filter(|s| !s.is_empty()) {
        let parent_abs = paths::resolve_dir(root, &current, None)?;
        if !current.is_empty() {
            current.push('/');
        }
        current.push_str(seg);
        let abs = parent_abs.join(seg);
        if abs.exists() {
            paths::resolve_dir(root, &current, None)?;
            if !abs.is_dir() {
                return Err(AppError::AlreadyExists(format!(
                    "{current} exists and is not a folder"
                )));
            }
        } else {
            std::fs::create_dir(&abs)?;
        }
    }
    Ok(())
}

/// A vault path that is free: `Name.md` becomes `Name 1.md`, `Name 2.md` … when taken.
/// `used` holds the paths already given out in this import (compared without case).
fn free_path(root: &Path, wanted: &str, used: &mut HashSet<String>) -> String {
    let taken = |p: &str, used: &HashSet<String>| {
        used.contains(&p.to_lowercase()) || root.join(p).symlink_metadata().is_ok()
    };
    let mut candidate = wanted.to_string();
    if taken(&candidate, used) {
        let (stem, ext) = match wanted.rsplit_once('.') {
            Some((s, e)) if !s.ends_with('/') => (s.to_string(), format!(".{e}")),
            _ => (wanted.to_string(), String::new()),
        };
        let mut n = 1;
        loop {
            candidate = format!("{stem} {n}{ext}");
            if !taken(&candidate, used) {
                break;
            }
            n += 1;
        }
    }
    used.insert(candidate.to_lowercase());
    candidate
}

/// How many `[[wiki-links]]` in `notes` (`(path, content)`) point at nothing.
pub fn count_broken_links(notes: &[(String, String)], resolver: &LinkResolver) -> u32 {
    let n = notes
        .iter()
        .flat_map(|(_, content)| parse_wikilinks(content))
        .filter(|l| resolver.resolve(&l.target).is_none())
        .count();
    u32::try_from(n).unwrap_or(u32::MAX)
}

/// Copies the notes and attachments of `source` into `dest_folder` of the vault.
///
/// A snapshot commit comes first, so anything unsaved is recoverable. Files are written
/// atomically and never overwrite an existing file. `cancel` stops after the current file; what
/// was copied stays and is committed. `progress` gets `(done, total)` after every file.
pub fn run(
    vault: &OpenVault,
    source: &Path,
    dest_folder: &str,
    cancel: &CancellationToken,
    progress: &dyn Fn(u32, u32),
) -> AppResult<ImportReport> {
    ensure_outside_vault(&vault.root, source)?;
    let dest = clean_dest(dest_folder)?;
    let plan = scan(source)?;
    let source_root = std::fs::canonicalize(source)?;

    vault.commit(
        CommitReason::new(
            CommitKind::SnapshotBeforeImport,
            format!("\"{}\"", plan.source_name),
        ),
        None,
    )?;
    ensure_dir(&vault.root, &dest)?;

    let total = u32::try_from(plan.files.len()).unwrap_or(u32::MAX);
    let mut report = ImportReport {
        imported_notes: 0,
        imported_attachments: 0,
        renamed: plan.renamed.clone(),
        skipped: plan.skipped.clone(),
        broken_links: 0,
        cancelled: false,
        dest_folder: dest.clone(),
        commit: None,
    };
    let mut used = HashSet::new();
    let mut notes: Vec<(String, String)> = Vec::new();

    for (done, file) in plan.files.iter().enumerate() {
        if cancel.is_cancelled() {
            report.cancelled = true;
            break;
        }
        let safe = sanitize_path(&file.path);
        let target = free_path(&vault.root, &format!("{dest}/{safe}"), &mut used);
        let src: PathBuf = source_root.join(&file.path);
        let copied = copy_one(&vault.root, &src, &target);
        match copied {
            Ok(bytes) => {
                if target != format!("{dest}/{safe}") {
                    report.renamed.push(RenamedFile {
                        from: file.path.clone(),
                        to: target.clone(),
                    });
                }
                if file.is_note {
                    report.imported_notes += 1;
                    notes.push((target, String::from_utf8_lossy(&bytes).into_owned()));
                } else {
                    report.imported_attachments += 1;
                }
            }
            Err(e) => report.skipped.push(SkippedFile {
                path: file.path.clone(),
                reason: format!("could not be copied ({e})"),
            }),
        }
        progress(u32::try_from(done + 1).unwrap_or(u32::MAX), total);
    }

    vault.refresh_files();
    report.broken_links = count_broken_links(&notes, &vault.resolver());
    if let Err(e) = vault.sync_index() {
        tracing::warn!("index sync after import failed: {e}");
    }
    vault.touch();

    let suffix = if report.cancelled { " (cancelled)" } else { "" };
    report.commit = vault.commit(
        CommitReason::new(
            CommitKind::Import,
            format!(
                "{} notes from \"{}\"{suffix}",
                report.imported_notes, plan.source_name
            ),
        ),
        None,
    )?;
    Ok(report)
}

/// Copies one file into the vault and returns what was written.
fn copy_one(vault_root: &Path, src: &Path, target: &str) -> AppResult<Vec<u8>> {
    // The file could have been replaced by a link since the scan; never follow one.
    if src.symlink_metadata()?.file_type().is_symlink() {
        return Err(AppError::InvalidPath("symbolic link".into()));
    }
    let bytes = std::fs::read(src)?;
    if let Some((parent, _)) = target.rsplit_once('/') {
        ensure_dir(vault_root, parent)?;
    }
    let abs = paths::resolve(vault_root, target, None)?;
    write_atomic(&abs, &bytes)?;
    Ok(bytes)
}

#[cfg(test)]
mod tests;
