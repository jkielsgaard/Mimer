//! Markdown helpers: frontmatter, wiki-links and tag extraction.

pub mod frontmatter;
pub mod links;
pub mod note_tags;
pub mod tags;

use pulldown_cmark::{Event, Options, Parser, Tag};
use std::ops::Range;

/// Byte ranges of code blocks and inline code (frontmatter excluded from parsing).
pub fn code_ranges(content: &str) -> Vec<Range<usize>> {
    let start = frontmatter::split(content).map(|f| f.end).unwrap_or(0);
    let body = &content[start..];
    let opts = Options::ENABLE_STRIKETHROUGH | Options::ENABLE_TABLES | Options::ENABLE_TASKLISTS;
    let mut out = Vec::new();
    for (event, range) in Parser::new_ext(body, opts).into_offset_iter() {
        match event {
            Event::Start(Tag::CodeBlock(_)) | Event::Code(_) => {
                out.push(range.start + start..range.end + start)
            }
            _ => {}
        }
    }
    out
}

/// True when `pos` lies inside any of the ranges.
pub fn in_ranges(ranges: &[Range<usize>], pos: usize) -> bool {
    ranges.iter().any(|r| r.contains(&pos))
}

/// First `# ` heading outside code, if any.
pub fn first_heading(content: &str) -> Option<String> {
    let start = frontmatter::split(content).map(|f| f.end).unwrap_or(0);
    let code = code_ranges(content);
    let mut offset = start;
    for line in content[start..].split_inclusive('\n') {
        if !in_ranges(&code, offset) {
            if let Some(h) = line.strip_prefix("# ") {
                let h = h.trim();
                if !h.is_empty() {
                    return Some(h.to_string());
                }
            }
        }
        offset += line.len();
    }
    None
}
