# Brief: how to ask for a change

Copy the block below into the chat, one brief per change. Fill in what you know; leave a line empty if you do not know, and Claude asks. A long list of ideas is fine too: Claude turns it into one brief per change and asks you which to start with.

```text
Kind:        New feature | Change everywhere | Change in one place | Bug | Look into
Area(s):     (from docs/AREAS.md, or "don't know")
What:        What should be different, in your own words.
Why:         What is hard or wrong today (helps choose the right solution).
Where:       The screen, button or menu, as you see it ("Tasks → a task → Write what happened").
Must not change: What should stay as it is.
Done when:   How you will check it ("bold text in a log line is shown bold").
Example:     Optional: a screenshot, a note, a text that shows it.
```

What happens next:

1. Claude asks about anything unclear, then shows a **change plan**: the areas, each file and what changes in it, what is reused, what is deliberately not touched, and the docs that change. For a change to how something looks, a **design** comes first.
2. You answer "ok", or correct the plan ("not Meetings", "the editor too").
3. Claude builds on a branch and stays inside the plan; if a file outside it is needed, Claude stops and asks.
4. Claude shows the **change report** (`pnpm areas report`): every changed file by area, with anything outside the plan marked.
5. You try it. Commit, merge and release only when you say so.

## Kinds

- **New feature**: something that does not exist yet. It reuses the shared components and follows the UX guide.
- **Change everywhere**: the same change on every screen (for example every multi-line text box). Made in the shared component, so it reaches every place; the plan lists the places it reaches.
- **Change in one place**: only where you point; other places stay as they are, even if they look alike.
- **Bug**: something that does not work as described. The report says what the cause was.
- **Look into**: no code; Claude investigates and comes back with options and a recommendation.
