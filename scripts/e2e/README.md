# Smoke tests and screenshots in a real browser

The app's screens are drawn by the real frontend (`pnpm exec vite` on port 1420) in a headless
Chromium. A pretend backend in `harness.mjs` answers every Tauri command the frontend calls, from a
small demo vault kept in memory, so nothing needs the desktop app and no one's own notes are used.
The clock is fixed at 2026-10-30 09:15, so every picture has the same "today".

## Run

```bash
pnpm exec playwright install chromium   # once
pnpm e2e                                # nine checks, one line each, exit code 1 on a failure
pnpm screenshots                        # rewrites the ten pictures in docs/screenshots/ (1920 x 1080)
```

Look at the pictures before you commit them. `pnpm e2e` is not part of `pnpm check` (it needs a
browser); CI runs it in its own job.

## Add a check

Add a `check("name", async (page) => { … })` in `smoke.mjs`. A check gets a fresh page; a page error
fails it too. Prefer a role or a placeholder to a text: a name that matches two elements fails in
Playwright's strict mode (the Outline panel has a button "Add a tag" as well as the box in the Tags
window). The same name can be in the left panel and on the Notes page: `.last()` is the Notes page.

## A command with no answer

The log of a page lists `unknown <command>` for a Tauri command that `harness.mjs` does not answer
(it answers `null`). Add an entry to `answers` in `harness.mjs` with the shape the type in
`src/bindings/` says. The task reader there is a small copy of the one in `src-tauri/src/tasks/`:
enough for the demo vault.

## Never

- Never start or stop Vite with `pkill -f`; it also stops the shell that runs it. `server.mjs` stops
  its own child by pid.
- Never use real notes, paths or names in the demo vault.
