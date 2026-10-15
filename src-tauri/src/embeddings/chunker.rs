//! Splits a note into chunks for embedding: by heading, then by paragraph, at most `max_chars`.

use crate::ai::proposals::hash;
use crate::markdown::frontmatter;

/// One piece of a note.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Chunk {
    pub index: u32,
    pub heading: String,
    /// The text that is embedded and shown: `"<title> > <heading>\n<body>"`.
    pub text: String,
    /// SHA-256 of `text`; unchanged chunks keep their vectors.
    pub hash: String,
}

const MIN_ALNUM: usize = 20;

/// Splits a note into chunks of at most `max_chars` (plus the title prefix).
pub fn chunk_note(title: &str, content: &str, max_chars: usize) -> Vec<Chunk> {
    let body = frontmatter::split(content)
        .map(|f| &content[f.end..])
        .unwrap_or(content);
    let mut sections: Vec<(String, String)> = vec![(String::new(), String::new())];
    let mut in_fence = false;
    for line in body.lines() {
        let trimmed = line.trim_start();
        if trimmed.starts_with("```") {
            in_fence = !in_fence;
        }
        if !in_fence && trimmed.starts_with('#') {
            let heading = trimmed.trim_start_matches('#').trim().to_string();
            sections.push((heading, String::new()));
            continue;
        }
        if let Some((_, text)) = sections.last_mut() {
            text.push_str(line);
            text.push('\n');
        }
    }
    let mut out = Vec::new();
    for (heading, text) in sections {
        for piece in pack(&paragraphs(&text), max_chars) {
            if piece.chars().filter(|c| c.is_alphanumeric()).count() < MIN_ALNUM {
                continue;
            }
            let prefix = if heading.is_empty() {
                title.to_string()
            } else {
                format!("{title} > {heading}")
            };
            let full = format!("{prefix}\n{piece}");
            out.push(Chunk {
                index: u32::try_from(out.len()).unwrap_or(u32::MAX),
                heading: heading.clone(),
                hash: hash(&full),
                text: full,
            });
        }
    }
    out
}

/// Splits text on blank lines.
fn paragraphs(text: &str) -> Vec<String> {
    text.split("\n\n")
        .map(|p| p.trim().to_string())
        .filter(|p| !p.is_empty())
        .collect()
}

/// Joins paragraphs into pieces of at most `max` characters. Over-long paragraphs are cut at
/// sentence ends or, as a last resort, at character boundaries.
fn pack(paras: &[String], max: usize) -> Vec<String> {
    let mut pieces: Vec<String> = Vec::new();
    let mut current = String::new();
    for para in paras {
        for part in split_long(para, max) {
            if !current.is_empty() && current.chars().count() + part.chars().count() + 2 > max {
                pieces.push(std::mem::take(&mut current));
            }
            if !current.is_empty() {
                current.push_str("\n\n");
            }
            current.push_str(&part);
        }
    }
    if !current.is_empty() {
        pieces.push(current);
    }
    pieces
}

fn split_long(para: &str, max: usize) -> Vec<String> {
    if para.chars().count() <= max {
        return vec![para.to_string()];
    }
    let mut out = Vec::new();
    let mut rest: &str = para;
    while rest.chars().count() > max {
        // Find the last sentence end within the limit, else cut at the limit.
        let limit_byte = rest
            .char_indices()
            .nth(max)
            .map(|(i, _)| i)
            .unwrap_or(rest.len());
        let window = &rest[..limit_byte];
        let cut = window
            .rfind(". ")
            .map(|i| i + 1)
            .or_else(|| window.rfind('\n'))
            .filter(|&i| i > 0)
            .unwrap_or(limit_byte);
        out.push(rest[..cut].trim().to_string());
        rest = rest[cut..].trim_start();
    }
    if !rest.is_empty() {
        out.push(rest.to_string());
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn short_note_is_one_chunk_with_title_prefix() {
        let c = chunk_note("Plan", "This is a plan with enough words to keep.", 1000);
        assert_eq!(c.len(), 1);
        assert!(c[0].text.starts_with("Plan\nThis is a plan"));
    }

    #[test]
    fn headings_start_new_chunks() {
        let text = "# One\nFirst section has enough text to be kept here.\n\n## Two\nSecond section also has enough text here.";
        let c = chunk_note("N", text, 1000);
        assert_eq!(c.len(), 2);
        assert_eq!(c[0].heading, "One");
        assert_eq!(c[1].heading, "Two");
        assert!(c[1].text.starts_with("N > Two\n"));
    }

    #[test]
    fn frontmatter_and_code_comments_are_handled() {
        let text = "---\ntitle: X\n---\n```\n# not a heading but a comment in code\n```\nBody text that is long enough to keep.";
        let c = chunk_note("N", text, 1000);
        assert_eq!(c.len(), 1);
        assert!(!c[0].text.contains("title: X"));
        assert_eq!(c[0].heading, "");
    }

    #[test]
    fn long_paragraphs_are_split_within_the_limit() {
        let para = "This is a sentence about firewalls. ".repeat(60);
        let c = chunk_note("N", &para, 500);
        assert!(c.len() > 1);
        for chunk in &c {
            assert!(
                chunk.text.chars().count() <= 500 + "N\n".len() + 5,
                "{}",
                chunk.text.len()
            );
        }
    }

    #[test]
    fn unicode_is_never_cut_mid_character() {
        let text = "åäö ".repeat(400);
        for chunk in chunk_note("N", &text, 200) {
            assert!(chunk.text.is_char_boundary(chunk.text.len()));
        }
    }

    #[test]
    fn hashes_identify_content() {
        let a = chunk_note("N", "A paragraph that is long enough to keep here.", 1000);
        let b = chunk_note("N", "A paragraph that is long enough to keep here.", 1000);
        let c = chunk_note("N", "A different paragraph that is long enough too.", 1000);
        assert_eq!(a[0].hash, b[0].hash);
        assert_ne!(a[0].hash, c[0].hash);
    }

    #[test]
    fn tiny_chunks_are_dropped() {
        assert!(chunk_note("N", "# T\nhi", 1000).is_empty());
    }
}
