//! Tag extraction: inline `#tag` and frontmatter `tags:`.

use super::{code_ranges, frontmatter, in_ranges};
use regex::Regex;
use std::collections::BTreeSet;
use std::sync::LazyLock;

static TAG_RE: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r"(?m)(^|[\s(])#([\p{L}\p{N}_\-/]+)").expect("valid tag regex"));

/// All tags in a note, lower-cased, de-duplicated and sorted.
pub fn extract_tags(content: &str) -> Vec<String> {
    let mut set: BTreeSet<String> = BTreeSet::new();
    let fm = frontmatter::split(content);
    let start = fm.as_ref().map(|f| f.end).unwrap_or(0);
    if let Some(f) = &fm {
        set.extend(frontmatter::tags(f.yaml));
    }
    let code = code_ranges(content);
    for c in TAG_RE.captures_iter(&content[start..]) {
        let (Some(whole), Some(tag)) = (c.get(0), c.get(2)) else {
            continue;
        };
        let hash_pos = start + whole.end() - tag.as_str().len() - 1;
        if in_ranges(&code, hash_pos) {
            continue;
        }
        let t = tag.as_str().trim_end_matches(['/', '-']).to_lowercase();
        if t.is_empty() || t.chars().all(|ch| ch.is_ascii_digit()) {
            continue;
        }
        set.insert(t);
    }
    set.into_iter().collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn inline_and_frontmatter() {
        let c = "---\ntags: [Alpha]\n---\nText #beta and #Gamma/sub (#delta)\n";
        assert_eq!(extract_tags(c), vec!["alpha", "beta", "delta", "gamma/sub"]);
    }

    #[test]
    fn exclusions() {
        let c = "# Heading\n#123 not a tag\n`#code` and\n```\n#fenced\n```\nurl http://x.y/#anchor [[Note#Head]] a#b\n#ok\n";
        assert_eq!(extract_tags(c), vec!["ok"]);
    }
}
