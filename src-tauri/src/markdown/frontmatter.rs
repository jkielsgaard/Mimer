//! YAML frontmatter at the top of a note.

use yaml_rust2::{Yaml, YamlLoader};

/// The frontmatter block of a note.
pub struct Frontmatter<'a> {
    /// YAML text between the `---` fences.
    pub yaml: &'a str,
    /// Byte offset just after the closing fence line.
    pub end: usize,
}

/// Splits frontmatter from the content, if the note starts with a `---` block.
pub fn split(content: &str) -> Option<Frontmatter<'_>> {
    let mut lines = content.split_inclusive('\n');
    let first = lines.next()?;
    if first.trim_end() != "---" {
        return None;
    }
    let mut offset = first.len();
    for line in lines {
        if line.trim_end() == "---" {
            return Some(Frontmatter {
                yaml: &content[first.len()..offset],
                end: offset + line.len(),
            });
        }
        offset += line.len();
    }
    None
}

fn push_tags(value: &Yaml, out: &mut Vec<String>) {
    match value {
        Yaml::Array(items) => {
            for i in items {
                push_tags(i, out);
            }
        }
        Yaml::String(s) => {
            for t in s.split([',', ' ']) {
                let t = t.trim().trim_start_matches('#').to_lowercase();
                if !t.is_empty() {
                    out.push(t);
                }
            }
        }
        Yaml::Integer(i) => out.push(i.to_string()),
        _ => {}
    }
}

/// Tags from `tags:` / `tag:` in YAML (list, inline list or comma-separated string).
pub fn tags(yaml: &str) -> Vec<String> {
    let mut out = Vec::new();
    if let Ok(docs) = YamlLoader::load_from_str(yaml) {
        if let Some(doc) = docs.first() {
            push_tags(&doc["tags"], &mut out);
            push_tags(&doc["tag"], &mut out);
        }
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn splits_frontmatter() {
        let c = "---\ntitle: A\ntags: [x, Y]\n---\n# Body\n";
        let f = split(c).unwrap();
        assert_eq!(f.yaml, "title: A\ntags: [x, Y]\n");
        assert_eq!(&c[f.end..], "# Body\n");
        assert!(split("# no frontmatter\n---\n").is_none());
        assert!(split("---\nunterminated\n").is_none());
    }

    #[test]
    fn parses_tag_forms() {
        assert_eq!(tags("tags: [a, B]"), vec!["a", "b"]);
        assert_eq!(tags("tags:\n  - one\n  - Two"), vec!["one", "two"]);
        assert_eq!(tags("tags: \"a, #b\""), vec!["a", "b"]);
        assert!(tags("title: x").is_empty());
    }
}
