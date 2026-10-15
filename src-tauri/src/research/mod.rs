//! Research prompts: text the user takes to a cloud AI that has internet access.
//!
//! Mimer has no internet access and only knows what it was trained on, so for new documentation
//! it is better to ask an AI that can search. The prompt built here tells that AI what to find
//! and, just as important, in which format to answer, so the answer can be imported into the
//! vault and read by Mimer afterwards (title, sources, open questions).

use crate::error::{AppError, AppResult};
use serde::{Deserialize, Serialize};
use ts_rs::TS;

/// Longest topic accepted (characters).
pub const MAX_TOPIC: usize = 300;
/// Longest free-text field accepted (characters).
pub const MAX_FIELD: usize = 2_000;

/// What the user wants researched.
#[derive(Debug, Clone, Deserialize, TS)]
#[serde(rename_all = "camelCase", default)]
#[ts(export)]
pub struct ResearchSpec {
    pub topic: String,
    /// What the document is for (optional).
    pub goal: String,
    pub audience: String,
    /// `overview`, `detailed` or `expert`.
    pub depth: String,
    /// The language of the answer, for example `English` or `Danish`.
    pub language: String,
    /// `documentation`, `howto`, `comparison`, `summary` or `checklist`.
    pub kind: String,
    /// What the user already has or needs to fit in (optional).
    pub context: String,
}

impl Default for ResearchSpec {
    fn default() -> Self {
        Self {
            topic: String::new(),
            goal: String::new(),
            audience: String::new(),
            depth: "detailed".into(),
            language: "English".into(),
            kind: "documentation".into(),
            context: String::new(),
        }
    }
}

/// A finished prompt for the chat card.
#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct ResearchCard {
    pub title: String,
    pub text: String,
}

fn clip(s: &str, max: usize) -> String {
    s.trim().chars().take(max).collect()
}

fn kind_text(kind: &str) -> &'static str {
    match kind {
        "howto" => "a step-by-step how-to guide",
        "comparison" => "a comparison of the options, with a table and a recommendation",
        "summary" => "a short, factual summary of the current state of knowledge",
        "checklist" => "a practical checklist with a short explanation for each item",
        _ => "technical documentation",
    }
}

fn depth_text(depth: &str) -> &'static str {
    match depth {
        "overview" => "an overview that fits on one or two pages",
        "expert" => "in depth, for specialists, with details, edge cases and trade-offs",
        _ => "detailed enough to work from, without going into rare edge cases",
    }
}

/// Builds the prompt. `today` is the date to put in the document (`YYYY-MM-DD`).
pub fn build_prompt(spec: &ResearchSpec, today: &str) -> AppResult<String> {
    let topic = clip(&spec.topic, MAX_TOPIC);
    if topic.is_empty() {
        return Err(AppError::InvalidPath(
            "Say what the research should be about".into(),
        ));
    }
    let goal = clip(&spec.goal, MAX_FIELD);
    let audience = clip(&spec.audience, MAX_FIELD);
    let context = clip(&spec.context, MAX_FIELD);
    let language = match clip(&spec.language, 40).as_str() {
        "" => "English".to_string(),
        l => l.to_string(),
    };
    let or = |s: &str, fallback: &str| {
        if s.is_empty() {
            fallback.to_string()
        } else {
            s.to_string()
        }
    };
    Ok(format!(
        "You are a careful research assistant with access to the internet. Research the topic below and write one document that I will paste into my notes app.

## Task
- Topic: {topic}
- What it is for: {goal}
- Audience: {audience}
- Type of document: {kind}
- Depth: {depth}
- Write the document in: {language}
- Today's date: {today}

## What I already have
{context}

## Rules
- Use current, reliable sources. Prefer primary sources: official documentation, standards bodies, vendors and peer-reviewed work.
- Do not invent facts, version numbers, figures, quotes or URLs. If you cannot verify something, say so under \"Open questions\" instead of guessing.
- Support every important claim with a source from the list at the end.
- Mark anything that changes quickly (versions, prices, dates, laws) with the date you checked it.
- Stay on the topic. No introductions about yourself and no filler.

## Output format (follow it exactly; my notes app reads it)
Reply with ONE Markdown document only: no text before or after it, and no code fence around it. Use exactly this structure.

---
title: <a short, descriptive title>
source: cloud-ai-research
topic: {topic}
created: {today}
status: needs review
---
# <the same short title>

## Summary
<3 to 6 sentences>

## <sections that suit the type of document and the depth, with clear headings>
<content>

## Sources
- [Page title](https://full-url) - what it supports - accessed {today}

## Open questions
- <what you could not verify, or what depends on my situation>
",
        goal = or(&goal, "(not specified)"),
        audience = or(&audience, "a general technical reader"),
        kind = kind_text(&spec.kind),
        depth = depth_text(&spec.depth),
        context = or(&context, "Nothing specific."),
    ))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn spec(topic: &str) -> ResearchSpec {
        ResearchSpec {
            topic: topic.into(),
            ..ResearchSpec::default()
        }
    }

    #[test]
    fn the_prompt_names_the_topic_the_date_and_the_answer_format() {
        let p = build_prompt(&spec("Zero trust networking"), "2026-10-14").unwrap();
        assert!(p.contains("Topic: Zero trust networking"));
        assert!(p.contains("Today's date: 2026-10-14"));
        assert!(p.contains("source: cloud-ai-research"));
        assert!(p.contains("status: needs review"));
        assert!(p.contains("## Sources"));
        assert!(p.contains("## Open questions"));
        assert!(p.contains("Do not invent facts"));
        assert!(p.contains("no code fence around it"));
    }

    #[test]
    fn no_placeholder_from_the_template_is_left_unfilled() {
        let p = build_prompt(&spec("x"), "2026-10-14").unwrap();
        assert!(!p.contains("{topic}") && !p.contains("{today}") && !p.contains("{goal}"));
        assert!(p.contains("What it is for: (not specified)"));
        assert!(p.contains("Nothing specific."));
    }

    #[test]
    fn choices_change_the_wording() {
        let mut s = spec("Backups");
        s.kind = "checklist".into();
        s.depth = "overview".into();
        s.language = "Danish".into();
        s.goal = "Prepare an audit".into();
        s.audience = "IT managers".into();
        s.context = "We use Veeam.".into();
        let p = build_prompt(&s, "2026-10-14").unwrap();
        assert!(p.contains("a practical checklist"));
        assert!(p.contains("one or two pages"));
        assert!(p.contains("Write the document in: Danish"));
        assert!(p.contains("What it is for: Prepare an audit"));
        assert!(p.contains("Audience: IT managers"));
        assert!(p.contains("We use Veeam."));
    }

    #[test]
    fn an_empty_topic_is_refused_and_long_fields_are_cut() {
        assert!(build_prompt(&spec("   "), "2026-10-14").is_err());
        let mut s = spec(&"t".repeat(1_000));
        s.context = "c".repeat(10_000);
        let p = build_prompt(&s, "2026-10-14").unwrap();
        assert!(p.contains(&"t".repeat(MAX_TOPIC)));
        assert!(!p.contains(&"t".repeat(MAX_TOPIC + 1)));
        assert!(!p.contains(&"c".repeat(MAX_FIELD + 1)));
    }

    #[test]
    fn an_unknown_kind_or_depth_falls_back_to_the_defaults() {
        let mut s = spec("x");
        s.kind = "nonsense".into();
        s.depth = "nonsense".into();
        let p = build_prompt(&s, "2026-10-14").unwrap();
        assert!(p.contains("technical documentation"));
        assert!(p.contains("detailed enough to work from"));
    }
}
