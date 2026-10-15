//! Rewrites wiki-links in a note after files were renamed or moved.

use super::resolve::LinkResolver;
use crate::markdown::links::parse_wikilinks;
use std::collections::HashMap;

/// Result of rewriting one note.
pub struct Rewritten {
    pub content: String,
    pub links_changed: usize,
}

/// Rewrites links whose target (resolved against `before`) was moved according to `moves`
/// (old path → new path). The new target form is chosen against `after`.
pub fn rewrite_content(
    content: &str,
    before: &LinkResolver,
    after: &LinkResolver,
    moves: &HashMap<String, String>,
) -> Option<Rewritten> {
    let mut out = String::with_capacity(content.len());
    let mut last = 0;
    let mut changed = 0;
    for link in parse_wikilinks(content) {
        let Some(resolved) = before.resolve(&link.target) else {
            continue;
        };
        let Some(new_path) = moves.get(&resolved) else {
            continue;
        };
        let new_target = after.shortest_form(new_path);
        let replacement = link.render_with_target(&new_target);
        if replacement == content[link.start..link.end] {
            continue;
        }
        out.push_str(&content[last..link.start]);
        out.push_str(&replacement);
        last = link.end;
        changed += 1;
    }
    if changed == 0 {
        return None;
    }
    out.push_str(&content[last..]);
    Some(Rewritten {
        content: out,
        links_changed: changed,
    })
}

/// Counts links that would be rewritten (for the confirmation dialog).
pub fn count_affected(
    content: &str,
    before: &LinkResolver,
    moves: &HashMap<String, String>,
) -> usize {
    parse_wikilinks(content)
        .iter()
        .filter(|l| {
            before
                .resolve(&l.target)
                .is_some_and(|r| moves.contains_key(&r))
        })
        .count()
}

#[cfg(test)]
mod tests {
    use super::*;

    fn resolver(files: &[&str]) -> LinkResolver {
        LinkResolver::new(&files.iter().map(|s| s.to_string()).collect::<Vec<_>>())
    }

    #[test]
    fn rewrites_preserving_heading_and_alias() {
        let before = resolver(&["Old.md", "Index.md"]);
        let after = resolver(&["New.md", "Index.md"]);
        let moves = HashMap::from([("Old.md".to_string(), "New.md".to_string())]);
        let c = "See [[Old]], [[old#Intro|the intro]] and ![[Old]] but not [[Other]].";
        let r = rewrite_content(c, &before, &after, &moves).unwrap();
        assert_eq!(
            r.content,
            "See [[New]], [[New#Intro|the intro]] and ![[New]] but not [[Other]]."
        );
        assert_eq!(r.links_changed, 3);
    }

    #[test]
    fn uses_path_when_new_name_is_ambiguous() {
        let before = resolver(&["Old.md", "x/Dup.md"]);
        let after = resolver(&["sub/Dup.md", "x/Dup.md"]);
        let moves = HashMap::from([("Old.md".to_string(), "sub/Dup.md".to_string())]);
        let r = rewrite_content("[[Old]]", &before, &after, &moves).unwrap();
        assert_eq!(r.content, "[[sub/Dup]]");
    }

    #[test]
    fn returns_none_without_changes() {
        let before = resolver(&["A.md"]);
        let moves = HashMap::from([("A.md".to_string(), "B.md".to_string())]);
        assert!(rewrite_content("[[Z]] `[[A]]`", &before, &before, &moves).is_none());
    }
}
