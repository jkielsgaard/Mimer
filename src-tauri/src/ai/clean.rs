//! Cleans what a model answers: reasoning blocks, "Revised text:" lead-ins, and answers that
//! cannot be used as a replacement. Small models do all of these, and none of it should reach
//! the user's note.

use super::skill_run::strip_fence;

const OPEN: &str = "<think>";
const CLOSE: &str = "</think>";

/// Removes `<think>…</think>` from a stream one chunk at a time. A tag may be split between two
/// chunks, so the end of a chunk that could be the start of a tag is held back until it is clear.
#[derive(Debug, Default)]
pub struct ThinkFilter {
    pending: String,
    inside: bool,
    /// The text right after a block starts with blank lines that are not wanted.
    trim_next: bool,
}

impl ThinkFilter {
    /// A new filter.
    pub fn new() -> Self {
        Self::default()
    }

    /// Takes the next chunk and returns the text that is safe to show.
    pub fn push(&mut self, chunk: &str) -> String {
        self.pending.push_str(chunk);
        let mut out = String::new();
        loop {
            if self.inside {
                if let Some(i) = self.pending.find(CLOSE) {
                    self.pending.drain(..i + CLOSE.len());
                    self.inside = false;
                    self.trim_next = true;
                    continue;
                }
                // Keep only what could be the start of the closing tag.
                let keep = held_back(&self.pending, CLOSE);
                let cut = self.pending.len() - keep;
                self.pending.drain(..cut);
                break;
            }
            if let Some(i) = self.pending.find(OPEN) {
                out.push_str(&self.take_text(i));
                self.pending.drain(..OPEN.len());
                self.inside = true;
                continue;
            }
            let keep = held_back(&self.pending, OPEN);
            let n = self.pending.len() - keep;
            out.push_str(&self.take_text(n));
            break;
        }
        out
    }

    /// The text left when the stream ends. Nothing is shown from an unfinished block.
    pub fn finish(&mut self) -> String {
        if self.inside {
            self.pending.clear();
            return String::new();
        }
        let n = self.pending.len();
        self.take_text(n)
    }

    fn take_text(&mut self, n: usize) -> String {
        let text: String = self.pending.drain(..n).collect();
        if self.trim_next {
            let t = text.trim_start();
            if !t.is_empty() {
                self.trim_next = false;
            }
            return t.to_string();
        }
        text
    }
}

/// How many bytes at the end of `s` are the beginning of `tag` (and so must wait for more text).
fn held_back(s: &str, tag: &str) -> usize {
    (1..tag.len())
        .rev()
        .find(|&k| s.len() >= k && s.is_char_boundary(s.len() - k) && s.ends_with(&tag[..k]))
        .unwrap_or(0)
}

/// Removes the reasoning from a whole answer. Some models leave out the opening tag and only
/// write the closing one, so everything before a lone closing tag is reasoning too.
pub fn strip_think(text: &str) -> String {
    let text = match (text.find(OPEN), text.rfind(CLOSE)) {
        (None, Some(i)) => &text[i + CLOSE.len()..],
        (Some(o), Some(c)) if c < o => &text[c + CLOSE.len()..],
        _ => text,
    };
    let mut f = ThinkFilter::new();
    let mut out = f.push(text);
    out.push_str(&f.finish());
    out.trim().to_string()
}

/// Lead-ins that models put before the replacement text, such as "Revised text:".
const LEAD_WORDS: [&str; 6] = [
    "revised",
    "rewritten",
    "corrected",
    "improved",
    "shortened",
    "expanded",
];

/// Removes a first line like "Revised text:" or "Here is the corrected version:". The text on
/// the same line after the colon is kept.
pub fn strip_lead_in(text: &str) -> String {
    let t = text.trim();
    let (first, rest) = t.split_once('\n').unwrap_or((t, ""));
    let lower = first.trim().to_lowercase();
    let short = first.chars().count() <= 60;
    let by_word = LEAD_WORDS.iter().any(|w| lower.starts_with(w));
    let by_here = lower.starts_with("here is") || lower.starts_with("here's");
    if short && (by_word || by_here) {
        if let Some((head, after)) = first.split_once(':') {
            if head.split_whitespace().count() <= 6 {
                let after = after.trim();
                return if after.is_empty() {
                    rest.trim().to_string()
                } else if rest.is_empty() {
                    after.to_string()
                } else {
                    format!("{after}\n{rest}").trim().to_string()
                };
            }
        }
    }
    t.to_string()
}

/// The text to offer as a replacement: no reasoning, no lead-in, no code fence.
pub fn clean_replacement(text: &str) -> String {
    strip_fence(&strip_lead_in(&strip_think(text)))
}

/// Whether a cleaned answer can be a replacement for `original`. A rewrite that is empty, or
/// that has lost nearly all of the text, is a failed answer and not a suggestion to delete it.
/// `may_shrink` is for commands that are meant to make the text much shorter.
pub fn usable_replacement(original: &str, answer: &str, may_shrink: bool) -> Result<(), String> {
    let (o, a) = (
        original.trim().chars().count(),
        answer.trim().chars().count(),
    );
    if a == 0 {
        return Err("the answer was empty".into());
    }
    let floor = if may_shrink { 10 } else { 30 };
    if o >= 40 && a * 100 < o * floor {
        return Err("the answer lost most of the text".into());
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn stream(chunks: &[&str]) -> String {
        let mut f = ThinkFilter::new();
        let mut out = String::new();
        for c in chunks {
            out.push_str(&f.push(c));
        }
        out.push_str(&f.finish());
        out
    }

    #[test]
    fn reasoning_is_removed_even_when_a_tag_is_split() {
        assert_eq!(
            stream(&["<thi", "nk>my thoughts</th", "ink>\n\nThe text"]),
            "The text"
        );
        assert_eq!(stream(&["Hello ", "<think>x</think>world"]), "Hello world");
        assert_eq!(stream(&["a < b and <t"]), "a < b and <t");
    }

    #[test]
    fn an_unfinished_block_shows_nothing() {
        assert_eq!(stream(&["Text <think>still thinking"]), "Text ");
    }

    #[test]
    fn a_whole_answer_is_cleaned() {
        assert_eq!(strip_think("<think>a</think>\nresult"), "result");
        assert_eq!(strip_think("thinking aloud</think>result"), "result");
        assert_eq!(strip_think("plain"), "plain");
    }

    #[test]
    fn lead_ins_are_removed_but_normal_text_is_kept() {
        assert_eq!(strip_lead_in("Revised text:\nHello"), "Hello");
        assert_eq!(strip_lead_in("Revised text: Hello"), "Hello");
        assert_eq!(
            strip_lead_in("Here is the corrected version:\n\nA\nB"),
            "A\nB"
        );
        assert_eq!(
            strip_lead_in("Updated: the plan is ready"),
            "Updated: the plan is ready"
        );
        assert_eq!(strip_lead_in("Hello there"), "Hello there");
    }

    #[test]
    fn the_whole_clean_up_works_together() {
        let raw = "<think>Let me fix it.</think>\nRevised text: The cat sat.";
        assert_eq!(clean_replacement(raw), "The cat sat.");
    }

    #[test]
    fn empty_or_gutted_answers_are_not_used() {
        let original = "This is a longer text that should stay about as long as it was.";
        assert!(usable_replacement(original, "", false).is_err());
        assert!(usable_replacement(original, "ok", false).is_err());
        assert!(usable_replacement(original, "ok", true).is_err());
        assert!(usable_replacement(original, "Short but fine text.", true).is_ok());
        assert!(usable_replacement(original, original, false).is_ok());
        assert!(usable_replacement("hi", "Hello", false).is_ok());
    }
}
