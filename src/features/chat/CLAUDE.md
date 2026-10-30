# AI

Everything the AI does for notes: the chat ("Ask about my notes"), the fixed commands on selected text (`inlineAi`), in any text box (`fieldAi`), on a note, a folder, search, tasks and ideas, skills carried out note by note, proposals and their review (`proposals`), projects with AI instructions (`projects`). Rust: `src-tauri/src/ai/` (router, prompts, tools, agent, inline, proposals, providers), `chats/`, `skills/`, `projects/`.

- `ai::router::select_notes` is the only way to a provider. Notes go to a local AI, or to a cloud AI only after `ai.cloudConsent`, never in a Local AI only project.
- The AI never writes: every change is a proposal the person accepts (snapshot commit before, commit after).
- A command does one fixed thing and its output is only the result (no "Here is…"); clean it (`ai/clean.rs`) before it is shown.
