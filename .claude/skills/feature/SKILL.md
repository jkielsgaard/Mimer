---
name: feature
description: Make one change to Mimer from a brief (new feature, change everywhere, change in one place, bug or look into), with a change plan the owner approves first and a change report after. Use for /feature, or when the owner asks for a change to the app.
---

# Make a change to Mimer

The owner does not read code. They must be able to see, before anything is built, where a change will land, and correct it. Follow these steps in order. Talk to the owner in Danish; everything written to the repository is English.

## 1. The brief

Take the brief the owner gave (format in `docs/BRIEF.md`). If it is a list, split it into one brief per change, show them as a short numbered list, and ask which to start with. Ask about anything that changes the outcome (kind, where, what must not change); look up what the code can tell you yourself.

## 2. Find the areas

Read `docs/AREAS.md` and the `CLAUDE.md` of each area the change may touch. Find the files with search, and `pnpm areas of <path>` to see their area. For "Change everywhere", find every place the shared part is used and list them. For "Change in one place", make sure the change does not reach other places through a shared component; if it would, say so in the plan.

For a UI change, show a design first (Artifact type "design", built from `docs/UX-GUIDE.md` and `docs/design-system/`) and wait for approval. Reuse what exists; a new pattern is named as new.

## 3. The change plan, then wait

Show this, and wait for the owner's ok before writing code:

```text
Change plan: <title>
Kind:       <kind>
Areas:      <area>, <area>
Files:
  <area>    <path>    <one line: what changes>
  ...
Reuses:     <shared components, existing functions>
Not touched: <areas or places deliberately left alone>
Docs:       <CHANGELOG, help topic, MANUAL_TESTS, DECISIONS, UX-GUIDE>
Risk:       <what could go wrong, or "none">
```

## 4. Build inside the plan

- Branch: `feat/<name>`, `fix/<name>` or `chore/<name>` from `main`.
- Follow `CLAUDE.md` and the area's `CLAUDE.md`. Use the shared components; never a raw `<button>`, `<input>`, `<textarea>` or `<select>`.
- Needing a file outside the plan: stop, say which and why, and wait.
- Add tests for new logic. Run the checks (frontend with Node 22; Rust in the `mimer-dev` distrobox).

## 5. The change report

Run `pnpm areas report main --plan "<planned areas, comma-separated>"`. Show the report to the owner, explain every line marked NOT IN THE PLAN, and say what was checked (tests, lint) and what was not (for example "not tried in the running app").

## 6. Finish

Update `CHANGELOG.md` (`[Unreleased]`), the help topic, `docs/MANUAL_TESTS.md`, `docs/DECISIONS.md` and the UX guide where affected. Do not commit, merge or release unless the owner asks; then use `/release`.
