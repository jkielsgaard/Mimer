# Research: custom themes

Status: report only. Goal: the person can choose colours (for example the purple of buttons), without everything turning one flat colour: the writing area one shade, the panels another.

## What exists today

- Light and dark. `src/index.css` holds 16 colour tokens for each (`--background`, `--sidebar`, `--card`, `--muted`, `--accent`, `--primary`, `--border`, `--ring`, …). The setting is System, Light or Dark; the dark mode is the CSS class `dark` on the page (`settingsStore.ts`).
- Every screen uses the tokens through Tailwind classes, so a change to a token reaches the whole app. Count of use: `bg-muted` 94 times, `bg-accent` 64, `bg-card` 37, `bg-background` 31, `bg-primary` 29, `bg-sidebar` 15.
- The editor has its own theme (`editorTheme.ts`, about 48 colour lines) that also reads the tokens.
- The design system documents the same tokens and roles (`docs/design-system/tokens.json`).

This is a good starting point: a theme is just a different set of values for the same tokens.

## The risk the owner named

If the person picks one grey as the background, and all surfaces are derived as that grey, the app becomes flat. The tokens already separate the roles that must stay different: the **writing area** (`background`), the **side panels and bars** (`sidebar`), **raised things** (`card`: dialogs, menus, widgets), the **hover** (`muted`) and the **selected** (`accent`). A theme must keep those apart.

## Options

1. **A few ready themes (lowest risk).** Add named themes (for example Light, Dark, Sepia, Slate, High contrast) as sets of the 16 tokens. Nothing for the person to get wrong. Every pair is checked for contrast once, by us.
2. **Accent colour only.** One colour picker for `primary` (the purple). Mimer derives `accent`, `ring` and the text colours from it so contrast holds, in both light and dark. Small, safe, and answers "make the purple button another colour".
3. **Custom colours per role.** Settings → Appearance lists the roles with plain names ("Writing area", "Side panels", "Buttons and highlights", "Selected", "Raised"), each with a colour. Mimer checks contrast live (text on each surface 4.5:1) and refuses or warns on a pair that cannot be read. This is the full request.
4. **Import a theme file.** Later: a theme is a small JSON file of the tokens, shareable. Needs options 1 and 3 first.

## How option 3 avoids flat results

- The person picks **one base colour and one accent**, and Mimer generates the 16 tokens from them as a **set of related shades**: the writing area is the base, the panels a step darker, raised things a step lighter, hover and selected steps toward the accent (the way the current tokens relate: panel 3 % darker, card lighter, hover 4 % tinted). The person can then open "Advanced" and set any single role.
- Contrast is calculated with the same rule as the UX guide (text 4.5:1). A choice that fails is shown with the reason and the nearest colour that works.

## What a change touches

Areas: Shared UI (`index.css`, a theme module), Settings (a new Appearance section), App shell (applying the theme on start: set the CSS variables on the page from the saved choice). No change in the screens themselves, since they already use the tokens. The editor theme needs a check, because it has a few fixed colours of its own. A design is needed for the Settings section and a preview.

## Storage

Per computer (browser storage like the time format), or in the settings file if the owner wants the theme to follow the person to other computers. Per computer is simplest and matches how the Linux and Windows machines differ.

## Recommendation

Do option 2 first (accent colour, with the live contrast check), together with one or two more ready themes (option 1, for example a calm light-grey and a high-contrast one). If the owner then still wants more, add option 3 with the generated shades. Start with the design of the Appearance section.

## Questions for the owner

- Is "choose the colour of the buttons and highlights" enough as a first step?
- Should a theme follow the person across computers?
- Do you want a high-contrast theme for readability?
