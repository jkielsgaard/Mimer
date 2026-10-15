> **Status: implemented in 0.3.0.** See docs/DECISIONS.md (section Version 0.3.0) and CHANGELOG.md. The text below is the original plan.

# Feature 11 – Make it clear that Mimer is working, and how far it has come

Branch: `feat/ai-progress`. Read [README.md](README.md) first (rules, definition of done).

## The problem today

While Mimer works, the chat shows only a static "Thinking…". Tool activity ("Searched notes for …") appears **after** each tool has finished, a local model that is still loading can be silent for a long time, and nothing shows that a multi-step task is on step 3 of 15. It can look as if nothing happens.

## What the user gets

- A **live status line** in the answer bubble with a spinner and a clear phase, for example:
  - "Mimer is waiting for the model… 12 s" (nothing received yet)
  - "Mimer is writing… 340 words" (text is streaming)
  - "Reading Work/Plan.md…" (a tool is running, shown **before** it runs)
  - "Step 3 of 15" next to the phase when Mimer is using tools in several rounds
- A **stall hint** after 15 s without any news: "Still waiting for the model. A local model may be loading. You can press Stop."
- A small **"Mimer is working…" indicator in the status bar** and a dot on the Mimer tab, so it is visible even when another tab is open.
- An **elapsed timer**. A real percentage is not possible (the length of an answer is unknown), so the bar is indeterminate and the **step counter** is the honest measure of progress.

## Decisions (already made – do not change)

| Question                 | Decision                                                                                                                                             | Why                                                                                       |
| ------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| Real percentage?         | No. Show phase, elapsed seconds and "Step n of 15".                                                                                                  | A fake percentage would mislead.                                                          |
| New events               | Two new `ChatEvent` variants: `Step { step, max }` (before each model call) and `ToolStart { name, detail }` (before a tool runs).                   | The frontend can work out "waiting" and "writing" itself from `TextDelta`.                |
| Where is the timer?      | In the frontend (a 1-second tick while streaming), not in Rust.                                                                                      | No extra traffic; works even when the backend is silent, which is exactly the stall case. |
| Persisted?               | No. Progress is shown live only; the existing `activity` lines (finished tools) are still saved.                                                     | Progress is meaningless after a restart.                                                  |
| Does it cover inline AI? | Yes, a spinner and the elapsed timer in the inline popup (it already has a busy state; add the timer). Project "Ask AI" too, if it has no indicator. | Same problem, small change.                                                               |
| Accessibility            | The status line has `role="status"` and `aria-live="polite"`; the spinner is `aria-hidden`; the timer text is not announced every second.            | Screen readers must not be spammed.                                                       |

## Tasks (in order)

### Task 1 – Events (S)

1. `src-tauri/src/ai/mod.rs`: add `Step { step: u32, max: u32 }` and `ToolStart { name: String, detail: String }` to `ChatEvent`. Regenerate bindings (from `src-tauri/`).
2. `ai/agent.rs`: send `Step` at the top of each loop iteration; send `ToolStart` just before `tools::execute` / `semantic_tool`, with `detail` from a new pure function `tools::describe_call(call) -> String` ("Reading Work/Plan.md", "Searching notes for 'firewall'", "Proposing an edit to …"). Never include note **content** in `detail`.
3. Tests for `describe_call` (all tools, bad arguments, very long arguments are shortened to 60 characters).

### Task 2 – Store (S)

`src/stores/chatStore.ts`: add to the last assistant message a transient `progress` object `{ phase, step, max, detail, startedAt, lastEventAt, words }` (not saved by `toStored`). `applyEvent` updates it: `step` → phase "waiting"; `toolStart` → phase "tool"; `textDelta` → phase "writing" and word count; `done`/`error` → cleared. `send` sets phase "connecting" at once. Tests for every transition and that `toStored` drops `progress`.

### Task 3 – Hook and component (M)

1. `src/features/chat/useElapsed.ts`: `useElapsed(startedAt, active)` returns seconds, ticking every second only while active; clears its interval on unmount.
2. `src/features/chat/ProgressLine.tsx`: spinner (lucide `Loader2` with `animate-spin`), phase text, step counter, elapsed time; after 15 s without `lastEventAt` change show the stall hint. Respect `prefers-reduced-motion` (no spin, use a pulsing dot).
3. `Bubble.tsx` shows `ProgressLine` instead of "Thinking…" while the message is streaming. `ChatPanel.tsx` loses the old "Thinking…" line.
4. Tests (fake timers): phases render the right text; the stall hint appears after 15 s and disappears on new text; the timer stops after `done`.

### Task 4 – Elsewhere (S)

- `components/layout/StatusBar.tsx`: when the chat is streaming show "Mimer is working…" before the version. `components/layout/Tabs.tsx` (right panel): a dot on the Mimer tab while streaming. Component tests.
- Inline AI popup (`features/inlineAi/InlineAiPopup.tsx`): show the elapsed timer next to its spinner. Test it.

### Task 5 – Docs (S)

README (chat), `docs/MANUAL_TESTS.md`, `CHANGELOG.md`, `docs/DECISIONS.md` (why no percentage).

## Manual test

- [ ] Send a message with LM Studio stopped: an error appears quickly (not an endless spinner).
- [ ] With a slow or just-started model: the line shows "waiting… 5 s, 6 s…" and after 15 s the hint; Stop works.
- [ ] Ask "split this note into one note per heading": the line shows "Step 1 of 15", "Reading …", "Step 2 …" and ends with a review card.
- [ ] Switch to the Files tab during an answer: the status bar says "Mimer is working…" and the Mimer tab has a dot.
- [ ] After the answer the line disappears and the saved chat does not contain progress text.

## Definition of done

`pnpm check` green, bindings regenerated, tests for every task, manual list ticked.
