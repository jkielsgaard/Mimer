//! Unit tests for the search index.

use super::*;

fn setup() -> (Connection, LinkResolver) {
    let conn = open_memory().unwrap();
    let files: Vec<String> = ["Firewall.md", "Work/Policy.md", "Work/Notes.md"]
        .iter()
        .map(|s| s.to_string())
        .collect();
    let r = LinkResolver::new(&files);
    index_note(
        &conn,
        &r,
        "Firewall.md",
        "# Firewall rules\nBlock inbound traffic. #security\nSee [[Policy]]",
        1,
    )
    .unwrap();
    index_note(
        &conn,
        &r,
        "Work/Policy.md",
        "---\ntags: [iso]\n---\n# Policy\nPasswords must be rotated.",
        1,
    )
    .unwrap();
    index_note(
        &conn,
        &r,
        "Work/Notes.md",
        "Meeting about firewalling and \"quotes\" (parens) AND OR NOT",
        1,
    )
    .unwrap();
    (conn, r)
}

fn q(text: &str) -> SearchQuery {
    SearchQuery {
        text: text.into(),
        ..Default::default()
    }
}

#[test]
fn prefix_match_and_ranking() {
    let (conn, _) = setup();
    let hits = search(&conn, &q("firewal")).unwrap();
    assert_eq!(hits[0].path, "Firewall.md"); // title weight beats body
    assert_eq!(hits.len(), 2);
    assert!(hits[0].snippet.contains("<mark>") || !hits[0].snippet.is_empty());
}

#[test]
fn tag_and_path_filters() {
    let (conn, _) = setup();
    assert_eq!(search(&conn, &q("tag:security")).unwrap().len(), 1);
    assert_eq!(
        search(&conn, &q("tag:iso password")).unwrap()[0].path,
        "Work/Policy.md"
    );
    let hits = search(&conn, &q("path:Work firewall")).unwrap();
    assert_eq!(hits.len(), 1);
    assert_eq!(hits[0].path, "Work/Notes.md");
    assert_eq!(search(&conn, &q("path:Work")).unwrap().len(), 2);
}

#[test]
fn special_characters_do_not_break_queries() {
    let (conn, _) = setup();
    for text in [
        "\"", "(", "AND", "a OR", "*", "quotes\"", "NOT", "'", "-x", "foo:bar", "^",
    ] {
        assert!(search(&conn, &q(text)).is_ok(), "{text}");
    }
    assert_eq!(search(&conn, &q("AND")).unwrap().len(), 1);
}

#[test]
fn update_and_delete() {
    let (conn, r) = setup();
    index_note(&conn, &r, "Firewall.md", "# Renamed topic\nnothing", 2).unwrap();
    assert!(search(&conn, &q("inbound")).unwrap().is_empty());
    assert_eq!(search(&conn, &q("topic")).unwrap().len(), 1);
    remove_note(&conn, "Firewall.md").unwrap();
    assert!(search(&conn, &q("topic")).unwrap().is_empty());
}

#[test]
fn backlinks_and_tags() {
    let (conn, r) = setup();
    let dir = tempfile::tempdir().unwrap();
    std::fs::write(
        dir.path().join("Firewall.md"),
        "# Firewall rules\nBlock. See [[Policy]]",
    )
    .unwrap();
    let b = backlinks(&conn, &r, dir.path(), "Work/Policy.md").unwrap();
    assert_eq!(b.len(), 1);
    assert_eq!(b[0].path, "Firewall.md");
    assert!(b[0].snippet.contains("[[Policy]]"));
    let tags = all_tags(&conn).unwrap();
    assert!(tags.iter().any(|t| t.tag == "iso"));
}

#[test]
fn sync_is_incremental() {
    let dir = tempfile::tempdir().unwrap();
    std::fs::write(dir.path().join("a.md"), "# Alpha").unwrap();
    std::fs::write(dir.path().join("b.md"), "# Beta").unwrap();
    let conn = open_memory().unwrap();
    sync_vault(&conn, dir.path()).unwrap();
    assert_eq!(search(&conn, &q("alpha")).unwrap().len(), 1);
    std::fs::remove_file(dir.path().join("a.md")).unwrap();
    sync_vault(&conn, dir.path()).unwrap();
    assert!(search(&conn, &q("alpha")).unwrap().is_empty());
    assert_eq!(search(&conn, &q("beta")).unwrap().len(), 1);
}

#[test]
fn link_target_suggestions() {
    let files: Vec<String> = ["Firewall.md", "Work/Policy.md", "img/pic.png"]
        .iter()
        .map(|s| s.to_string())
        .collect();
    let r = LinkResolver::new(&files);
    assert_eq!(link_targets(&files, &r, "pol"), vec!["Policy"]);
    assert_eq!(link_targets(&files, &r, "").len(), 2);
}

fn generate(dir: &Path, n: usize) {
    for i in 0..n {
        let folder = dir.join(format!("topic{}", i % 20));
        std::fs::create_dir_all(&folder).unwrap();
        let body = format!(
            "# Note number {i}\n\nThis note talks about firewall rules, passwords and policy {i}. See [[Note number {}]]. #tag{}\n\n{}",
            (i + 1) % n,
            i % 10,
            "lorem ipsum dolor sit amet consectetur ".repeat(40)
        );
        std::fs::write(folder.join(format!("note-{i}.md")), body).unwrap();
    }
}

#[test]
fn search_is_fast_on_a_1000_note_vault() {
    let dir = tempfile::tempdir().unwrap();
    generate(dir.path(), 1000);
    let conn = open_memory().unwrap();
    sync_vault(&conn, dir.path()).unwrap();
    let start = std::time::Instant::now();
    for text in [
        "firewal",
        "tag:tag3 policy",
        "path:topic4 passwor",
        "number 77",
    ] {
        let hits = search(
            &conn,
            &SearchQuery {
                text: text.into(),
                ..Default::default()
            },
        )
        .unwrap();
        assert!(!hits.is_empty(), "{text}");
    }
    let per_query = start.elapsed() / 4;
    assert!(
        per_query.as_millis() < 100,
        "search took {per_query:?} per query"
    );
}

/// Run with `cargo test -- --ignored perf` (release mode recommended).
#[test]
#[ignore]
fn perf_index_5000_notes() {
    let dir = tempfile::tempdir().unwrap();
    generate(dir.path(), 5000);
    let conn = open_memory().unwrap();
    let t = std::time::Instant::now();
    sync_vault(&conn, dir.path()).unwrap();
    let first = t.elapsed();
    let t = std::time::Instant::now();
    sync_vault(&conn, dir.path()).unwrap();
    let incremental = t.elapsed();
    println!("first index: {first:?}, incremental: {incremental:?}");
    assert!(first.as_secs() < 5, "first index took {first:?}");
    assert!(
        incremental.as_secs() < 1,
        "incremental took {incremental:?}"
    );
}
