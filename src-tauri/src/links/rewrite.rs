//! Rewrites links after files were renamed or moved: wiki-links in other notes, and the relative
//! Markdown links and images (`![](../attachments/a.png)`) inside a note that was moved.

use super::resolve::LinkResolver;
use crate::markdown::links::parse_wikilinks;
use crate::markdown::{code_ranges, in_ranges};
use regex::Regex;
use std::collections::HashMap;
use std::sync::LazyLock;

static MD_URL_RE: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r"(!?\[[^\]]*\])\(([^)\s]+)\)").expect("valid link regex"));
static SCHEME_RE: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r"^[a-zA-Z][a-zA-Z0-9+.-]*:").expect("valid scheme regex"));

/// Decodes `%20` and other percent escapes; text that is not valid UTF-8 is kept as it is.
fn decode_percent(s: &str) -> String {
    let bytes = s.as_bytes();
    let mut out = Vec::with_capacity(bytes.len());
    let mut i = 0;
    while i < bytes.len() {
        if bytes[i] == b'%' && i + 2 < bytes.len() {
            let hex = std::str::from_utf8(&bytes[i + 1..i + 3])
                .ok()
                .and_then(|h| u8::from_str_radix(h, 16).ok());
            if let Some(v) = hex {
                out.push(v);
                i += 3;
                continue;
            }
        }
        out.push(bytes[i]);
        i += 1;
    }
    String::from_utf8(out).unwrap_or_else(|_| s.to_string())
}

fn dir_of(path: &str) -> &str {
    path.rsplit_once('/').map_or("", |(d, _)| d)
}

/// `dir/../x` resolved to a vault path, or `None` when it leaves the vault.
fn join_normalized(dir: &str, rel: &str) -> Option<String> {
    let mut parts: Vec<&str> = dir.split('/').filter(|p| !p.is_empty()).collect();
    for seg in rel.split('/') {
        match seg {
            "" | "." => {}
            ".." => {
                parts.pop()?;
            }
            s => parts.push(s),
        }
    }
    (!parts.is_empty()).then(|| parts.join("/"))
}

/// The relative path from the folder `from_dir` to the vault path `target`.
fn relative_path(from_dir: &str, target: &str) -> String {
    let from: Vec<&str> = from_dir.split('/').filter(|p| !p.is_empty()).collect();
    let to: Vec<&str> = target.split('/').collect();
    let common = from
        .iter()
        .zip(to.iter())
        .take_while(|(a, b)| a == b)
        .count()
        .min(to.len().saturating_sub(1));
    let mut out = "../".repeat(from.len() - common);
    out.push_str(&to[common..].join("/"));
    out
}

/// Rewrites the relative Markdown links and images of a note that moved from `old_note` to
/// `new_note`, so they still point at the same files. A file that moved too (`moves`, old path
/// → new path) is followed to its new place. Links to the web, anchors and `/`-links are left
/// alone, and so is everything in code.
pub fn rewrite_relative(
    content: &str,
    old_note: &str,
    new_note: &str,
    moves: &HashMap<String, String>,
) -> Option<Rewritten> {
    let (old_dir, new_dir) = (dir_of(old_note), dir_of(new_note));
    let code = code_ranges(content);
    let mut out = String::with_capacity(content.len());
    let mut last = 0;
    let mut changed = 0;
    for caps in MD_URL_RE.captures_iter(content) {
        let (Some(whole), Some(url)) = (caps.get(0), caps.get(2)) else {
            continue;
        };
        if in_ranges(&code, whole.start()) {
            continue;
        }
        let raw = url.as_str();
        if SCHEME_RE.is_match(raw) || raw.starts_with(['#', '/']) {
            continue;
        }
        let cut = raw.find(['#', '?']).unwrap_or(raw.len());
        let (path_part, tail) = raw.split_at(cut);
        let Some(target) = join_normalized(old_dir, &decode_percent(path_part)) else {
            continue;
        };
        let new_target = moves.get(&target).cloned().unwrap_or(target);
        let new_url = format!(
            "{}{tail}",
            relative_path(new_dir, &new_target).replace(' ', "%20")
        );
        if new_url == raw {
            continue;
        }
        out.push_str(&content[last..url.start()]);
        out.push_str(&new_url);
        last = url.end();
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

    #[test]
    fn a_moved_note_keeps_its_images_and_links_pointing_at_the_same_files() {
        let none = HashMap::new();
        let note = "![](attachments/my%20pic.png) and [doc](docs/a.pdf#p2) and [web](https://x.dk/a) and [top](#head)\n\n```\n![](attachments/code.png)\n```\n";
        let r = rewrite_relative(note, "Note.md", "Work/Sec/Note.md", &none).unwrap();
        assert_eq!(
            r.content,
            "![](../../attachments/my%20pic.png) and [doc](../../docs/a.pdf#p2) and [web](https://x.dk/a) and [top](#head)\n\n```\n![](attachments/code.png)\n```\n"
        );
        assert_eq!(r.links_changed, 2);
        // And back out again.
        let back = rewrite_relative(&r.content, "Work/Sec/Note.md", "Note.md", &none).unwrap();
        assert!(back
            .content
            .starts_with("![](attachments/my%20pic.png) and [doc](docs/a.pdf#p2)"));
        // Moving to a folder next to it: only the common part is shared.
        assert!(
            rewrite_relative("![](../attachments/a.png)", "Work/N.md", "Home/N.md", &none)
                .is_none()
        );
        let deeper = rewrite_relative(
            "![](../attachments/a.png)",
            "Work/N.md",
            "Work/Sec/N.md",
            &none,
        )
        .unwrap();
        assert_eq!(deeper.content, "![](../../attachments/a.png)");
    }

    #[test]
    fn a_file_that_moved_with_the_note_is_followed_and_nothing_changes_when_nothing_moved_away() {
        // The whole folder `Work` is renamed to `Jobs`: the image inside it moves with it.
        let moves = HashMap::from([
            ("Work/N.md".to_string(), "Jobs/N.md".to_string()),
            ("Work/pic.png".to_string(), "Jobs/pic.png".to_string()),
        ]);
        assert!(rewrite_relative("![](pic.png)", "Work/N.md", "Jobs/N.md", &moves).is_none());
        // A link out of the folder needs the same number of levels as before.
        assert!(rewrite_relative(
            "![](../attachments/a.png)",
            "Work/N.md",
            "Jobs/N.md",
            &moves
        )
        .is_none());
        // A note renamed inside its folder keeps its links as they are.
        assert!(rewrite_relative(
            "![](../attachments/a.png)",
            "Work/Old.md",
            "Work/New.md",
            &HashMap::new()
        )
        .is_none());
        // A link that leaves the vault is left alone.
        assert!(rewrite_relative("![](../../x.png)", "N.md", "A/N.md", &HashMap::new()).is_none());
    }

    #[test]
    fn percent_escapes_are_decoded_without_panicking_on_odd_input() {
        assert_eq!(decode_percent("a%20b%C3%A6"), "a bæ");
        assert_eq!(decode_percent("100%"), "100%");
        assert_eq!(decode_percent("%zz%é"), "%zz%é");
    }
}
