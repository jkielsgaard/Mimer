//! Resolves wiki-link targets to vault files.

use std::collections::HashMap;

/// Pre-computed lookup tables over the list of vault files.
#[derive(Debug, Default, Clone)]
pub struct LinkResolver {
    by_stem: HashMap<String, Vec<String>>,
    by_filename: HashMap<String, Vec<String>>,
    by_path: HashMap<String, String>,
}

fn pick(paths: &[String]) -> Option<String> {
    paths
        .iter()
        .min_by(|a, b| a.len().cmp(&b.len()).then_with(|| a.cmp(b)))
        .cloned()
}

fn file_name(path: &str) -> &str {
    path.rsplit('/').next().unwrap_or(path)
}

fn stem(path: &str) -> &str {
    let name = file_name(path);
    name.strip_suffix(".md")
        .or_else(|| name.strip_suffix(".MD"))
        .unwrap_or(name)
}

impl LinkResolver {
    /// Builds a resolver over vault-relative file paths.
    pub fn new(files: &[String]) -> Self {
        let mut r = LinkResolver::default();
        for f in files {
            r.by_path.insert(f.to_lowercase(), f.clone());
            r.by_filename
                .entry(file_name(f).to_lowercase())
                .or_default()
                .push(f.clone());
            if f.to_lowercase().ends_with(".md") {
                r.by_stem
                    .entry(stem(f).to_lowercase())
                    .or_default()
                    .push(f.clone());
            }
        }
        r
    }

    /// Resolves a link target following the spec: path form, else name match
    /// (shortest path wins, then alphabetical).
    pub fn resolve(&self, target: &str) -> Option<String> {
        let t = target.trim();
        if t.is_empty() {
            return None;
        }
        if t.contains('/') {
            let t = t.trim_start_matches('/').to_lowercase();
            if let Some(p) = self.by_path.get(&t) {
                return Some(p.clone());
            }
            return self.by_path.get(&format!("{t}.md")).cloned();
        }
        let lower = t.to_lowercase();
        if let Some(v) = self.by_stem.get(&lower) {
            return pick(v);
        }
        self.by_filename.get(&lower).and_then(|v| pick(v))
    }

    /// Number of notes sharing this stem (case-insensitive).
    pub fn stem_count(&self, stem: &str) -> usize {
        self.by_stem.get(&stem.to_lowercase()).map_or(0, Vec::len)
    }

    /// Number of files sharing this file name (case-insensitive).
    pub fn filename_count(&self, name: &str) -> usize {
        self.by_filename
            .get(&name.to_lowercase())
            .map_or(0, Vec::len)
    }

    /// The shortest unambiguous link form for a file: name only if unique, otherwise path.
    pub fn shortest_form(&self, path: &str) -> String {
        if path.to_lowercase().ends_with(".md") {
            if self.stem_count(stem(path)) <= 1 {
                stem(path).to_string()
            } else {
                path[..path.len() - 3].to_string()
            }
        } else if self.filename_count(file_name(path)) <= 1 {
            file_name(path).to_string()
        } else {
            path.to_string()
        }
    }
}

/// File stem of a vault path (without `.md`).
pub fn note_stem(path: &str) -> &str {
    stem(path)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn files() -> Vec<String> {
        [
            "Notes/Alpha.md",
            "Alpha.md",
            "deep/dir/Beta.md",
            "other/Beta.md",
            "img/pic.png",
            "a/Same.md",
            "b/Same.md",
        ]
        .iter()
        .map(|s| s.to_string())
        .collect()
    }

    #[test]
    fn resolves_by_name_case_insensitive_shortest_first() {
        let r = LinkResolver::new(&files());
        assert_eq!(r.resolve("alpha").as_deref(), Some("Alpha.md"));
        assert_eq!(r.resolve("Beta").as_deref(), Some("other/Beta.md"));
        assert_eq!(r.resolve("Same").as_deref(), Some("a/Same.md"));
        assert_eq!(r.resolve("pic.png").as_deref(), Some("img/pic.png"));
        assert_eq!(r.resolve("missing"), None);
    }

    #[test]
    fn resolves_path_form() {
        let r = LinkResolver::new(&files());
        assert_eq!(
            r.resolve("deep/dir/Beta").as_deref(),
            Some("deep/dir/Beta.md")
        );
        assert_eq!(
            r.resolve("Notes/Alpha.md").as_deref(),
            Some("Notes/Alpha.md")
        );
        assert_eq!(r.resolve("nope/Beta"), None);
    }

    #[test]
    fn shortest_form_uses_path_when_ambiguous() {
        let r = LinkResolver::new(&files());
        assert_eq!(r.shortest_form("img/pic.png"), "pic.png");
        assert_eq!(r.shortest_form("a/Same.md"), "a/Same");
        assert_eq!(r.shortest_form("deep/dir/Beta.md"), "deep/dir/Beta");
        let r2 = LinkResolver::new(&["x/Only.md".to_string()]);
        assert_eq!(r2.shortest_form("x/Only.md"), "Only");
    }
}
