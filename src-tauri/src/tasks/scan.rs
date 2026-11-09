//! Reading the tasks of every note in a vault, remembering what each file held. A file is read and
//! parsed again only when its modification time or size is not what the cache saw, so asking for
//! the task list (the app does it from about ten places) costs a look at each file's metadata
//! instead of reading every note.

use super::{parse, Task};
use crate::vault::{fs_ops, tree};
use std::collections::HashMap;
use std::path::Path;
use std::time::SystemTime;

/// What one file held when it was last read.
struct Cached {
    modified: Option<SystemTime>,
    len: u64,
    tasks: Vec<Task>,
}

/// The tasks of each note, by its vault-relative path.
#[derive(Default)]
pub struct TaskCache {
    files: HashMap<String, Cached>,
}

impl TaskCache {
    /// Drops what is remembered about one note. A note that is written changes its time and size,
    /// except when it is written twice in the same instant with the same length, so a writer
    /// calls this too.
    pub fn forget(&mut self, rel: &str) {
        self.files.remove(rel);
    }
}

/// Every task in `files` (vault-relative paths of Markdown notes), in the order of the list, at
/// most `max`. A note with no checklist line is skipped quickly, and remembered as having none.
pub fn scan(root: &Path, files: &[String], cache: &mut TaskCache, max: usize) -> Vec<Task> {
    let mut out: Vec<Task> = Vec::new();
    let mut seen: Vec<&str> = Vec::with_capacity(files.len());
    for rel in files.iter().filter(|f| tree::is_markdown(f)) {
        seen.push(rel);
        let meta = std::fs::metadata(root.join(rel)).ok();
        let (modified, len) = meta
            .as_ref()
            .map_or((None, 0), |m| (m.modified().ok(), m.len()));
        let fresh = cache
            .files
            .get(rel.as_str())
            .is_some_and(|c| modified.is_some() && c.modified == modified && c.len == len);
        if !fresh {
            let Ok(note) = fs_ops::read_note(root, rel) else {
                cache.files.remove(rel.as_str());
                continue;
            };
            let has_box = note.content.contains("[ ]")
                || note.content.contains("[x]")
                || note.content.contains("[X]");
            let tasks = if has_box {
                parse(rel, &note.content)
            } else {
                Vec::new()
            };
            cache.files.insert(
                rel.clone(),
                Cached {
                    modified,
                    len,
                    tasks,
                },
            );
        }
        if let Some(c) = cache.files.get(rel.as_str()) {
            out.extend(c.tasks.iter().cloned());
        }
        if out.len() >= max {
            out.truncate(max);
            break;
        }
    }
    // Notes that are gone are forgotten (only when the whole list was read).
    if out.len() < max {
        cache.files.retain(|k, _| seen.contains(&k.as_str()));
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    fn write(root: &Path, rel: &str, text: &str) {
        let p = root.join(rel);
        std::fs::create_dir_all(p.parent().unwrap()).unwrap();
        std::fs::write(p, text).unwrap();
    }

    fn titles(tasks: &[Task]) -> Vec<String> {
        tasks.iter().map(|t| t.title.clone()).collect()
    }

    #[test]
    fn the_cache_gives_what_a_plain_read_of_every_note_gives() {
        let d = tempfile::tempdir().unwrap();
        write(d.path(), "A.md", "- [ ] One\n  - [ ] A step\n- [x] Two\n");
        write(d.path(), "B/C.md", "# C\n\nNo tasks.\n");
        write(d.path(), "D.md", "- [ ] Three #tag\n");
        let files: Vec<String> = ["A.md", "B/C.md", "D.md", "notes.txt"]
            .iter()
            .map(|s| (*s).to_string())
            .collect();
        let mut cache = TaskCache::default();
        let first = scan(d.path(), &files, &mut cache, 100);
        let again = scan(d.path(), &files, &mut cache, 100);
        assert_eq!(titles(&first), ["One", "Two", "Three"]);
        assert_eq!(titles(&again), titles(&first));
        assert_eq!(first[0].steps.len(), 1);
    }

    #[test]
    fn a_changed_file_is_read_again_and_a_deleted_one_is_forgotten() {
        let d = tempfile::tempdir().unwrap();
        write(d.path(), "A.md", "- [ ] One\n");
        write(d.path(), "B.md", "- [ ] Two\n");
        let files: Vec<String> = vec!["A.md".into(), "B.md".into()];
        let mut cache = TaskCache::default();
        assert_eq!(
            titles(&scan(d.path(), &files, &mut cache, 100)),
            ["One", "Two"]
        );
        // A longer text changes the size, so the cache cannot be fooled by the same time.
        write(d.path(), "A.md", "- [ ] One changed\n- [ ] One more\n");
        assert_eq!(
            titles(&scan(d.path(), &files, &mut cache, 100)),
            ["One changed", "One more", "Two"]
        );
        std::fs::remove_file(d.path().join("B.md")).unwrap();
        let left: Vec<String> = vec!["A.md".into()];
        assert_eq!(
            titles(&scan(d.path(), &left, &mut cache, 100)),
            ["One changed", "One more"]
        );
        assert_eq!(cache.files.len(), 1);
    }

    #[test]
    fn forgetting_a_note_makes_the_next_scan_read_it() {
        let d = tempfile::tempdir().unwrap();
        write(d.path(), "A.md", "- [ ] One\n");
        let files: Vec<String> = vec!["A.md".into()];
        let mut cache = TaskCache::default();
        scan(d.path(), &files, &mut cache, 100);
        // Same length, as if written in the same instant: only forgetting makes it read again.
        let modified = std::fs::metadata(d.path().join("A.md"))
            .unwrap()
            .modified()
            .unwrap();
        write(d.path(), "A.md", "- [ ] Uno\n");
        let f = std::fs::File::options()
            .write(true)
            .open(d.path().join("A.md"))
            .unwrap();
        f.set_modified(modified).unwrap();
        assert_eq!(titles(&scan(d.path(), &files, &mut cache, 100)), ["One"]);
        cache.forget("A.md");
        assert_eq!(titles(&scan(d.path(), &files, &mut cache, 100)), ["Uno"]);
    }

    #[test]
    fn the_limit_is_kept() {
        let d = tempfile::tempdir().unwrap();
        write(d.path(), "A.md", "- [ ] 1\n- [ ] 2\n- [ ] 3\n");
        write(d.path(), "B.md", "- [ ] 4\n");
        let files: Vec<String> = vec!["A.md".into(), "B.md".into()];
        let mut cache = TaskCache::default();
        assert_eq!(scan(d.path(), &files, &mut cache, 2).len(), 2);
    }
}
