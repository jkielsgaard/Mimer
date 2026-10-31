//! Changing the `tags:` of a note's front matter. Only that line (or list) is touched: the other
//! properties, the body and the line endings stay as they are.

use super::frontmatter;

/// Mimer's own tags: the tags that do something (an epic, a meeting, a pinned note). Every other
/// tag belongs to the person. A rewrite of a note by the AI never adds or takes away one of these.
pub const SYSTEM_TAGS: [&str; 3] = ["meeting", "epic", "pinned"];

/// The rewritten note with the same Mimer tags as the original: one the model added is taken off
/// and one it dropped is put back. The person's own tags are left as the model wrote them.
pub fn keep_system_tags(original: &str, rewritten: &str) -> String {
    let before = front_matter_tags(original);
    let mut out = rewritten.to_string();
    for tag in SYSTEM_TAGS {
        let had = before.iter().any(|t| t == tag);
        let has = front_matter_tags(&out).iter().any(|t| t == tag);
        if had && !has {
            out = add_tag(&out, tag);
        } else if has && !had {
            out = remove_tag(&out, tag);
        }
    }
    out
}

/// The note with `tag` in the `tags:` of its front matter (the properties are made when missing).
/// The other lines are kept as they are, and a tag that is already there is not added again.
pub fn add_tag(content: &str, tag: &str) -> String {
    let nl = if content.contains("\r\n") {
        "\r\n"
    } else {
        "\n"
    };
    let Some(fm) = crate::markdown::frontmatter::split(content) else {
        return format!("---{nl}tags: [{tag}]{nl}---{nl}{content}");
    };
    if crate::markdown::frontmatter::tags(fm.yaml)
        .iter()
        .any(|t| t == tag)
    {
        return content.to_string();
    }
    let mut lines: Vec<String> = content[..fm.end].split('\n').map(str::to_string).collect();
    lines.pop(); // the empty piece after the closing fence's line break
    let close = lines.len() - 1;
    let cr = |l: String| if nl == "\r\n" { format!("{l}\r") } else { l };
    let at = (1..close).find(|&i| {
        let l = lines[i].trim_end();
        l.starts_with("tags:") || l.starts_with("tag:")
    });
    match at {
        None => lines.insert(close, cr(format!("tags: [{tag}]"))),
        Some(i) => {
            let line = lines[i].trim_end().to_string();
            let (key, value) = line.split_once(':').unwrap_or(("tags", ""));
            let value = value.trim();
            if let Some(inner) = value.strip_prefix('[').and_then(|v| v.strip_suffix(']')) {
                let sep = if inner.trim().is_empty() { "" } else { ", " };
                lines[i] = cr(format!("{key}: [{}{sep}{tag}]", inner.trim()));
            } else if value.is_empty() {
                // A list on the lines below: the tag goes after the last item.
                let mut last = i;
                while last + 1 < close && lines[last + 1].trim_start().starts_with("- ") {
                    last += 1;
                }
                let indent: String = lines
                    .get(i + 1)
                    .filter(|l| l.trim_start().starts_with("- "))
                    .map(|l| l.chars().take_while(|c| c.is_whitespace()).collect())
                    .unwrap_or_default();
                lines.insert(last + 1, cr(format!("{indent}- {tag}")));
            } else {
                let old: Vec<&str> = value
                    .trim_matches(['"', '\''])
                    .split([',', ' '])
                    .filter(|t| !t.is_empty())
                    .collect();
                lines[i] = cr(format!("{key}: [{}, {tag}]", old.join(", ")));
            }
        }
    }
    let mut out = lines.join("\n");
    out.push('\n');
    out.push_str(&content[fm.end..]);
    out
}

/// The note without `tag` in its `tags:` (compared without case, a leading `#` is ignored). The
/// `tags:` line goes when it is empty, and the front matter goes when nothing else is left in it.
pub fn remove_tag(content: &str, tag: &str) -> String {
    let Some(fm) = frontmatter::split(content) else {
        return content.to_string();
    };
    let nl = if content.contains("\r\n") {
        "\r\n"
    } else {
        "\n"
    };
    let mut lines: Vec<String> = content[..fm.end].split('\n').map(str::to_string).collect();
    lines.pop();
    let close = lines.len() - 1;
    let same = |t: &str| {
        t.trim()
            .trim_matches(['"', '\''])
            .trim_start_matches('#')
            .to_lowercase()
            == tag
    };
    let Some(at) = (1..close).find(|&i| {
        let l = lines[i].trim_end();
        l.starts_with("tags:") || l.starts_with("tag:")
    }) else {
        return content.to_string();
    };
    let line = lines[at].trim_end().to_string();
    let (key, value) = line.split_once(':').unwrap_or(("tags", ""));
    let value = value.trim();
    let cr = |l: String| if nl == "\r\n" { format!("{l}\r") } else { l };
    if value.is_empty() {
        // A list on the lines below.
        let mut end = at + 1;
        while end < close && lines[end].trim_start().starts_with("- ") {
            end += 1;
        }
        let kept: Vec<String> = lines[at + 1..end]
            .iter()
            .filter(|l| !same(l.trim_start().trim_start_matches("- ")))
            .cloned()
            .collect();
        if kept.len() == end - at - 1 {
            return content.to_string();
        }
        let head = if kept.is_empty() {
            Vec::new()
        } else {
            vec![lines[at].clone()]
        };
        lines.splice(at..end, head.into_iter().chain(kept));
    } else {
        let inner = value
            .strip_prefix('[')
            .and_then(|v| v.strip_suffix(']'))
            .unwrap_or(value);
        let all: Vec<&str> = inner
            .split(if value.starts_with('[') {
                &[','][..]
            } else {
                &[',', ' '][..]
            })
            .map(str::trim)
            .filter(|t| !t.is_empty())
            .collect();
        let rest: Vec<&str> = all.iter().copied().filter(|t| !same(t)).collect();
        if rest.len() == all.len() {
            return content.to_string();
        }
        if rest.is_empty() {
            lines.remove(at);
        } else {
            lines[at] = cr(format!("{key}: [{}]", rest.join(", ")));
        }
    }
    let close = lines.len() - 1;
    if lines[1..close].iter().all(|l| l.trim().is_empty()) {
        return content[fm.end..].to_string();
    }
    let mut out = lines.join("\n");
    out.push('\n');
    out.push_str(&content[fm.end..]);
    out
}

/// The tags of a note's front matter, lower case.
pub fn front_matter_tags(content: &str) -> Vec<String> {
    frontmatter::split(content)
        .map(|f| frontmatter::tags(f.yaml))
        .unwrap_or_default()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_rewrite_keeps_mimers_tags_and_leaves_the_persons_own_alone() {
        let original = "---\ntags: [meeting, vpn]\n---\n# A\n";
        // The model dropped meeting, added epic and a tag of its own.
        let rewritten = "---\ntags: [vpn, it, epic]\n---\n# A better title\n";
        let fixed = keep_system_tags(original, rewritten);
        let tags = front_matter_tags(&fixed);
        assert!(tags.contains(&"meeting".to_string()));
        assert!(!tags.contains(&"epic".to_string()));
        assert!(tags.contains(&"it".to_string()) && tags.contains(&"vpn".to_string()));
        assert!(fixed.contains("# A better title"));
        // Nothing to change: the same text comes back.
        assert_eq!(keep_system_tags(original, original), original);
        // A note with no properties that the model gave a Mimer tag.
        let plain = keep_system_tags("# A\n", "---\ntags: [pinned]\n---\n# A\n");
        assert!(front_matter_tags(&plain).is_empty());
    }

    #[test]
    fn a_tag_is_added_where_the_tags_are() {
        assert_eq!(add_tag("# A\n", "epic"), "---\ntags: [epic]\n---\n# A\n");
        assert_eq!(
            add_tag("---\ntitle: A\n---\n# A\n", "epic"),
            "---\ntitle: A\ntags: [epic]\n---\n# A\n"
        );
        assert_eq!(
            add_tag("---\ntags: [meeting]\n---\nx\n", "epic"),
            "---\ntags: [meeting, epic]\n---\nx\n"
        );
        assert_eq!(
            add_tag("---\ntags:\n  - a\n  - b\nwith: [x]\n---\nx\n", "epic"),
            "---\ntags:\n  - a\n  - b\n  - epic\nwith: [x]\n---\nx\n"
        );
        assert_eq!(
            add_tag("---\ntags: a, b\n---\nx\n", "epic"),
            "---\ntags: [a, b, epic]\n---\nx\n"
        );
        let has = "---\ntags: [Epic]\n---\nx\n";
        assert_eq!(add_tag(has, "epic"), has);
        assert_eq!(
            add_tag("---\r\ntags: [a]\r\n---\r\nx\r\n", "epic"),
            "---\r\ntags: [a, epic]\r\n---\r\nx\r\n"
        );
    }

    #[test]
    fn a_tag_is_removed_and_empty_properties_go() {
        assert_eq!(
            remove_tag("---\ntags: [meeting, epic]\n---\nx\n", "epic"),
            "---\ntags: [meeting]\n---\nx\n"
        );
        assert_eq!(remove_tag("---\ntags: [Epic]\n---\n# A\n", "epic"), "# A\n");
        assert_eq!(
            remove_tag("---\ntitle: A\ntags: [epic]\n---\nx\n", "epic"),
            "---\ntitle: A\n---\nx\n"
        );
        assert_eq!(
            remove_tag("---\ntags:\n  - a\n  - epic\nwith: [x]\n---\nx\n", "epic"),
            "---\ntags:\n  - a\nwith: [x]\n---\nx\n"
        );
        assert_eq!(
            remove_tag("---\ntags:\n  - epic\nwith: [x]\n---\nx\n", "epic"),
            "---\nwith: [x]\n---\nx\n"
        );
        assert_eq!(
            remove_tag("---\ntags: a, epic\n---\nx\n", "epic"),
            "---\ntags: [a]\n---\nx\n"
        );
        // Nothing to remove, or no properties: the note is returned as it was.
        let other = "---\ntags: [a]\n---\nx\n";
        assert_eq!(remove_tag(other, "epic"), other);
        assert_eq!(remove_tag("# A\n", "epic"), "# A\n");
        assert_eq!(
            remove_tag("---\r\ntags: [a, epic]\r\n---\r\nx\r\n", "epic"),
            "---\r\ntags: [a]\r\n---\r\nx\r\n"
        );
    }

    #[test]
    fn the_tags_of_the_properties_are_read() {
        assert_eq!(
            front_matter_tags("---\ntags: [Meeting, epic]\n---\nx\n"),
            ["meeting", "epic"]
        );
        assert!(front_matter_tags("#epic in the text\n").is_empty());
    }
}
