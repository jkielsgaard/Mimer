//! Checks Mimer runs on a note the AI changed, before the change is shown for review.
//!
//! A small local model can drop a paragraph, change a date or wrap the note in "Here is the
//! corrected note:". These checks compare the new text with the old one. A change that fails a
//! check is still shown, but it is not accepted by default and the review says why.

use crate::markdown::{code_ranges, frontmatter, links, tags};
use regex::Regex;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::sync::LazyLock;
use ts_rs::TS;

/// The result of one check.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct CheckResult {
    /// For example "Links kept".
    pub label: String,
    pub ok: bool,
    /// What went wrong, when it failed.
    pub detail: Option<String>,
}

static NUMBER_RE: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r"\d+").expect("valid number regex"));
static MD_LINK_RE: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r"\]\(([^)\s]+)\)").expect("valid link regex"));
static WORD_RE: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r"[\p{L}][\p{L}\p{N}'’-]*").expect("valid word regex"));

/// The new text may be shorter, but not by more than this (a model that stops half-way).
const MIN_LENGTH_RATIO: f64 = 0.5;

fn ok(label: &str) -> CheckResult {
    CheckResult {
        label: label.into(),
        ok: true,
        detail: None,
    }
}

fn failed(label: &str, detail: String) -> CheckResult {
    CheckResult {
        label: label.into(),
        ok: false,
        detail: Some(detail),
    }
}

/// Counts how often each item occurs.
fn counts<I: IntoIterator<Item = String>>(items: I) -> HashMap<String, usize> {
    let mut m = HashMap::new();
    for i in items {
        *m.entry(i).or_insert(0) += 1;
    }
    m
}

/// The items of `old` that occur fewer times in `new`, sorted, at most five.
fn missing(old: &HashMap<String, usize>, new: &HashMap<String, usize>) -> Vec<String> {
    let mut out: Vec<String> = old
        .iter()
        .filter(|(k, n)| new.get(*k).copied().unwrap_or(0) < **n)
        .map(|(k, _)| k.clone())
        .collect();
    out.sort();
    out.truncate(5);
    out
}

fn link_targets(text: &str) -> HashMap<String, usize> {
    let mut all: Vec<String> = links::parse_wikilinks(text)
        .into_iter()
        .map(|l| format!("[[{}]]", l.target.trim()))
        .collect();
    all.extend(
        MD_LINK_RE
            .captures_iter(text)
            .filter_map(|c| c.get(1).map(|m| m.as_str().to_string())),
    );
    counts(all)
}

fn numbers(text: &str) -> HashMap<String, usize> {
    counts(NUMBER_RE.find_iter(text).map(|m| m.as_str().to_string()))
}

fn code_blocks(text: &str) -> Vec<String> {
    code_ranges(text)
        .into_iter()
        .filter_map(|r| text.get(r).map(|s| s.trim().to_string()))
        .filter(|s| s.contains('\n'))
        .collect()
}

/// Words that start with a capital letter in the middle of a sentence: names of people,
/// companies and products. A word at the start of a line, a sentence or a heading is skipped.
fn names(text: &str) -> HashMap<String, usize> {
    let mut out = Vec::new();
    for line in text.lines() {
        let body = line.trim_start_matches(['#', '>', '-', '*', ' ', '\t']);
        let mut prev_end = 0usize;
        let mut first = true;
        for m in WORD_RE.find_iter(body) {
            let word = m.as_str();
            let before = body[prev_end..m.start()].trim_end();
            let sentence_start = first
                || before.ends_with(['.', '!', '?', ':', '(', '"', '“', '['])
                || before.ends_with(char::is_numeric);
            first = false;
            prev_end = m.end();
            let upper = word.chars().next().is_some_and(char::is_uppercase);
            if upper && !sentence_start && word.chars().count() >= 2 {
                out.push(word.to_string());
            }
        }
    }
    counts(out)
}

fn word_count(text: &str) -> usize {
    WORD_RE.find_iter(text).count()
}

/// Words a model puts in front of the answer instead of starting with the note itself.
fn has_preamble(original: &str, new: &str) -> bool {
    let first = |t: &str| {
        t.lines()
            .map(str::trim)
            .find(|l| !l.is_empty())
            .unwrap_or("")
            .to_lowercase()
    };
    let (old, new) = (first(original), first(new));
    if old == new {
        return false;
    }
    const OPENERS: [&str; 10] = [
        "here is",
        "here's",
        "sure",
        "certainly",
        "below is",
        "of course",
        "her er",
        "selvfølgelig",
        "the corrected",
        "the rewritten",
    ];
    OPENERS.iter().any(|o| new.starts_with(o))
}

/// Compares the changed note with the original. Only checks that apply are returned: a note
/// without links gets no "Links kept" line.
pub fn check_change(original: &str, new: &str) -> Vec<CheckResult> {
    let mut out = Vec::new();

    let (old_links, new_links) = (link_targets(original), link_targets(new));
    if !old_links.is_empty() {
        let gone = missing(&old_links, &new_links);
        out.push(if gone.is_empty() {
            ok("Links kept")
        } else {
            failed("Links kept", format!("Missing: {}", gone.join(", ")))
        });
    }

    let (old_tags, new_tags) = (
        counts(tags::extract_tags(original)),
        counts(tags::extract_tags(new)),
    );
    if !old_tags.is_empty() {
        let gone: Vec<String> = old_tags
            .keys()
            .filter(|t| !new_tags.contains_key(*t))
            .map(|t| format!("#{t}"))
            .collect();
        out.push(if gone.is_empty() {
            ok("Tags kept")
        } else {
            failed("Tags kept", format!("Missing: {}", gone.join(", ")))
        });
    }

    let (old_names, new_names) = (names(original), names(new));
    if !old_names.is_empty() {
        let new_words: std::collections::HashSet<&str> =
            WORD_RE.find_iter(new).map(|m| m.as_str()).collect();
        let mut gone: Vec<String> = old_names
            .keys()
            .filter(|n| !new_words.contains(n.as_str()) && !new_names.contains_key(*n))
            .cloned()
            .collect();
        gone.sort();
        gone.truncate(5);
        out.push(if gone.is_empty() {
            ok("Names kept")
        } else {
            failed("Names kept", format!("Missing: {}", gone.join(", ")))
        });
    }

    let (old_numbers, new_numbers) = (numbers(original), numbers(new));
    if !old_numbers.is_empty() {
        let gone = missing(&old_numbers, &new_numbers);
        out.push(if gone.is_empty() {
            ok("Numbers and dates kept")
        } else {
            failed(
                "Numbers and dates kept",
                format!("Changed or missing: {}", gone.join(", ")),
            )
        });
    }

    let old_fm = frontmatter::split(original).map(|f| f.yaml.trim().to_string());
    if let Some(fm) = old_fm {
        let new_fm = frontmatter::split(new).map(|f| f.yaml.trim().to_string());
        out.push(if new_fm.as_deref() == Some(fm.as_str()) {
            ok("Properties kept")
        } else {
            failed(
                "Properties kept",
                "The properties block at the top was changed".into(),
            )
        });
    }

    let old_code = code_blocks(original);
    if !old_code.is_empty() {
        let new_code = code_blocks(new);
        let gone = old_code.iter().filter(|c| !new_code.contains(c)).count();
        out.push(if gone == 0 {
            ok("Code kept")
        } else {
            failed("Code kept", format!("{gone} code block(s) changed"))
        });
    }

    let (old_words, new_words) = (word_count(original), word_count(new));
    #[allow(clippy::cast_precision_loss)]
    let ratio = if old_words == 0 {
        1.0
    } else {
        new_words as f64 / old_words as f64
    };
    out.push(if old_words < 40 || ratio >= MIN_LENGTH_RATIO {
        ok("Nothing left out")
    } else {
        failed(
            "Nothing left out",
            format!("The new text has {new_words} words, the note had {old_words}"),
        )
    });

    out.push(if has_preamble(original, new) {
        failed(
            "No extra text",
            "The answer starts with words that are not part of the note".into(),
        )
    } else {
        ok("No extra text")
    });
    out
}

/// True when every check passed.
pub fn all_ok(checks: &[CheckResult]) -> bool {
    checks.iter().all(|c| c.ok)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn get<'a>(c: &'a [CheckResult], label: &str) -> Option<&'a CheckResult> {
        c.iter().find(|x| x.label == label)
    }

    #[test]
    fn a_faithful_translation_passes() {
        let old = "# Møde med Acme\n\nMette fra Acme vil have licens til 40 brugere. Spørg Peter om rabat.\nSe [[Prisliste]]. Aftalen udløber 31. december. #licens\n";
        let new = "# Meeting with Acme\n\nMette from Acme wants a licence for 40 users. Ask Peter about a discount.\nSee [[Prisliste]]. The agreement ends on 31 December. #licens\n";
        let c = check_change(old, new);
        assert!(all_ok(&c), "{c:?}");
        assert!(get(&c, "Links kept").is_some());
        assert!(get(&c, "Names kept").is_some());
        assert!(get(&c, "Numbers and dates kept").is_some());
    }

    #[test]
    fn a_changed_date_a_lost_link_and_a_lost_name_are_caught() {
        let old = "Mette from Acme called. See [[Prisliste]]. Ends 31 December.";
        let new = "She called. See the price list. Ends 1 December.";
        let c = check_change(old, new);
        assert!(!get(&c, "Links kept").unwrap().ok);
        assert!(!get(&c, "Numbers and dates kept").unwrap().ok);
        let names = get(&c, "Names kept").unwrap();
        assert!(!names.ok);
        assert!(names.detail.as_deref().unwrap().contains("Acme"));
    }

    #[test]
    fn a_dropped_half_and_a_preamble_are_caught() {
        let old = "word ".repeat(100);
        let c = check_change(&old, &"word ".repeat(30));
        assert!(!get(&c, "Nothing left out").unwrap().ok);
        let c = check_change(
            "# Notes\n\ntext",
            "Here is the corrected note:\n\n# Notes\n\ntext",
        );
        assert!(!get(&c, "No extra text").unwrap().ok);
    }

    #[test]
    fn properties_and_code_must_stay_the_same() {
        let old = "---\ntags: [a]\n---\n# T\n\n```\nlet x = 1;\nlet y = 2;\n```\n";
        let same = check_change(old, &old.replace("# T", "# Title"));
        assert!(all_ok(&same), "{same:?}");
        let changed = check_change(old, &old.replace("let y = 2;", "let y = 3;"));
        assert!(!get(&changed, "Code kept").unwrap().ok);
        let fm = check_change(old, &old.replace("tags: [a]", "tags: [b]"));
        assert!(!get(&fm, "Properties kept").unwrap().ok);
    }

    #[test]
    fn words_at_the_start_of_a_sentence_are_not_names() {
        let n = names("Today we met. Tomorrow we go.\n- Buy milk\n# Plan for the week");
        assert!(n.is_empty(), "{n:?}");
        let n = names("we met Mette and Peter at Acme");
        assert_eq!(n.len(), 3);
    }
}
