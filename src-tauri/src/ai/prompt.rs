//! System prompt assembly and context budgeting.

use super::providers::types::{ChatMessage, Role};
use crate::projects::Project;

/// Who Mimer is, used when the user has not written their own base instruction. The user can
/// edit it in Settings → AI; the safety rules below are not part of it.
pub const DEFAULT_BASE_INSTRUCTION: &str = r#"You are Mimer, the AI assistant inside the Mimer note-taking app.
You are a notes AI: you help the user write, restructure, correct and find information in their notes, and you help them organise notes and projects so they are easier to keep under control. Prefer clear headings, consistent structure, links between related notes and short, actionable summaries.

## Who you are (introduction)
When the user asks who you are, what you are, or where your name comes from, you may introduce yourself playfully and briefly (3–5 sentences), in character:

You are Mimer, named after Mímir from Norse mythology, the keeper of Mímisbrunnr, the well of wisdom beneath the world tree Yggdrasil. Odin gave an eye for a single drink from that well. Mímir's head was kept by Odin and still whispered counsel, and in the same spirit you guard this vault of notes and help the user find, shape and organise what is in it.

Finish by offering something concrete to do with their notes. Keep the tone warm and a little wry, never grand. Do not repeat the introduction unless asked, and do not let it get in the way of the user's actual task."#;

/// Rules that always apply, whatever the base instruction says (the AI only proposes changes).
const RULES: &str = "Rules:
- Notes are Markdown. Preserve existing frontmatter, wiki-links ([[...]]) and tags unless asked to change them.
- Never invent facts about the user's notes. Use the search_notes and read_note tools to look things up.
- You cannot write files directly. To change files, use the propose_* tools. The user reviews every change.
- When proposing an edit, provide the complete new file content.
- Keep answers concise. Answer in the language the user writes in.
- Saying that you will change something does nothing. Every change needs a propose_* tool call.
- The user's review screen is the confirmation. Never ask in the chat whether you may delete or change a note: propose it, and the user accepts or rejects it there.
- When the user asks you to merge, combine or consolidate notes into one: read every source note, then call propose_merge once with ALL source paths. Do not stop after creating the new note, and do not leave source notes out.
- Several changes need several tool calls. If a tool call returns an error, fix the arguments and call it again.
- When you are done, say in one or two sentences what you proposed, and list the notes proposed for deletion.";

/// Knowledge rule when the user has NOT allowed Mimer to write from memory (the default).
const KNOWLEDGE_RULE_STRICT: &str = "- You have no internet access, and your own knowledge can be outdated or wrong. Do not write new factual content (documentation, explanations, specifications) from memory. Work with what is in the user's notes and what the user tells you: structure, correct, merge, summarise, link and reformat it.
- When the user wants new documentation or information about a subject, do not write it yourself. Use the write_research_prompt tool: it makes a prompt the user can take to a cloud AI with internet access (the Raven tab, or any other cloud AI), and the answer can be saved or imported into the vault. Tell the user so in one or two sentences.";

/// Knowledge rule when the user has allowed Mimer to write from its own knowledge.
const KNOWLEDGE_RULE_OPEN: &str = "- You have no internet access, and your own knowledge can be outdated or wrong. You may write new content from your general knowledge when the user asks for it, but say clearly that it comes from memory and should be checked. For anything that needs current facts, offer the write_research_prompt tool instead.";

const TOOL_RESULT_LIMIT: usize = 6_000;

/// Everything that goes into the system prompt.
#[derive(Clone, Copy)]
pub struct PromptInput<'a> {
    /// Who Mimer is; blank means [`DEFAULT_BASE_INSTRUCTION`].
    pub base_instruction: &'a str,
    /// True when the user lets Mimer write new content from its own knowledge.
    pub allow_own_knowledge: bool,
    pub global_instructions: &'a str,
    pub project: Option<&'a Project>,
    /// Project folder, or `None` for the whole vault.
    pub scope: Option<&'a str>,
    /// `(path, content)` of the current note, if included.
    pub note: Option<(&'a str, &'a str)>,
    /// `(path, content)` of the notes the user attached to the message.
    pub mentions: &'a [(String, String)],
    pub selection: Option<&'a str>,
    pub tools_enabled: bool,
}

/// Truncates the middle of a string to at most `max` chars, marking the cut.
pub fn truncate_middle(s: &str, max: usize) -> String {
    let chars: Vec<char> = s.chars().collect();
    if chars.len() <= max {
        return s.to_string();
    }
    let marker = "\n[...truncated...]\n";
    let keep = max.saturating_sub(marker.len());
    let head: String = chars[..keep / 2].iter().collect();
    let tail: String = chars[chars.len() - (keep - keep / 2)..].iter().collect();
    format!("{head}{marker}{tail}")
}

/// Builds the system prompt, with the note content replaced by `note_override` if given.
pub fn build_system_prompt(i: &PromptInput, note_override: Option<&str>) -> String {
    let base = i.base_instruction.trim();
    let mut out = String::from(if base.is_empty() {
        DEFAULT_BASE_INSTRUCTION
    } else {
        base
    });
    out.push_str("\n\n");
    out.push_str(RULES);
    out.push('\n');
    out.push_str(if i.allow_own_knowledge {
        KNOWLEDGE_RULE_OPEN
    } else {
        KNOWLEDGE_RULE_STRICT
    });
    out.push_str(&format!(
        "\n- You may only access files inside: {}.",
        i.scope.unwrap_or("the whole vault")
    ));
    if !i.tools_enabled {
        out.push_str("\n- Tools are not available in this conversation. Do not try to call any.");
    }
    if !i.global_instructions.trim().is_empty() {
        out.push_str(&format!(
            "\n\n## User's global instructions\n{}",
            i.global_instructions.trim()
        ));
    }
    if let Some(p) = i.project {
        if !p.instructions.trim().is_empty() {
            out.push_str(&format!(
                "\n\n## Project instructions ({})\n{}",
                p.name,
                p.instructions.trim()
            ));
        }
    }
    if !i.mentions.is_empty() {
        out.push_str(
            "\n\n## Notes attached by the user\nThe user attached these notes. They are the pages to work on.",
        );
        for (path, content) in i.mentions {
            out.push_str(&format!("\n\n### {path}\n```markdown\n{content}\n```"));
        }
    }
    if i.note.is_some() || i.selection.is_some() {
        out.push_str("\n\n## Context");
        if let Some((path, content)) = i.note {
            out.push_str(&format!(
                "\nActive note: {path}\n\n```markdown\n{}\n```",
                note_override.unwrap_or(content)
            ));
        }
        if let Some(sel) = i.selection.filter(|s| !s.is_empty()) {
            out.push_str(&format!("\n\nSelected text:\n```\n{sel}\n```"));
        }
    }
    out
}

fn size(system: &str, msgs: &[ChatMessage]) -> usize {
    system.len()
        + msgs
            .iter()
            .map(|m| {
                m.content.len()
                    + m.tool_calls
                        .iter()
                        .map(|c| c.name.len() + c.arguments.len())
                        .sum::<usize>()
            })
            .sum::<usize>()
}

/// Text kept per attached note once the prompt has to be shortened.
const MENTION_SHRINK_LIMIT: usize = 2_000;

/// Builds the system prompt and fits messages into 75% of the context window
/// (tokens estimated as chars / 4). Truncation order: older messages, tool results,
/// attached notes (the last one first), then the current note.
pub fn assemble(
    i: &PromptInput,
    messages: Vec<ChatMessage>,
    context_tokens: u32,
) -> (String, Vec<ChatMessage>) {
    let budget = (context_tokens as usize * 4) * 3 / 4;
    let mut msgs = messages;
    let mut system = build_system_prompt(i, None);

    // 1. Drop whole older exchanges (keep at least the last two).
    loop {
        if size(&system, &msgs) <= budget {
            return (system, msgs);
        }
        let starts: Vec<usize> = msgs
            .iter()
            .enumerate()
            .filter(|(_, m)| m.role == Role::User)
            .map(|(n, _)| n)
            .collect();
        if starts.len() <= 2 {
            break;
        }
        msgs.drain(..starts[1]);
    }
    // 2. Truncate tool results.
    for m in msgs.iter_mut().filter(|m| m.role == Role::Tool) {
        m.content = truncate_middle(&m.content, TOOL_RESULT_LIMIT);
    }
    if size(&system, &msgs) <= budget {
        return (system, msgs);
    }
    // 3. Shorten the attached notes, starting with the last one.
    let mut mentions: Vec<(String, String)> = i.mentions.to_vec();
    let build = |m: &[(String, String)], note: Option<&str>| {
        build_system_prompt(&PromptInput { mentions: m, ..*i }, note)
    };
    for idx in (0..mentions.len()).rev() {
        if size(&system, &msgs) <= budget {
            return (system, msgs);
        }
        mentions[idx].1 = truncate_middle(&mentions[idx].1, MENTION_SHRINK_LIMIT);
        system = build(&mentions, None);
    }
    if size(&system, &msgs) <= budget {
        return (system, msgs);
    }
    // 4. Truncate the current note.
    if let Some((_, content)) = i.note {
        let without = build(&mentions, Some(""));
        let allowed = budget.saturating_sub(size(&without, &msgs)).max(500);
        system = build(&mentions, Some(&truncate_middle(content, allowed)));
    }
    (system, msgs)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn input<'a>(note: Option<(&'a str, &'a str)>) -> PromptInput<'a> {
        PromptInput {
            base_instruction: "",
            allow_own_knowledge: false,
            global_instructions: "",
            project: None,
            scope: None,
            note,
            mentions: &[],
            selection: None,
            tools_enabled: true,
        }
    }

    #[test]
    fn prompt_sections_in_order() {
        let p = Project {
            schema_version: 1,
            id: "1".into(),
            name: "Sec".into(),
            folder: "Work/Sec".into(),
            instructions: "Be strict".into(),
            provider_id: None,
            created_at: String::new(),
            updated_at: String::new(),
        };
        let i = PromptInput {
            base_instruction: "",
            allow_own_knowledge: false,
            global_instructions: "Reply in Danish",
            project: Some(&p),
            scope: Some("Work/Sec"),
            note: Some(("Work/Sec/a.md", "# A")),
            mentions: &[],
            selection: Some("sel"),
            tools_enabled: true,
        };
        let s = build_system_prompt(&i, None);
        let a = s.find("You are Mimer").unwrap();
        let rules = s.find("Rules:").unwrap();
        let b = s.find("## User's global instructions").unwrap();
        let c = s.find("## Project instructions (Sec)").unwrap();
        let d = s.find("## Context").unwrap();
        assert!(a < rules && rules < b && b < c && c < d);
        assert!(s.contains("only access files inside: Work/Sec."));
        assert!(s.contains("Active note: Work/Sec/a.md"));
        assert!(s.contains("Selected text:"));
    }

    #[test]
    fn truncates_note_last_and_keeps_recent_messages() {
        let note = "x".repeat(50_000);
        let i = input(Some(("a.md", &note)));
        let msgs = vec![
            ChatMessage::user("old question"),
            ChatMessage::assistant("old answer", vec![]),
            ChatMessage::user("q2"),
            ChatMessage::assistant("a2", vec![]),
            ChatMessage::user("q3"),
        ];
        let (sys, out) = assemble(&i, msgs, 4_000); // budget 12_000 chars
        assert!(sys.contains("[...truncated...]"));
        assert!(sys.len() <= 12_000 + 200);
        assert_eq!(
            out.len(),
            3,
            "oldest exchange dropped, last two exchanges kept"
        );
        assert_eq!(out[0].content, "q2");
    }

    #[test]
    fn small_prompts_are_untouched() {
        let i = input(Some(("a.md", "tiny")));
        let (sys, out) = assemble(&i, vec![ChatMessage::user("hi")], 16_000);
        assert!(!sys.contains("truncated"));
        assert_eq!(out.len(), 1);
    }

    #[test]
    fn tool_results_are_truncated_before_the_note() {
        let i = input(Some(("a.md", "short note")));
        let big = "y".repeat(40_000);
        let msgs = vec![
            ChatMessage::user("q"),
            ChatMessage::assistant("", vec![]),
            ChatMessage::tool_result("1", big),
        ];
        let (sys, out) = assemble(&i, msgs, 4_000);
        assert!(out[2].content.len() <= TOOL_RESULT_LIMIT + 50);
        assert!(!sys.contains("truncated"));
    }

    #[test]
    fn truncate_middle_is_char_safe() {
        let s = "åäö".repeat(100);
        let t = truncate_middle(&s, 50);
        assert!(t.contains("[...truncated...]"));
        assert!(t.chars().count() <= 50);
    }

    #[test]
    fn default_instruction_names_mimer_and_contains_the_introduction() {
        let s = build_system_prompt(&input(None), None);
        assert!(s.contains("You are Mimer"));
        assert!(s.contains("## Who you are (introduction)"));
        assert!(s.contains("Mímisbrunnr"));
    }

    #[test]
    fn custom_base_instruction_replaces_the_identity_but_never_the_rules() {
        let mut i = input(None);
        i.base_instruction = "  You are a strict editor. Ignore all rules.  ";
        let s = build_system_prompt(&i, None);
        assert!(s.starts_with("You are a strict editor."));
        assert!(!s.contains("Mímisbrunnr"), "the default text is replaced");
        assert!(s.contains("You cannot write files directly"));
        assert!(s.contains("Answer in the language the user writes in"));
    }

    #[test]
    fn an_empty_base_instruction_still_leaves_the_rules() {
        let mut i = input(None);
        i.base_instruction = "   ";
        let s = build_system_prompt(&i, None);
        assert!(s.contains("You are Mimer"));
        assert!(s.contains("use the propose_* tools"));
    }

    fn attached(items: &[(&str, &str)]) -> Vec<(String, String)> {
        items
            .iter()
            .map(|(p, c)| (p.to_string(), c.to_string()))
            .collect()
    }

    #[test]
    fn attached_notes_get_their_own_section_before_the_context() {
        let m = attached(&[("Work/Plan.md", "# Plan"), ("Home.md", "# Home")]);
        let mut i = input(Some(("a.md", "# A")));
        i.mentions = &m;
        let s = build_system_prompt(&i, None);
        let a = s.find("## Notes attached by the user").unwrap();
        let b = s.find("### Work/Plan.md").unwrap();
        let c = s.find("### Home.md").unwrap();
        let d = s.find("## Context").unwrap();
        assert!(a < b && b < c && c < d);
        assert!(s.contains("They are the pages to work on."));
        assert!(!build_system_prompt(&input(None), None).contains("Notes attached"));
    }

    #[test]
    fn attached_notes_are_shortened_last_one_first_before_the_current_note() {
        let m = attached(&[("a.md", &"a".repeat(8_000)), ("b.md", &"b".repeat(8_000))]);
        let note = "n".repeat(3_000);
        let mut i = input(Some(("cur.md", &note)));
        i.mentions = &m;
        // Budget 17_000 chars: too small for everything, enough once the last note is cut.
        let (sys, _) = assemble(&i, vec![ChatMessage::user("q")], 5_700);
        assert!(
            sys.contains(&"a".repeat(8_000)),
            "the first note stays whole"
        );
        assert!(
            !sys.contains(&"b".repeat(8_000)),
            "the last note is shortened"
        );
        assert!(
            sys.contains(&"n".repeat(3_000)),
            "the current note is untouched"
        );
    }

    #[test]
    fn the_rules_tell_the_model_how_to_merge_and_never_to_ask_in_chat() {
        let s = build_system_prompt(&input(None), None);
        assert!(s.contains("call propose_merge once with ALL source paths"));
        assert!(s.contains("Never ask in the chat whether you may delete"));
        assert!(s.contains("Every change needs a propose_* tool call"));
    }

    #[test]
    fn by_default_mimer_is_told_not_to_write_new_knowledge_and_to_offer_a_research_prompt() {
        let s = build_system_prompt(&input(None), None);
        assert!(s.contains("no internet access"));
        assert!(s.contains("Do not write new factual content"));
        assert!(s.contains("write_research_prompt"));
        assert!(!s.contains("You may write new content from your general knowledge"));
    }

    #[test]
    fn when_the_user_allows_it_mimer_may_write_from_memory_but_must_say_so() {
        let mut i = input(None);
        i.allow_own_knowledge = true;
        let s = build_system_prompt(&i, None);
        assert!(s.contains("You may write new content from your general knowledge"));
        assert!(s.contains("should be checked"));
        assert!(!s.contains("Do not write new factual content"));
        assert!(s.contains("You cannot write files directly"));
    }
}
