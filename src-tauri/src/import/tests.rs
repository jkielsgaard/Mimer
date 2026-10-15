//! Unit tests for the folder import.

use super::*;
use crate::vault::open_for_test;
use std::cell::Cell;

/// A source folder shaped like an exporter's output, and an empty vault.
struct Setup {
    _tmp: tempfile::TempDir,
    source: PathBuf,
    vault: OpenVault,
}

fn write(path: &Path, content: &str) {
    std::fs::create_dir_all(path.parent().unwrap()).unwrap();
    std::fs::write(path, content).unwrap();
}

fn setup() -> Setup {
    let tmp = tempfile::tempdir().unwrap();
    let source = tmp.path().join("OneNote export");
    write(
        &source.join("Work/Plan.md"),
        "# Plan\nSee [[Policy]] and [[Missing]]",
    );
    write(&source.join("Work/Policy.md"), "# Policy");
    write(&source.join("Home.md"), "# Home");
    write(&source.join("Work/img/pic.png"), "png-bytes");
    write(&source.join(".hidden/secret.md"), "secret");
    write(&source.join("tool.exe"), "binary");
    let vault_dir = tmp.path().join("vault");
    std::fs::create_dir_all(&vault_dir).unwrap();
    let vault = open_for_test(&vault_dir);
    Setup {
        _tmp: tmp,
        source,
        vault,
    }
}

fn head_message(v: &OpenVault) -> String {
    v.with_repo(|r| {
        Ok(r.head()?
            .peel_to_commit()?
            .message()
            .unwrap_or_default()
            .to_string())
    })
    .unwrap()
}

fn commit_count(v: &OpenVault) -> usize {
    v.with_repo(|r| {
        let mut w = r.revwalk()?;
        w.push_head()?;
        Ok(w.count())
    })
    .unwrap()
}

fn go(s: &Setup, dest: &str) -> ImportReport {
    run(
        &s.vault,
        &s.source,
        dest,
        &CancellationToken::new(),
        &|_, _| {},
    )
    .unwrap()
}

/// Every file under `dir` with its content, for before/after comparison.
fn snapshot(dir: &Path) -> Vec<(String, Vec<u8>)> {
    let mut out = Vec::new();
    let mut stack = vec![dir.to_path_buf()];
    while let Some(d) = stack.pop() {
        for e in std::fs::read_dir(&d).unwrap().flatten() {
            let p = e.path();
            if p.is_dir() {
                stack.push(p);
            } else {
                let rel = p.strip_prefix(dir).unwrap().to_string_lossy().into_owned();
                out.push((rel, std::fs::read(&p).unwrap()));
            }
        }
    }
    out.sort();
    out
}

#[test]
fn sanitize_replaces_forbidden_characters_and_trims() {
    assert_eq!(sanitize_name("Plan: Q1?"), "Plan- Q1-");
    assert_eq!(sanitize_name("a<b>c|d*e\"f\\g"), "a-b-c-d-e-f-g");
    assert_eq!(sanitize_name("Notes. . "), "Notes");
    assert_eq!(sanitize_name("  spaced.md"), "spaced.md");
    assert_eq!(sanitize_name("Ål æble.md"), "Ål æble.md");
    assert_eq!(sanitize_name("tab\there.md"), "tab-here.md");
}

#[test]
fn sanitize_handles_reserved_and_empty_names() {
    assert_eq!(sanitize_name("CON"), "CON_");
    assert_eq!(sanitize_name("nul.md"), "nul_.md");
    assert_eq!(sanitize_name("Com1.txt"), "Com1_.txt");
    assert_eq!(sanitize_name("console.md"), "console.md");
    assert_eq!(sanitize_name("..."), "_");
    assert_eq!(sanitize_name(""), "_");
    assert_eq!(sanitize_path("Work/PRN/a:b.md"), "Work/PRN_/a-b.md");
}

#[test]
fn scan_lists_notes_and_attachments_and_skips_the_rest() {
    let s = setup();
    let plan = scan(&s.source).unwrap();
    assert_eq!(plan.source_name, "OneNote export");
    assert_eq!(plan.notes, 3);
    assert_eq!(plan.attachments, 1);
    let paths: Vec<&str> = plan.files.iter().map(|f| f.path.as_str()).collect();
    assert_eq!(
        paths,
        vec![
            "Home.md",
            "Work/Plan.md",
            "Work/Policy.md",
            "Work/img/pic.png"
        ]
    );
    let skipped: Vec<(&str, &str)> = plan
        .skipped
        .iter()
        .map(|f| (f.path.as_str(), f.reason.as_str()))
        .collect();
    assert!(skipped.contains(&(".hidden", "hidden")));
    assert!(skipped.contains(&("tool.exe", "file type is not imported")));
    assert!(plan.total_bytes > 0.0);
}

#[test]
fn scan_reports_names_that_will_change() {
    let s = setup();
    write(&s.source.join("Bad:name?.md"), "x");
    let plan = scan(&s.source).unwrap();
    assert!(plan
        .renamed
        .iter()
        .any(|r| r.from == "Bad:name?.md" && r.to == "Bad-name-.md"));
}

#[test]
fn scan_skips_files_over_the_size_limit() {
    let s = setup();
    let big = std::fs::File::create(s.source.join("Huge.md")).unwrap();
    big.set_len(MAX_FILE_BYTES + 1).unwrap();
    let plan = scan(&s.source).unwrap();
    assert!(plan.files.iter().all(|f| f.path != "Huge.md"));
    assert!(plan
        .skipped
        .iter()
        .any(|f| f.path == "Huge.md" && f.reason.contains("50 MB")));
}

#[cfg(unix)]
#[test]
fn scan_does_not_follow_symbolic_links() {
    let s = setup();
    let outside = s.source.parent().unwrap().join("outside.md");
    write(&outside, "outside");
    std::os::unix::fs::symlink(&outside, s.source.join("link.md")).unwrap();
    std::os::unix::fs::symlink(s.source.parent().unwrap(), s.source.join("loop")).unwrap();
    let plan = scan(&s.source).unwrap();
    assert!(plan.files.iter().all(|f| f.path != "link.md"));
    assert!(plan.skipped.iter().any(|f| f.path == "link.md"));
    assert!(plan.skipped.iter().any(|f| f.path == "loop"));
}

#[test]
fn scan_rejects_a_missing_or_non_folder_source() {
    let s = setup();
    assert!(scan(&s.source.join("nope")).is_err());
    assert!(scan(&s.source.join("Home.md")).is_err());
}

#[test]
fn import_keeps_the_structure_and_commits_once() {
    let s = setup();
    let before = commit_count(&s.vault);
    let report = go(&s, "Imported/OneNote");
    assert_eq!(report.imported_notes, 3);
    assert_eq!(report.imported_attachments, 1);
    assert_eq!(report.dest_folder, "Imported/OneNote");
    let root = &s.vault.root;
    assert_eq!(
        std::fs::read_to_string(root.join("Imported/OneNote/Work/Plan.md")).unwrap(),
        "# Plan\nSee [[Policy]] and [[Missing]]"
    );
    assert!(root.join("Imported/OneNote/Work/img/pic.png").is_file());
    assert!(!root.join("Imported/OneNote/.hidden").exists());
    assert!(!root.join("Imported/OneNote/tool.exe").exists());
    assert_eq!(commit_count(&s.vault), before + 1, "exactly one new commit");
    assert_eq!(
        head_message(&s.vault).trim(),
        "Import: 3 notes from \"OneNote export\""
    );
    assert!(report.commit.is_some());
}

#[test]
fn unsaved_work_in_the_vault_gets_its_own_snapshot_commit_first() {
    let s = setup();
    write(&s.vault.root.join("Draft.md"), "unsaved draft");
    let before = commit_count(&s.vault);
    go(&s, "Imported");
    assert_eq!(commit_count(&s.vault), before + 2);
    let log = s
        .vault
        .with_repo(|r| {
            let mut w = r.revwalk()?;
            w.push_head()?;
            let mut msgs = Vec::new();
            for id in w.take(2).flatten() {
                msgs.push(
                    r.find_commit(id)?
                        .message()
                        .unwrap_or_default()
                        .trim()
                        .to_string(),
                );
            }
            Ok(msgs)
        })
        .unwrap();
    assert!(log[0].starts_with("Import:"));
    assert!(log[1].starts_with("Snapshot before import"));
}

#[test]
fn nothing_is_overwritten_a_taken_name_gets_a_number() {
    let s = setup();
    write(&s.vault.root.join("Imported/Home.md"), "my own home note");
    let report = go(&s, "Imported");
    assert_eq!(
        std::fs::read_to_string(s.vault.root.join("Imported/Home.md")).unwrap(),
        "my own home note"
    );
    assert_eq!(
        std::fs::read_to_string(s.vault.root.join("Imported/Home 1.md")).unwrap(),
        "# Home"
    );
    assert!(report
        .renamed
        .iter()
        .any(|r| r.from == "Home.md" && r.to == "Imported/Home 1.md"));
}

#[test]
fn importing_twice_adds_copies_instead_of_overwriting() {
    let s = setup();
    go(&s, "Imported");
    let second = go(&s, "Imported");
    assert_eq!(second.imported_notes, 3);
    assert!(s.vault.root.join("Imported/Home 1.md").is_file());
    assert!(s.vault.root.join("Imported/Home.md").is_file());
}

#[test]
fn names_that_become_equal_after_cleaning_do_not_clash() {
    let s = setup();
    write(&s.source.join("a:b.md"), "colon");
    write(&s.source.join("a-b.md"), "dash");
    go(&s, "Imported");
    let root = &s.vault.root;
    let one = std::fs::read_to_string(root.join("Imported/a-b.md")).unwrap();
    let two = std::fs::read_to_string(root.join("Imported/a-b 1.md")).unwrap();
    assert_eq!(
        {
            let mut v = vec![one, two];
            v.sort();
            v
        },
        vec!["colon".to_string(), "dash".to_string()]
    );
}

#[test]
fn the_source_folder_is_never_changed() {
    let s = setup();
    let before = snapshot(&s.source);
    go(&s, "Imported");
    assert_eq!(snapshot(&s.source), before);
}

#[test]
fn unsafe_destinations_are_refused() {
    let s = setup();
    for bad in [
        "",
        "   ",
        "../escape",
        "a/../b",
        ".git",
        "x/.vault",
        "/",
        ".hidden/x",
    ] {
        assert!(
            run(
                &s.vault,
                &s.source,
                bad,
                &CancellationToken::new(),
                &|_, _| {}
            )
            .is_err(),
            "{bad:?} should be refused"
        );
    }
    assert!(!s.vault.root.join("escape").exists());
}

#[test]
fn destination_names_are_cleaned_like_file_names() {
    assert_eq!(
        clean_dest(" Imported\\OneNote/ ").unwrap(),
        "Imported/OneNote"
    );
    assert_eq!(clean_dest("Plans: 2026").unwrap(), "Plans- 2026");
    assert_eq!(clean_dest("CON").unwrap(), "CON_");
}

#[test]
fn a_source_inside_the_vault_is_refused() {
    let s = setup();
    let inside = s.vault.root.join("Existing");
    write(&inside.join("a.md"), "x");
    let err = run(
        &s.vault,
        &inside,
        "Imported",
        &CancellationToken::new(),
        &|_, _| {},
    );
    assert!(matches!(err, Err(AppError::InvalidPath(_))));
}

#[cfg(unix)]
#[test]
fn a_destination_symlink_pointing_outside_the_vault_is_refused() {
    let s = setup();
    let outside = s.source.parent().unwrap().join("outside-dir");
    std::fs::create_dir_all(&outside).unwrap();
    std::os::unix::fs::symlink(&outside, s.vault.root.join("Linked")).unwrap();
    let result = run(
        &s.vault,
        &s.source,
        "Linked/Sub",
        &CancellationToken::new(),
        &|_, _| {},
    );
    assert!(result.is_err());
    assert!(std::fs::read_dir(&outside).unwrap().next().is_none());
}

#[test]
fn progress_is_reported_after_every_file() {
    let s = setup();
    let seen = std::cell::RefCell::new(Vec::new());
    run(
        &s.vault,
        &s.source,
        "Imported",
        &CancellationToken::new(),
        &|d, t| {
            seen.borrow_mut().push((d, t));
        },
    )
    .unwrap();
    assert_eq!(*seen.borrow(), vec![(1, 4), (2, 4), (3, 4), (4, 4)]);
}

#[test]
fn cancelling_keeps_what_was_copied_and_commits_it() {
    let s = setup();
    let token = CancellationToken::new();
    let count = Cell::new(0);
    let report = run(&s.vault, &s.source, "Imported", &token, &|_, _| {
        count.set(count.get() + 1);
        if count.get() == 2 {
            token.cancel();
        }
    })
    .unwrap();
    assert!(report.cancelled);
    assert_eq!(report.imported_notes + report.imported_attachments, 2);
    assert!(head_message(&s.vault).contains("(cancelled)"));
    // Whatever exists is complete: no temporary files are left behind.
    for (rel, _) in snapshot(&s.vault.root.join("Imported")) {
        assert!(!rel.contains(".tmp"), "{rel}");
    }
}

#[test]
fn cancelling_before_the_start_imports_nothing_and_makes_no_import_commit() {
    let s = setup();
    let before = commit_count(&s.vault);
    let token = CancellationToken::new();
    token.cancel();
    let report = run(&s.vault, &s.source, "Imported", &token, &|_, _| {}).unwrap();
    assert!(report.cancelled);
    assert_eq!(report.imported_notes, 0);
    assert_eq!(commit_count(&s.vault), before);
    assert!(report.commit.is_none());
}

#[test]
fn broken_wiki_links_are_counted_after_the_import() {
    let s = setup();
    let report = go(&s, "Imported");
    // `[[Policy]]` now exists inside the vault; `[[Missing]]` does not.
    assert_eq!(report.broken_links, 1);
}

#[test]
fn the_imported_notes_are_searchable_afterwards() {
    let s = setup();
    go(&s, "Imported");
    let hits = s
        .vault
        .with_index(|c| {
            crate::search::search(
                c,
                &crate::search::SearchQuery {
                    text: "policy".into(),
                    tag: None,
                    folder: None,
                },
            )
        })
        .unwrap();
    assert!(hits.iter().any(|h| h.path == "Imported/Work/Policy.md"));
}
