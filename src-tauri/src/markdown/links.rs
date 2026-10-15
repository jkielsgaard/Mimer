//! Wiki-link parsing: `[[Target]]`, `[[Target|Alias]]`, `[[Target#Heading]]`, `![[embed]]`.

use super::{code_ranges, frontmatter, in_ranges};
use regex::Regex;
use std::sync::LazyLock;

static WIKI_RE: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(r"!?\[\[([^\[\]|#]+)(#[^\[\]|]+)?(\|[^\[\]]+)?\]\]").expect("valid wiki-link regex")
});

/// One wiki-link occurrence.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct WikiLink {
    pub target: String,
    /// Heading including the leading `#`.
    pub heading: Option<String>,
    /// Alias including the leading `|`.
    pub alias: Option<String>,
    pub embed: bool,
    pub start: usize,
    pub end: usize,
}

impl WikiLink {
    /// Re-renders the link with a different target, keeping heading and alias.
    pub fn render_with_target(&self, target: &str) -> String {
        format!(
            "{}[[{}{}{}]]",
            if self.embed { "!" } else { "" },
            target,
            self.heading.as_deref().unwrap_or(""),
            self.alias.as_deref().unwrap_or("")
        )
    }
}

/// Finds wiki-links outside code blocks, inline code and frontmatter.
pub fn parse_wikilinks(content: &str) -> Vec<WikiLink> {
    let fm_end = frontmatter::split(content).map(|f| f.end).unwrap_or(0);
    let code = code_ranges(content);
    WIKI_RE
        .captures_iter(content)
        .filter_map(|c| {
            let m = c.get(0)?;
            if m.start() < fm_end || in_ranges(&code, m.start()) {
                return None;
            }
            Some(WikiLink {
                target: c.get(1)?.as_str().trim().to_string(),
                heading: c.get(2).map(|h| h.as_str().to_string()),
                alias: c.get(3).map(|a| a.as_str().to_string()),
                embed: m.as_str().starts_with('!'),
                start: m.start(),
                end: m.end(),
            })
        })
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_all_variants() {
        let c = "[[A]] [[B|alias]] [[C#Head]] [[D#Head|alias]] ![[img.png]]";
        let l = parse_wikilinks(c);
        assert_eq!(l.len(), 5);
        assert_eq!(l[0].target, "A");
        assert_eq!(l[1].alias.as_deref(), Some("|alias"));
        assert_eq!(l[2].heading.as_deref(), Some("#Head"));
        assert_eq!(l[3].heading.as_deref(), Some("#Head"));
        assert_eq!(l[3].alias.as_deref(), Some("|alias"));
        assert!(l[4].embed);
        assert_eq!(l[3].render_with_target("Z"), "[[Z#Head|alias]]");
    }

    #[test]
    fn ignores_code_and_frontmatter() {
        let c = "---\nrelated: \"[[FM]]\"\n---\n`[[Inline]]`\n\n```\n[[Fenced]]\n```\n[[Real]]\n";
        let l = parse_wikilinks(c);
        assert_eq!(l.len(), 1);
        assert_eq!(l[0].target, "Real");
    }
}
