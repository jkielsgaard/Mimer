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

/// How a lead-in line starts. The apostrophe is normalised first, so `Here’s` and `Here's` are the
/// same.
const OPENERS: [&str; 23] = [
    "here is",
    "here's",
    "here are",
    "here you",
    "sure",
    "certainly",
    "of course",
    "okay",
    "ok,",
    "below is",
    "below are",
    "the following",
    "this is the",
    "revised",
    "rewritten",
    "corrected",
    "improved",
    "shortened",
    "expanded",
    "her er",
    "selvfølgelig",
    "her kommer",
    "rettet",
];

/// How a closing line starts ("Let me know if you want changes.").
const CLOSERS: [&str; 6] = [
    "let me know",
    "i hope",
    "hope this",
    "feel free",
    "i can also",
    "giv besked",
];

fn normalize(s: &str) -> String {
    s.replace(['\u{2019}', '\u{2018}'], "'")
        .trim()
        .to_lowercase()
}

/// Whether a line is the kind of line a model puts in front of its answer.
pub fn is_lead_in(line: &str) -> bool {
    let l = normalize(line);
    OPENERS.iter().any(|o| l.starts_with(o))
}

/// Removes a first line like "Revised text:" or "Here’s the corrected version:" (also after
/// "Sure!"). The text on the same line after the colon is kept. Two such lines in a row go.
pub fn strip_lead_in(text: &str) -> String {
    let mut t = text.trim().to_string();
    for _ in 0..2 {
        let (first, rest) = t.split_once('\n').unwrap_or((&t, ""));
        if first.chars().count() > 90 || !is_lead_in(first) {
            break;
        }
        let Some((head, after)) = first.split_once(':') else {
            break;
        };
        if head.split_whitespace().count() > 9 {
            break;
        }
        let after = after.trim();
        t = if after.is_empty() {
            rest.trim().to_string()
        } else if rest.is_empty() {
            after.to_string()
        } else {
            format!("{after}\n{rest}").trim().to_string()
        };
    }
    t
}

/// Removes a last paragraph like "Let me know if you want changes." when it is short.
pub fn strip_closer(text: &str) -> String {
    let t = text.trim_end();
    if let Some((body, last)) = t.rsplit_once("\n\n") {
        let l = normalize(last);
        if l.chars().count() <= 160 && CLOSERS.iter().any(|c| l.starts_with(c)) {
            return body.trim_end().to_string();
        }
    }
    t.to_string()
}

/// The text to offer as a replacement: no reasoning, no lead-in or closing line, no code fence.
pub fn clean_replacement(text: &str) -> String {
    strip_fence(&strip_lead_in(&strip_closer(&strip_think(text))))
}

/// A whole rewritten note: cleaned like a replacement, but a lead-in is kept when the note itself
/// begins that way, so the note's own first line is never cut.
pub fn clean_note_answer(original: &str, answer: &str) -> String {
    let first = original
        .lines()
        .find(|l| !l.trim().is_empty())
        .unwrap_or("");
    let cleaned = strip_closer(&strip_think(answer));
    if is_lead_in(first) {
        return strip_fence(&cleaned);
    }
    strip_fence(&strip_lead_in(&cleaned))
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
    fn a_curly_apostrophe_and_a_friendly_opening_are_removed_too() {
        assert_eq!(
            strip_lead_in("Here\u{2019}s the revised version:\n\nThe cat sat."),
            "The cat sat."
        );
        assert_eq!(
            strip_lead_in("Sure! Here's the revised version:\nThe cat sat."),
            "The cat sat."
        );
        assert_eq!(
            strip_lead_in("Selvfølgelig. Her er den rettede tekst:\nKatten sad."),
            "Katten sad."
        );
    }

    #[test]
    fn a_closing_line_is_removed_but_a_normal_last_paragraph_is_kept() {
        assert_eq!(
            strip_closer("The cat sat.\n\nLet me know if you want it shorter."),
            "The cat sat."
        );
        assert_eq!(
            strip_closer("The cat sat.\n\nThe dog ran."),
            "The cat sat.\n\nThe dog ran."
        );
    }

    #[test]
    fn a_rewritten_note_keeps_a_first_line_that_the_note_had_itself() {
        let own = "Here is the plan:\n\n- one";
        assert_eq!(
            clean_note_answer(own, "Here is the plan:\n\n- two"),
            "Here is the plan:\n\n- two"
        );
        assert_eq!(
            clean_note_answer(
                "# Plan\n\n- one",
                "Here\u{2019}s the revised version:\n\n# Plan\n\n- two"
            ),
            "# Plan\n\n- two"
        );
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
